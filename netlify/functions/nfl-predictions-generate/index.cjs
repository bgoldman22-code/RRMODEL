'use strict';
/**
 * Generates predictions using team form JSON + schedule + odds.
 * - Uses global fetch (Node 18). No node-fetch import.
 * - Calls other Netlify functions via INTERNAL_FUNCTIONS_URL in prod, or http://localhost:8888 in dev.
 */
const { getStore } = require("@netlify/blobs");

function baseUrl() {
  // Prefer INTERNAL_FUNCTIONS_URL (available in Netlify runtime) for server→server calls
  if (process.env.INTERNAL_FUNCTIONS_URL) return process.env.INTERNAL_FUNCTIONS_URL;
  // Netlify dev default
  if (process.env.NETLIFY_DEV === "true") return "http://localhost:8888/.netlify/functions";
  // Fallback to public URL + functions path
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
    const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
    const store = getStore(storeName);

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

    // Pull inputs
    const [schedule, odds, teamForm] = await Promise.all([
      safeJsonFetch(scheduleUrl),
      safeJsonFetch(oddsUrl),
      safeJsonFetch(teamFormUrl)
    ]);

    const out = { ok: true, updated: new Date().toISOString(), rows: [] };

    // Normalize schedule <- allow different shapes
    const matchups = Array.isArray(schedule.matchups) ? schedule.matchups
      : Array.isArray(schedule.rows) ? schedule.rows
      : Array.isArray(schedule) ? schedule
      : [];

    const byMatchupOdds = new Map();
    if (Array.isArray(odds)) {
      for (const o of odds) {
        const key = o.matchup || o.id || `${o.away}@${o.home}`;
        byMatchupOdds.set(key, o);
      }
    } else if (Array.isArray(odds.rows)) {
      for (const o of odds.rows) {
        const key = o.matchup || o.id || `${o.away}@${o.home}`;
        byMatchupOdds.set(key, o);
      }
    }

    const td = teamForm.team_data || {};

    for (const m of matchups) {
      const home = m.homeTeam || m.home || m.h || m.home_abbr;
      const away = m.awayTeam || m.away || m.a || m.away_abbr;
      if (!home || !away) continue;

      const homeM = td[home];
      const awayM = td[away];

      let pickType = "moneyline", pickTeam = home, confidence = 0.5;

      if (homeM && awayM) {
        const offEdge = (homeM.decayed_data?.off_epa_decayed ?? homeM.offense?.epa_per_play ?? 0) -
                        (awayM.defense?.epa_allowed_per_play ?? 0);
        const defEdge = (awayM.decayed_data?.off_epa_decayed ?? awayM.offense?.epa_per_play ?? 0) -
                        (homeM.defense?.epa_allowed_per_play ?? 0);

        // Translate edges to a pseudo-spread delta (very rough)
        const totalEdge = offEdge - defEdge; // >0 favors home
        if (totalEdge > 0.05) { pickType = "spread"; pickTeam = home; confidence = 0.68; }
        else if (totalEdge < -0.05) { pickType = "spread"; pickTeam = away; confidence = 0.68; }
        else {
          // use odds if available
          const key1 = m.matchup || `${away}@${home}`;
          const oddsRec = byMatchupOdds.get(key1);
          if (oddsRec && (oddsRec.ml_home || oddsRec.ml_away)) {
            // If odds imply home favorite, slight lean
            pickType = "moneyline";
            if (Number(oddsRec.ml_home || 0) < Number(oddsRec.ml_away || 0)) {
              pickTeam = home; confidence = 0.58;
            } else {
              pickTeam = away; confidence = 0.58;
            }
          } else {
            // slight lean to the home team in toss-ups
            pickType = "moneyline"; pickTeam = home; confidence = 0.53;
          }
        }
      } else {
        // Missing team metrics → odds or home lean
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
