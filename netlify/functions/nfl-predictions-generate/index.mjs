/**
 * nfl-predictions-generate (ESM)
 * Loads team_form.json and joins with odds from existing odds store (or stub)
 */
import { loadFromBlobs } from "../_lib/blobs-helper.mjs";

function pct(p) { return Math.round(p * 100); }

export async function handler(event) {
  const qs = (event && event.queryStringParameters) || {};
  const force = qs.force;
  const features = await loadFromBlobs("team_form.json");
  if (!features) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, rows: [], meta: { source: "stub", force } })
    };
  }

  // Minimal demo schedule+odds (the real app uses stored odds/schedule)
  const schedule = [
    { id:"game1", matchup:"CHICAGO BEARS @ DETROIT LIONS", kickoff:"2025-09-14T17:00:00Z",
      homeTeam:"DETROIT LIONS", awayTeam:"CHICAGO BEARS", odds:{ ml_home:-270, ml_away:220, total_points:47.5, spread_point:-6.5 } }
  ];

  const rows = schedule.map(g => {
    const h = features[g.homeTeam] || { avgNet: 0 };
    const a = features[g.awayTeam] || { avgNet: 0 };
    const edge = h.avgNet - a.avgNet;
    const mlProb = 0.5 + Math.max(-0.2, Math.min(0.2, edge / 40)); // squashed edge
    const pickSide = mlProb >= 0.5 ? g.homeTeam : g.awayTeam;
    return {
      id: g.id,
      matchup: g.matchup,
      kickoff: g.kickoff,
      moneylineText: `${pickSide.toUpperCase()} (${mlProb >= 0.5 ? g.odds.ml_home : g.odds.ml_away})`,
      moneylineConf: mlProb,
      spreadText: `${g.homeTeam} ${g.odds.spread_point} (${g.odds.spread_point < 0 ? '-110' : '-110'})`,
      spreadConf: Math.min(0.85, Math.abs(edge)/30 + 0.5),
      totalText: `${g.odds.total_points ? (edge>0?'OVER':'UNDER')+' '+g.odds.total_points : 'O/U'}`,
      totalConf: 0.5 + Math.min(0.35, Math.abs(edge)/50)
    };
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, updated: new Date().toISOString(), meta: { source: "model-epa-lite" }, rows })
  };
}

export default { handler };