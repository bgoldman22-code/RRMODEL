'use strict';
/**
 * Generates predictions using team form JSON + schedule + odds.
 * - Uses global fetch (Node 18). No node-fetch import.
 * - Calls other Netlify functions via INTERNAL_FUNCTIONS_URL in prod, or http://localhost:8888 in dev.
 */
const { getStore } = require("@netlify/blobs");

function getNflStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  try {
    // Works when Netlify injects Blobs context (Production, most contexts)
    return getStore(name);
  } catch (e) {
    // Manual fallback for contexts where Blobs isn't injected (some previews/local)
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;
    if (!siteID || !token) {
      const msg = "Blobs context missing and no manual credentials provided. Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN.";
      const err = new Error(msg);
      err.code = "MISSING_BLOBS_CREDS";
      throw err;
    }
    return getStore(name, { siteID, token });
  }
}


function baseUrl() {
  if (process.env.INTERNAL_FUNCTIONS_URL) return process.env.INTERNAL_FUNCTIONS_URL;
  if (process.env.NETLIFY_DEV === "true") return "http://localhost:8888/.netlify/functions";
  const site = process.env.URL || process.env.DEPLOY_URL || "http://localhost:8888";
  return new URL("/.netlify/functions", site).toString().replace(/\/$/, "");
}

async function safeJsonFetch(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

exports.handler = async () => {
  try {
    const store = getNflStore();

    const fnBase = baseUrl();
    const scheduleUrl = process.env.NFL_SCHEDULE_URL?.startsWith("http")
      ? process.env.NFL_SCHEDULE_URL
      : `${fnBase}/${(process.env.NFL_SCHEDULE_URL || "nfl-schedule-get").replace(/^\//, "")}`;

    const oddsUrl = process.env.NFL_ODDS_BRIDGE_URL?.startsWith("http")
      ? process.env.NFL_ODDS_BRIDGE_URL
      : `${fnBase}/${(process.env.NFL_ODDS_BRIDGE_URL || "odds-get").replace(/^\//, "")}`;

    const teamFormUrl = process.env.NFLVERSE_TEAM_FORM_URL?.startsWith("http")
      ? process.env.NFLVERSE_TEAM_FORM_URL
      : new URL(process.env.NFLVERSE_TEAM_FORM_URL || "/nflverse-team-form.json", process.env.URL || "http://localhost:8888").toString();

    const [schedule, odds, teamForm] = await Promise.all([
      safeJsonFetch(scheduleUrl),
      safeJsonFetch(oddsUrl),
      safeJsonFetch(teamFormUrl)
    ]);

    const out = { ok: true, updated: new Date().toISOString(), rows: [] };

    // Normalize schedule
    const matchups = Array.isArray(schedule?.matchups) ? schedule.matchups
      : Array.isArray(schedule?.rows) ? schedule.rows
      : Array.isArray(schedule) ? schedule
      : [];

    // Normalize odds into a map
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

        // Positive favors HOME
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

    await getNflStore().setJSON("predictions/current.json", out);
    return { statusCode: 200, body: JSON.stringify({ message: "Predictions generated successfully.", data: out }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Failed to generate predictions.", details: error.message }) };
  }
};
