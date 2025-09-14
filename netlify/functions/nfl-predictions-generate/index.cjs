'use strict';
/**
 * netlify/functions/nfl-predictions-generate/index.cjs
 *
 * Robust URL normalization + Blobs auth fallback + Rams/Chargers aliasing.
 * Safe when schedule has no matchups (returns ok with rows: []).
 */

const { getStore } = require('@netlify/blobs');
const fetch = global.fetch || require('node-fetch');
const { computeConfidenceAndDisplay } = require('./confidence.cjs');

// --- Blobs store helper ------------------------------------------------------
function getNflStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  try {
    if (siteID && token) {
      return getStore(name, { siteID, token });
    }
    return getStore(name);
  } catch (e) {
    // Last-resort: try the "object" signature some older snippets use
    try {
      if (siteID && token) {
        return getStore({ name, siteID, token });
      }
    } catch (_) {}
    throw e;
  }
}

// --- Endpoint resolver -------------------------------------------------------
function baseUrl() {
  // Prefer primary site URL when available
  const u = process.env.URL || process.env.SITE_URL || process.env.DEPLOY_URL || '';
  return (u || '').replace(/\/+$/, '');
}

/**
 * Accepts:
 *   - absolute URL: https://... -> returns as-is
 *   - absolute path: /path -> prefixes with site URL (if known) else returns as-is
 *   - bare function name: "nfl-schedule-get" -> turns into {base}/.netlify/functions/nfl-schedule-get
 */
function resolveEndpoint(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^https?:\/\//i.test(s)) return s;

  const site = baseUrl();
  if (s.startsWith('/')) {
    return site ? `${site}${s}` : s;
  }
  // bare name -> assume Netlify function
  return site ? `${site}/.netlify/functions/${s}` : `/.netlify/functions/${s}`;
}

// --- Team alias map (common data-provider name weirdness) --------------------
const TEAM_ALIASES = {
  'LA': 'LAR',                 // Rams legacy code
  'LAR': 'LAR',
  'LOS ANGELES RAMS': 'LAR',
  'LOS ANGELES CHARGERS': 'LAC',
  'SAN FRANCISCO 49ERS': 'SF',
  'N.Y. JETS': 'NYJ',
  'N.Y. GIANTS': 'NYG'
};
function normTeam(t) {
  if (!t) return t;
  const up = String(t).toUpperCase().trim();
  return TEAM_ALIASES[up] || up;
}

// --- Basic EPA-heuristic edge calc ------------------------------------------
function pickFromMetrics(home, away, metrics) {
  const homeM = metrics[home];
  const awayM = metrics[away];
  if (!homeM || !awayM) return null;

  // Simple signal: decayed offense vs opponent defense EPA allowed
  const offEdge =
    (homeM?.decayed_data?.off_epa_decayed ?? homeM?.offense?.epa_per_play ?? 0) -
    (awayM?.defense?.epa_allowed_per_play ?? 0);

  const defEdge =
    (awayM?.decayed_data?.off_epa_decayed ?? awayM?.offense?.epa_per_play ?? 0) -
    (homeM?.defense?.epa_allowed_per_play ?? 0);

  // Thresholds are deliberately small; this is a placeholder heuristic
  if (offEdge > 0.05) return { type: 'spread', team: home, confidence: 0.7 };
  if (defEdge < -0.05) return { type: 'moneyline', team: home, confidence: 0.62 };
  // otherwise lean to home
  return { type: 'moneyline', team: home, confidence: 0.55 };
}

// --- Handler ----------------------------------------------------------------
exports.handler = async (event) => {
  const diagMode = (event?.queryStringParameters?.diag || '').toString();

  // Resolve endpoints robustly even if env vars are just bare names
  const scheduleUrl = resolveEndpoint(process.env.NFL_SCHEDULE_URL || 'nfl-schedule-get');
  const oddsUrl = resolveEndpoint(process.env.NFL_ODDS_BRIDGE_URL || 'nfl-odds-bridge');
  const teamFormUrl = resolveEndpoint(process.env.NFLVERSE_PBP_URL || '/nflverse-team-form.json');

  // Small diagnostics
  if (diagMode === '1' || diagMode === 'resolve' || diagMode === 'fetch') {
    const info = {
      ok: true,
      endpoints: { scheduleUrl, oddsUrl, teamFormUrl },
      creds: {
        storeName: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td',
        hasSiteId: !!process.env.NETLIFY_SITE_ID,
        hasToken: !!process.env.NETLIFY_API_TOKEN,
        baseUrl: baseUrl() || null
      }
    };
    if (diagMode === 'resolve') {
      return { statusCode: 200, body: JSON.stringify(info) };
    }
  }

  // Fetch all inputs (guard absolute/relative)
  let scheduleJson, oddsJson, teamFormJson;
  try {
    const [sRes, oRes, fRes] = await Promise.all([
      fetch(scheduleUrl),
      fetch(oddsUrl),
      fetch(teamFormUrl)
    ]);
    scheduleJson = await sRes.json();
    oddsJson = await oRes.json();
    teamFormJson = await fRes.json();
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'Failed to fetch inputs', details: err.message, scheduleUrl, oddsUrl, teamFormUrl })
    };
  }

  if ((event?.queryStringParameters?.diag || '') === 'fetch') {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, endpoints: { scheduleUrl, oddsUrl, teamFormUrl }, fetch: {
        schedule: { ok: true, status: 200, url: scheduleUrl, json: scheduleJson },
        odds: { ok: true, status: 200, url: oddsUrl, json: oddsJson },
        teamForm: { ok: true, status: 200, url: teamFormUrl, json: teamFormJson }
      } })
    };
  }

  // Prepare output
  const store = getNflStore();
  const out = { ok: true, updated: new Date().toISOString(), rows: [] };

  const teamMetrics = teamFormJson?.team_data || {};
  const matchups = scheduleJson?.matchups || []; // if empty, we'll just write rows: []

  if (!Array.isArray(matchups) || matchups.length === 0) {
    // Save empty-but-valid output so the UI doesn't 404
    await store.setJSON('predictions/current.json', out);
    return { statusCode: 200, body: JSON.stringify({ ok: true, message: 'No matchups found in schedule payload.', data: out }) };
  }

  // Build a quick odds lookup by normalized "AWAY @ HOME"
  const oddsRows = oddsJson?.rows || [];
  const oddsMap = new Map();
  for (const r of oddsRows) {
    const key = `${normTeam(r.away)} @ ${normTeam(r.home)}`;
    oddsMap.set(key, r);
  }

  for (const m of matchups) {
    const home = normTeam(m.homeTeam || m.home || m.home_team);
    const away = normTeam(m.awayTeam || m.away || m.away_team);
    const matchupKey = `${away} @ ${home}`;
    const odds = oddsMap.get(matchupKey);


    const picked = pickFromMetrics(home, away, teamMetrics) || { type: 'moneyline', team: home, confidence: 0.55 };

    // Build base row
    const row = {
      id: m.id || matchupKey,
      matchup: matchupKey,
      kickoff: m.kickoff || m.commence_time || null,
      homeTeam: home,
      awayTeam: away,
      odds
    };

    // Model choice derived from your picker
    const market = (picked.type === 'spread' || picked.type === 'total') ? picked.type : 'moneyline';
    const side = picked.team
      ? (picked.team === home ? 'home' : (picked.team === away ? 'away' : (picked.side || 'home')))
      : (picked.side || 'home');

    row.model_choice = { market, side };
    if (picked.model_probs) row.model_probs = picked.model_probs;

    // Compute display + blended confidence
    computeConfidenceAndDisplay(row, {
      blendWeight: 0.60,
      defaultClamp: [0.52, 0.68],
      odds
    });

    // Back-compat for UI expecting pick + pickLabel
    row.pick = {
      type: market,
      team: (side === 'home' ? home : away),
      confidence: row.confidence,
      pickLabel: `${market}: ${row.displayPick}`
    };

    out.rows.push(row);

  }

  await store.setJSON('predictions/current.json', out);
  return { statusCode: 200, body: JSON.stringify({ ok: true, message: 'Predictions generated.', data: out }) };
};
