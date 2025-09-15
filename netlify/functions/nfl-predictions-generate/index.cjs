
// netlify/functions/nfl-predictions-generate/index.cjs
// Generates picks by combining odds (when present) with team_form.json features.
const { loadFromBlobs } = require('../_lib/blobs-helper.cjs');

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const force = qs.force || '0';

  const featuresJson = await loadFromBlobs('team_form.json');
  if (!featuresJson || !featuresJson.teams || featuresJson.teams.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, updated: new Date().toISOString(), meta: { source: "stub", force }, rows: [] })
    };
  }
  const byTeam = new Map(featuresJson.teams.map(t => [t.team, t]));

  // Odds source would usually be fetched here. For debug sanity, we emit a tiny synthetic schedule
  // if "debug=1" is passed. Otherwise we return empty rows so UI doesn't show stale data.
  const debug = qs.debug === '1';
  const rows = [];

  if (debug) {
    const sample = [
      { id: "SAMP1", matchup: "NEW YORK JETS @ NEW ENGLAND PATRIOTS", kickoff: "2025-09-21T16:01:00Z", homeTeam: "NE", awayTeam: "NYJ",
        odds: { ml_home: -135, ml_away: 115, spread_point: -2.5, spread_home_line: -110, spread_away_line: -110, total_points: 41.5, over_price: -108, under_price: -112 }
      },
      { id: "SAMP2", matchup: "DALLAS COWBOYS @ GREEN BAY PACKERS", kickoff: "2025-09-21T19:25:00Z", homeTeam: "GB", awayTeam: "DAL",
        odds: { ml_home: 120, ml_away: -140, spread_point: 2.5, spread_home_line: -110, spread_away_line: -110, total_points: 47.5, over_price: -110, under_price: -110 }
      }
    ];
    for (const g of sample) {
      const h = byTeam.get(g.homeTeam) || { mov_per_game: 0 };
      const a = byTeam.get(g.awayTeam) || { mov_per_game: 0 };
      const edge = (h.mov_per_game - a.mov_per_game);
      const moneylinePick = edge >= 0 ? g.homeTeam : g.awayTeam;
      const conf = Math.min(0.9, Math.max(0.5, 0.5 + Math.abs(edge) / 20)); // crude scaling

      rows.push({
        id: g.id,
        matchup: g.matchup,
        kickoff: g.kickoff,
        moneylineText: `${moneylinePick} (${moneylinePick === g.homeTeam ? g.odds.ml_home : g.odds.ml_away})`,
        moneylineConf: conf,
        spreadText: `${g.homeTeam} ${g.odds.spread_point} (${g.odds.spread_home_line})`,
        spreadConf: Math.max(0.5, conf - 0.05),
        totalText: `${g.odds.total_points ? (g.odds.total_points >= 0 ? "OVER " + g.odds.total_points : "UNDER " + Math.abs(g.odds.total_points)) : "O/U –"}`,
        totalConf: Math.max(0.5, conf - 0.1)
      });
    }
  }

  // Log a peek of features to help debugging
  const logs = (featuresJson.teams || []).slice(0, 5);

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      updated: new Date().toISOString(),
      meta: { source: "model-team-form", force, features: featuresJson.teams.length },
      rows,
      logs
    })
  };
};
