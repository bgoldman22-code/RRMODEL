'use strict';
/**
 * Generates predictions using team form JSON + schedule + odds.
 * - Diagnostics:
 *   ?diag=1     -> shows env booleans (no secrets)
 *   ?diag=fetch -> test-fetches schedule/odds/teamform and returns statuses
 */
const { getStore } = require("@netlify/blobs");

function getNflStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  if (siteID && token) return getStore(name, { siteID, token });
  return getStore(name);
}

function storeDiag() {
  return {
    storeName: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td",
    hasSiteId: !!process.env.NETLIFY_SITE_ID,
    hasToken: !!process.env.NETLIFY_API_TOKEN,
    hasInternalFunctionsUrl: !!process.env.INTERNAL_FUNCTIONS_URL,
    url: process.env.URL || null,
    deployUrl: process.env.DEPLOY_URL || null,
    node: process.version
  };
}


function baseUrl() {
  if (process.env.INTERNAL_FUNCTIONS_URL) return process.env.INTERNAL_FUNCTIONS_URL;
  if (process.env.NETLIFY_DEV === "true") return "http://localhost:8888/.netlify/functions";
  const site = process.env.URL || process.env.DEPLOY_URL || "http://localhost:8888";
  return new URL("/.netlify/functions", site).toString().replace(/\/$/, "");
}

async function tryFetchJson(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, url, json, text: json ? undefined : text.slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 0, url, error: e.message };
  }
}

async function safeJsonFetch(url, allowEmpty=false) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
  const j = await res.json();
  if (!allowEmpty && (j == null || (Array.isArray(j) && j.length === 0))) {
    throw new Error(`Empty JSON from ${url}`);
  }
  return j;
}

exports.handler = async (event) => {
  try {
    const fnBase = baseUrl();
    const scheduleUrl = process.env.NFL_SCHEDULE_URL?.startsWith("http")
      ? process.env.NFL_SCHEDULE_URL
      : `${fnBase}/${(process.env.NFL_SCHEDULE_URL || "nfl-schedule-get").replace(/^\//, "")}`;

    const oddsUrl = process.env.NFL_ODDS_BRIDGE_URL?.startsWith("http")
      ? process.env.NFL_ODDS_BRIDGE_URL
      : `${fnBase}/${(process.env.NFL_ODDS_BRIDGE_URL || "nfl-odds-placeholder").replace(/^\//, "")}`;

    const teamFormUrl = process.env.NFLVERSE_TEAM_FORM_URL?.startsWith("http")
      ? process.env.NFLVERSE_TEAM_FORM_URL
      : new URL(process.env.NFLVERSE_TEAM_FORM_URL || "/nflverse-team-form.json", process.env.URL || "http://localhost:8888").toString();

    // Diagnostics
    const qp = event?.queryStringParameters || {};
    if (qp.diag === "1") {
      return { statusCode: 200, body: JSON.stringify({ ok: true, diag: storeDiag() }) };
    }
    if (qp.diag === "fetch") {
      const [s, o, t] = await Promise.all([tryFetchJson(scheduleUrl), tryFetchJson(oddsUrl), tryFetchJson(teamFormUrl)]);
      return { statusCode: 200, body: JSON.stringify({ ok: true, endpoints: { scheduleUrl, oddsUrl, teamFormUrl }, fetch: { schedule: s, odds: o, teamForm: t } }) };
    }

    // Real generate
    const [schedule, odds, teamForm] = await Promise.all([
      safeJsonFetch(scheduleUrl),
      safeJsonFetch(oddsUrl, /*allowEmpty*/ true),
      safeJsonFetch(teamFormUrl)
    ]);

    const store = getNflStore();
    const out = { ok: true, updated: new Date().toISOString(), rows: [] };

    // Normalize schedule
    const matchups = Array.isArray(schedule?.matchups) ? schedule.matchups
      : Array.isArray(schedule?.rows) ? schedule.rows
      : Array.isArray(schedule) ? schedule
      : [];

    // Normalize odds into a map (may be empty)
    const byMatchupOdds = new Map();
    const addOdds = (o) => {
      const key = o.matchup || o.id || `${o.away || o.a}@${o.home || o.h}`;
      if (key) byMatchupOdds.set(key, o);
    };
    if (Array.isArray(odds)) odds.forEach(addOdds);
    else if (Array.isArray(odds?.rows)) odds.rows.forEach(addOdds);

    const td = teamForm?.team_data || {};

    for (const m of matchups) {
      const home = m.homeTeam || m.home || m.h || m.home_abbr;
      const away = m.awayTeam || m.away || m.a || m.away_abbr;
      if (!home || !away) continue;

      const homeM = td[home];
      const awayM = td[away];

      let pickType = "moneyline", pickTeam = home, confidence = 0.5;

      if (homeM && awayM) {
        const homeOff = homeM?.decayed_data?.off_epa_decayed ?? homeM?.offense?.epa_per_play ?? 0;
        const awayDef = awayM?.defense?.epa_allowed_per_play ?? 0;
        const awayOff = awayM?.decayed_data?.off_epa_decayed ?? awayM?.offense?.epa_per_play ?? 0;
        const homeDef = homeM?.defense?.epa_allowed_per_play ?? 0;
        const totalEdge = (homeOff - awayDef) - (awayOff - homeDef);

        if (totalEdge > 0.05) { pickType = "spread"; pickTeam = home; confidence = 0.68; }
        else if (totalEdge < -0.05) { pickType = "spread"; pickTeam = away; confidence = 0.68; }
        else {
          const key1 = m.matchup || `${away}@${home}`;
          const oddsRec = byMatchupOdds.get(key1);
          if (oddsRec && (oddsRec.ml_home || oddsRec.ml_away)) {
            pickType = "moneyline";
            if (Number(oddsRec.ml_home || 0) < Number(oddsRec.ml_away || 0)) {
              pickTeam = home; confidence = 0.58;
            } else {
              pickTeam = away; confidence = 0.58;
            }
          } else {
            pickType = "moneyline"; pickTeam = home; confidence = 0.53;
          }
        }
      } else {
        pickType = "moneyline"; pickTeam = home; confidence = 0.54;
      }

      out.rows.push({
        id: m.id || `${away}@${home}`,
        matchup: `${away} @ ${home}`,
        kickoff: m.kickoff || m.start || null,
        pick: { type: pickType, team: pickTeam, confidence }
      });
    }

    await store.setJSON("predictions/current.json", out);
    return { statusCode: 200, body: JSON.stringify({ message: "Predictions generated successfully.", data: out }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Failed to generate predictions.", details: error.message }) };
  }
};
