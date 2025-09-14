'use strict';

/**
 * NFL Predictions Generate
 * - Uses team-form model (EPA-like stub) to compute win probs
 * - Odds only used for labeling (line/price), not for confidence
 * - Always returns row fields the UI expects:
 *    moneylineText, moneylineConf
 *    spreadText,   spreadConf
 *    totalText,    totalConf
 * - Adds verbose logs you can see in Netlify function logs
 */

const fetchJson = async (url) => {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
};

// Environment-provided endpoints; fallback to your deployed URLs
const SCHEDULE_URL = process.env.SCHEDULE_URL || "https://bgroundrobin.com/.netlify/functions/nfl-schedule-get";
const ODDS_URL     = process.env.ODDS_URL     || "https://bgroundrobin.com/.netlify/functions/nfl-odds-bridge";
const FORM_URL     = process.env.TEAM_FORM_URL || "https://bgroundrobin.com/nflverse-team-form.json";

// Utility: percent clamp
const pct = (x) => Math.max(0, Math.min(100, Math.round(x * 100)));
const fmtPct = (x) => `${pct(x)}%`;

// Basic win prob from form numbers (EPA-ish). You can replace with your actual model quickly.
function winProbFromForm(formHome, formAway) {
  // If data missing, return coin flip
  if (typeof formHome !== 'number' || typeof formAway !== 'number') return 0.5;
  const diff = formHome - formAway;          // positive favors home
  const k = 3.5;                              // scaling; tune later
  const prob = 1 / (1 + Math.exp(-diff * k)); // logistic
  return prob;
}

// Build one row with all display fields
function buildRow(m, oddsMap, formMap) {
  const key = m.id;
  const odds = oddsMap.get(key) || null;
  const home = (m.homeTeam || "").toUpperCase();
  const away = (m.awayTeam || "").toUpperCase();

  const homeAbbr = teamAbbr(home);
  const awayAbbr = teamAbbr(away);

  const formHome = formMap.get(homeAbbr);
  const formAway = formMap.get(awayAbbr);

  // Moneyline pick from model (independent of odds)
  const pHome = winProbFromForm(formHome?.form ?? null, formAway?.form ?? null);
  const pickHome = pHome >= 0.5;
  const mlTeam = pickHome ? home : away;
  const mlConf = pickHome ? pHome : 1 - pHome;

  // Spread: determine favored side from odds if present, otherwise align with model
  let spreadText = "–";
  let spreadConf = null;
  if (odds && typeof odds.spread_point === 'number') {
    const fav = odds.spread_point < 0 ? home : away;
    const line = Math.abs(odds.spread_point);
    const price = fav === home ? odds.spread_home_line : odds.spread_away_line;
    spreadText = `${fav.toUpperCase()} ${odds.spread_point < 0 ? '-' : ''}${line} (${price >= 0 ? '+'+price : price})`;
    // crude transform from win prob to ATS confidence
    spreadConf = Math.min(0.9, Math.max(0.5, (Math.abs(pHome - 0.5) * 2 * 0.6) + 0.5));
  }

  // Total: choose over/under using model pace proxy; fall back to neutral 0.54
  let totalText = "–";
  let totalConf = null;
  if (odds && typeof odds.total_points === 'number') {
    // proxy: if both offenses stronger than defenses -> over lean
    const offH = formHome?.off_epa_decayed ?? 0;
    const offA = formAway?.off_epa_decayed ?? 0;
    const defH = formHome?.def_epa_decayed ?? 0;
    const defA = formAway?.def_epa_decayed ?? 0;
    const tilt = (offH + offA) - (defH + defA);
    const chooseOver = tilt > 0;
    totalText = `${chooseOver ? 'OVER' : 'UNDER'} ${odds.total_points}`;
    totalConf = Math.min(0.9, Math.max(0.5, 0.5 + Math.tanh(Math.abs(tilt)) * 0.35));
  }

  // Moneyline label with odds price if available
  let moneylineText = mlTeam;
  if (odds && (typeof odds.ml_home === 'number' || typeof odds.ml_away === 'number')) {
    const price = mlTeam === home ? odds.ml_home : odds.ml_away;
    if (typeof price === 'number') {
      moneylineText = `${mlTeam.toUpperCase()} (${price})`;
    } else {
      moneylineText = mlTeam.toUpperCase();
    }
  } else {
    moneylineText = mlTeam.toUpperCase();
  }

  // Confidence formatting
  const moneylineConf = mlConf;

  const row = {
    id: key,
    matchup: `${away} @ ${home}`,
    kickoff: m.kickoff,
    moneylineText,
    moneylineConf,
    spreadText,
    spreadConf,
    totalText,
    totalConf,
  };

  // Log each row for visibility
  console.log("[PREDICTION]", JSON.stringify({
    id: key, matchup: row.matchup,
    moneylineText, moneylineConf: fmtPct(moneylineConf),
    spreadText, spreadConf: spreadConf ? fmtPct(spreadConf) : "–",
    totalText, totalConf: totalConf ? fmtPct(totalConf) : "–",
    sources: { haveOdds: !!odds, haveForm: !!(formHome && formAway) }
  }));

  return row;
}

// Map helpers
function mapOddsById(oddsRows) {
  const map = new Map();
  (oddsRows || []).forEach(r => map.set(r.id, r));
  return map;
}

function teamAbbr(nameUpper) {
  // crude mapping: use common three-letter if detected; otherwise first 3 letters
  // The team-form JSON in your env uses NFL abbreviations like BUF, NYJ, etc.
  // We'll keep a small map for special cases.
  const map = {
    "LOS ANGELES RAMS": "LA",
    "LOS ANGELES CHARGERS": "LAC",
    "SAN FRANCISCO 49ERS": "SF",
    "NEW YORK JETS": "NYJ",
    "NEW YORK GIANTS": "NYG",
    "JACKSONVILLE JAGUARS": "JAX",
    "TAMPA BAY BUCCANEERS": "TB",
    "KANSAS CITY CHIEFS": "KC",
    "GREEN BAY PACKERS": "GB",
    "NEW ENGLAND PATRIOTS": "NE",
    "ARIZONA CARDINALS": "ARI",
    "LAS VEGAS RAIDERS": "LV",
    "WASHINGTON COMMANDERS": "WAS"
  };
  return map[nameUpper] || nameUpper.split(' ').map(s=>s[0]).join('').slice(0,3);
}

exports.handler = async (event) => {
  try {
    const scheduleResp = await fetchJson(SCHEDULE_URL);
    const matchups = scheduleResp.matchups || [];

    // Fetch odds (optional) and team form (required for model)
    let oddsRows = [];
    try {
      const oddsResp = await fetchJson(ODDS_URL);
      oddsRows = (oddsResp && oddsResp.rows) || [];
    } catch (e) {
      console.warn("No odds available:", e.message);
    }

    let formMap = new Map();
    try {
      const formResp = await fetchJson(FORM_URL);
      const teams = formResp?.team_data || {};
      Object.entries(teams).forEach(([abbr, data]) => {
        formMap.set(abbr, {
          form: data?.form ?? 0,
          off_epa_decayed: data?.decayed_data?.off_epa_decayed ?? 0,
          def_epa_decayed: data?.decayed_data?.def_epa_decayed ?? 0,
        });
      });
    } catch (e) {
      console.warn("No team form available:", e.message);
    }

    const oddsMap = mapOddsById(oddsRows);

    const rows = matchups.map(m => buildRow(m, oddsMap, formMap));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        updated: new Date().toISOString(),
        meta: {
          source: "model-epa-stub",
          schedule_source: scheduleResp?.source || "unknown"
        },
        rows
      })
    };
  } catch (err) {
    console.error("GEN_CRASH", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Function crashed",
        details: { hint: "See function logs", code: "GEN_CRASH", message: err.message }
      })
    };
  }
};