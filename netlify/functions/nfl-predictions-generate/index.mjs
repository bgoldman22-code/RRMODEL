// nfl-predictions-generate using explicit createClient helper + self-heal team_form
import { nflGetJSON, nflSetJSON } from '../_lib/blobs-explicit-nfl.js';
import { getWeekSchedule } from '../_lib/schedule-source.mjs'; // assumes odds joined from cached blobs

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week')) || null;
    const season = Number(url.searchParams.get('season')) || null;
    const force = url.searchParams.get('force') === '1';

    // 1) team form
    let teamForm = await nflGetJSON('team_form.json', null);
    const meta = { teamForm: { source: teamForm ? 'blobs' : 'missing' } };

    if (!teamForm || force) {
      meta.teamForm.source = 'ephemeral';
      teamForm = await computeEphemeralTeamForm({ season });
      try {
        await nflSetJSON('team_form.json', teamForm);
        meta.teamForm.persisted = true;
        meta.teamForm.persistedAt = new Date().toISOString();
        meta.teamForm.source = 'ephemeral->blobs';
      } catch (err) {
        meta.teamForm.persistError = String(err?.message || err);
      }
    }

    // 2) schedule + odds
    const games = synthesizeGamesFromTeamForm(teamForm, { week, season });
    const schedule = await getWeekSchedule({ week, season, games });

    // 3) score games
    const rows = schedule.map(g => {
      const homeStrength = teamForm?.teams?.[g.home]?.rating ?? 0.5;
      const awayStrength = teamForm?.teams?.[g.away]?.rating ?? 0.5;
      const modelHomeProb = clamp01(0.5 + (homeStrength - awayStrength) * 0.25);
      const modelAwayProb = 1 - modelHomeProb;

      let pick = modelHomeProb >= 0.5 ? g.home : g.away;
      let modelPickProb = modelHomeProb >= 0.5 ? modelHomeProb : modelAwayProb;

      let ml_home = null, ml_away = null, marketProb = null, modelEdge = null, confidence = null;
      if (g.odds?.ml_home != null && g.odds?.ml_away != null) {
        ml_home = g.odds.ml_home;
        ml_away = g.odds.ml_away;
        const marketHome = americanToImplied(ml_home);
        const marketAway = americanToImplied(ml_away);
        marketProb = pick === g.home ? marketHome : marketAway;
        modelEdge  = modelPickProb - marketProb;
        confidence = bucketConfidence(modelEdge);
      }

      return {
        gameId: g.gameId,
        matchup: `${g.away} @ ${g.home}`,
        start: g.start ?? null,
        pick,
        modelPickProb: round3(modelPickProb),
        marketProb: marketProb != null ? round3(marketProb) : null,
        modelEdge: modelEdge != null ? round3(modelEdge) : null,
        ml_home, ml_away,
        confidence,
        oddsSource: g.oddsSource || 'none'
      };
    });

    return json({ meta, rows });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};

// helpers
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function round3(x){ return Math.round(x * 1000) / 1000; }
function americanToImplied(a) {
  const n = Number(a);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}
function bucketConfidence(edge) {
  if (edge == null) return null;
  const e = Math.abs(edge);
  if (e >= 0.15) return 9;
  if (e >= 0.12) return 8;
  if (e >= 0.09) return 7;
  if (e >= 0.06) return 6;
  if (e >= 0.04) return 5;
  if (e >= 0.03) return 4;
  if (e >= 0.02) return 3;
  if (e >= 0.01) return 2;
  return 1;
}

async function computeEphemeralTeamForm({ season }) {
  const teams = [
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB',
    'HOU','IND','JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ',
    'PHI','PIT','SEA','SF','TB','TEN','WAS'
  ];
  const obj = { teams: {} };
  for (const t of teams) obj.teams[t] = { rating: 0.5 };
  return obj;
}

function synthesizeGamesFromTeamForm(teamForm, { week, season }) {
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
