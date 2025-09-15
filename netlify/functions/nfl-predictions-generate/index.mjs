// Self-healing predictions endpoint:
// - Reads team_form.json from Blobs
// - If missing, computes ephemeral form (stubbed here) and writes it back to Blobs (self-heal)
// - Joins cached odds when available; otherwise leaves odds null (no placeholders)
// - Outputs calibrated confidence only when real odds exist

import { blobsGetJSON, blobsPutJSON } from '../_lib/blobs.js';
import { confidenceFromEdge, americanToImplied, impliedToAmerican } from '../_lib/pred-utils.mjs';
import { getWeekSchedule } from '../_lib/schedule-source.mjs';

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week')) || null;
    const season = Number(url.searchParams.get('season')) || null;
    const force = url.searchParams.get('force') === '1';

    // 1) Try to read team form from Blobs
    let teamForm = await blobsGetJSON('team_form.json', null);
    let meta = { teamForm: { source: 'blobs', persisted: !!teamForm } };

    // 2) If missing or force, compute ephemeral then write back
    if (!teamForm || force) {
      meta.teamForm.source = 'ephemeral';
      teamForm = await computeEphemeralTeamForm({ season }); // stub demo
      // write-back to Blobs
      try {
        await blobsPutJSON('team_form.json', teamForm);
        meta.teamForm.persisted = true;
        meta.teamForm.persistedAt = new Date().toISOString();
        meta.teamForm.source = force ? 'ephemeral->blobs(force)' : 'ephemeral->blobs';
      } catch (err) {
        meta.teamForm.persistError = String(err?.message || err);
      }
    }

    // 3) Build or load the week's schedule (assumes external code gathers the games list)
    // For demo, we synthesize games from teamForm keys if a schedule isn't provided elsewhere.
    const games = synthesizeGamesFromTeamForm(teamForm, { week, season });
    const schedule = await getWeekSchedule({ week, season, games });

    // 4) Score each game with model-only probability (toy example) + price-calibrated confidence when odds exist
    const rows = schedule.map(g => {
      // toy model probability: higher teamForm.rating wins
      const homeStrength = teamForm?.teams?.[g.home]?.rating ?? 0.5;
      const awayStrength = teamForm?.teams?.[g.away]?.rating ?? 0.5;
      const modelHomeProb = clamp01(0.5 + (homeStrength - awayStrength) * 0.25);
      const modelAwayProb = 1 - modelHomeProb;

      let pick = modelHomeProb >= 0.5 ? g.home : g.away;
      let modelPickProb = modelHomeProb >= 0.5 ? modelHomeProb : modelAwayProb;

      let confidence = null;
      let marketProb = null;
      let modelEdge = null;
      let ml_home = null, ml_away = null;

      if (g.odds?.ml_home != null && g.odds?.ml_away != null) {
        ml_home = g.odds.ml_home;
        ml_away = g.odds.ml_away;
        const marketHome = americanToImplied(ml_home);
        const marketAway = americanToImplied(ml_away);

        marketProb = pick === g.home ? marketHome : marketAway;
        modelEdge = modelPickProb - marketProb;
        confidence = confidenceFromEdge(modelPickProb, marketProb);
      }

      return {
        gameId: g.gameId,
        matchup: `${g.away} @ ${g.home}`,
        start: g.start,
        pick,
        modelPickProb: round3(modelPickProb),
        marketProb: marketProb != null ? round3(marketProb) : null,
        modelEdge: modelEdge != null ? round3(modelEdge) : null,
        ml_home, ml_away,
        confidence,
        oddsSource: g.oddsSource || 'none',
      };
    });

    const body = JSON.stringify({ meta, rows }, null, 2);
    return new Response(body, { headers: { 'content-type': 'application/json' }});
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }, null, 2), { status: 500 });
  }
};

// --- helpers ---
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function round3(x){ return Math.round(x * 1000) / 1000; }

async function computeEphemeralTeamForm({ season }) {
  // Replace with your real feature builder.
  // Minimal shape: { teams: { [abbr]: { rating: 0..1 } } }
  const teams = [
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB',
    'HOU','IND','JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ',
    'PHI','PIT','SEA','SF','TB','TEN','WAS'
  ];
  const obj = { teams: {} };
  for (const t of teams) obj.teams[t] = { rating: 0.5 }; // neutral until your real builder fills this in
  return obj;
}

function synthesizeGamesFromTeamForm(teamForm, { week, season }) {
  // If you already have a schedule pipeline, swap this out.
  // Here we just pair teams deterministically to produce game stubs.
  const teams = Object.keys(teamForm?.teams || {});
  const pairs = [];
  for (let i=0; i<teams.length; i+=2) {
    if (teams[i+1]) pairs.push([teams[i], teams[i+1]]);
  }
  return pairs.map((p, idx) => ({
    gameId: `W${week||0}-G${idx+1}`,
    week: week ?? 0,
    season: season ?? 0,
    home: p[0],
    away: p[1],
    start: null,
  }));
}
