'use strict';
/**
 * netlify/functions/nfl-predictions-generate/index.cjs
 *
 * Reads schedule, odds, and team form; writes predictions/current.json to Blobs.
 * Fixes Blobs credential fallback + normalizes team names from TheOddsAPI to abbreviations.
 */
const { getStore } = require("@netlify/blobs");
const fs = require("fs");
const path = require("path");

function getNflStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  if (siteID && token) return getStore(name, { siteID, token });
  return getStore(name);
}

function urlJoin(base, suffix) {
  if (!base) return suffix;
  if (base.endsWith("/")) base = base.slice(0, -1);
  if (!suffix.startsWith("/")) suffix = "/" + suffix;
  return base + suffix;
}

// Load aliases bundled with function (fallback if fetch fails to join names).
let TEAM_ALIASES = null;
try {
  const p = path.join(__dirname, "..", "..", "..", "data", "nfl-team-aliases.json");
  TEAM_ALIASES = JSON.parse(fs.readFileSync(p, "utf8"));
} catch (_) {
  TEAM_ALIASES = {};
}
function nameToAbbr(name) {
  return TEAM_ALIASES[name] || name;
}

function impliedProb(american) {
  if (american == null) return null;
  const a = Number(american);
  if (!Number.isFinite(a)) return null;
  return a > 0 ? 100 / (a + 100) : -a / (-a + 100);
}

exports.handler = async (event) => {
  const wantDiag = event && event.queryStringParameters && event.queryStringParameters.diag;
  const baseUrl = process.env.URL || process.env.DEPLOY_URL || ""; // Netlify provides these
  const scheduleUrl = process.env.NFL_SCHEDULE_URL || urlJoin(baseUrl, "/.netlify/functions/nfl-schedule-get");
  const oddsUrl = process.env.NFL_ODDS_BRIDGE_URL || urlJoin(baseUrl, "/.netlify/functions/nfl-odds-bridge");
  const teamFormUrl = process.env.NFLVERSE_PBP_URL || urlJoin(baseUrl, "/nflverse-team-form.json");

  // Fetch inputs
  const [schRes, odRes, tfRes] = await Promise.all([
    fetch(scheduleUrl), fetch(oddsUrl), fetch(teamFormUrl)
  ]);
  const schedule = await schRes.json();
  const odds = await odRes.json();
  const teamForm = await tfRes.json();

  if (wantDiag === "fetch") {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, endpoints: { scheduleUrl, oddsUrl, teamFormUrl }, fetch: { 
        schedule: { ok: schRes.ok, status: schRes.status, url: schRes.url, json: schedule },
        odds: { ok: odRes.ok, status: odRes.status, url: odRes.url, json: odds },
        teamForm: { ok: tfRes.ok, status: tfRes.status, url: tfRes.url, json: { updated: teamForm.updated, seasons: teamForm.seasons, sampleTeams: Object.keys(teamForm.team_data).slice(0,4) } }
      }})
    };
  }

  const store = getNflStore();

  // Index odds rows by matchup abbreviations for fast lookup
  const oddsRows = Array.isArray(odds.rows) ? odds.rows : [];
  const oddsIndex = new Map();
  for (const r of oddsRows) {
    const homeAbbr = nameToAbbr(r.home);
    const awayAbbr = nameToAbbr(r.away);
    oddsIndex.set(`${awayAbbr}@${homeAbbr}`, r);
  }

  const out = { ok: true, updated: new Date().toISOString(), rows: [] };
  const games = schedule.matchups || schedule.games || [];
  for (const g of games) {
    const home = g.homeTeam || g.home || g.home_team;
    const away = g.awayTeam || g.away || g.away_team;
    const kickoff = g.kickoff || g.commence_time || g.start;
    const key = `${away}@${home}`;
    const o = oddsIndex.get(key);

    const homeForm = teamForm.team_data[home];
    const awayForm = teamForm.team_data[away];

    let pick = { type: "moneyline", team: home, confidence: 0.5 };
    if (homeForm && awayForm) {
      // Simple EPA edge → confidence boost
      const offEdge = (homeForm.decayed_data?.off_epa_decayed ?? 0) - (awayForm.defense?.epa_allowed_per_play ?? 0);
      const defEdge = (awayForm.decayed_data?.off_epa_decayed ?? 0) - (homeForm.defense?.epa_allowed_per_play ?? 0);
      let conf = 0.55 + Math.max(-0.1, Math.min(0.1, (offEdge - defEdge) * 2.0)); // clamp small boost
      let team = home;

      // If odds exist, lean towards the favorite when EPA is tight
      if (o && o.ml_home != null && o.ml_away != null) {
        const pHome = impliedProb(o.ml_home);
        const pAway = impliedProb(o.ml_away);
        if (pHome != null && pAway != null) {
          if (Math.abs(offEdge - defEdge) < 0.03) {
            team = pHome >= pAway ? home : away;
            conf = Math.max(conf, 0.58);
          } else if (offEdge - defEdge < 0) {
            team = away;
          }
        }
      } else {
        if (offEdge - defEdge < 0) team = away;
      }
      pick = { type: "moneyline", team, confidence: Number(conf.toFixed(3)) };
    }

    // Attach spread / total value if we have them
    let meta = {};
    if (o) {
      meta.odds = {
        ml_home: o.ml_home, ml_away: o.ml_away,
        spread_point: o.spread_point, total_points: o.total_points
      };
    }

    out.rows.push({
      id: g.id || key,
      matchup: `${away} @ ${home}`,
      kickoff,
      pick,
      meta
    });
  }

  await store.setJSON("predictions/current.json", out);
  return { statusCode: 200, body: JSON.stringify(out) };
};
