// netlify/functions/nfl-predictions-generate/index.mjs
import { nflBlobsGetJSON as nflGetJSON, nflBlobsPutJSON as nflSetJSON } from '../_lib/blobs-nfl.js';
import { getWeekSchedule } from '../_lib/schedule-source.mjs';

/**
 * Example:
 * /.netlify/functions/nfl-predictions-generate?season=2025&week=3
 */
export const handler = async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week')) || 3;           // default to week 3 for tests
    const season = Number(url.searchParams.get('season')) || new Date().getFullYear();
    const force = url.searchParams.get('force') === '1';

    // 1) Load team form (NFLVerse-derived) from Blobs, or refresh from static json
    let teamForm = await nflGetJSON('team_form.json', null);
    const meta = { teamForm: { source: teamForm ? 'blobs' : 'missing' } };

    if (!teamForm || force) {
      try {
        const base = process.env.URL || '';
        const resp = await fetch(base + '/nflverse-team-form.json');
        if (resp.ok) {
          teamForm = await resp.json();
          await nflSetJSON('team_form.json', teamForm);
          meta.teamForm.source = 'nflverse_file';
        }
      } catch (e) {
        console.warn('[nfl-predictions] failed to refresh team_form.json from /nflverse-team-form.json:', e);
      }
    }
    if (!teamForm?.team_data) {
      return json({ error: 'No team form data available', hint: 'Run /teamform-refresh?force=1' }, 400);
    }

    // 2) Attach schedule (prefers your schedule bridge; falls back to compact generator)
    const games = await getRealScheduleForWeek(week, season, teamForm.team_data);
    const schedule = await getWeekSchedule({ week, season, games });

    // 3) Load odds for the week from Blobs (written by /odds-refresh)
    const oddsBlob = await nflGetJSON(`odds_week_${week}.json`, { rows: [] });
    const oddsMap = buildOddsMap(oddsBlob?.rows || []);

    // 4) Build predictions
    const rows = schedule.map((game) => {
      const home = game.home;
      const away = game.away;
      const homeTeam = teamForm.team_data[home];
      const awayTeam = teamForm.team_data[away];
      if (!homeTeam || !awayTeam) return null;

      // Model strength from EPA + recent form
      const homeStrength = calcStrength(homeTeam, true);
      const awayStrength = calcStrength(awayTeam, false);
      const strengthDiff = homeStrength - awayStrength;

      let homeProb = 0.5 + strengthDiff * 0.35;
      homeProb = clamp(homeProb, 0.15, 0.85);
      const awayProb = 1 - homeProb;

      const pick = homeProb >= 0.5 ? home : away;
      const modelPickProb = homeProb >= 0.5 ? homeProb : awayProb;

      // Merge odds if available
      const okey = `${away}@${home}`;
      const o = oddsMap.get(okey);
      let ml_home = null, ml_away = null, marketProb = null, modelEdge = null, confidence = null;

      if (o) {
        ml_home = o.ml_home;
        ml_away = o.ml_away;
        const marketHome = americanToImplied(ml_home);
        const marketAway = americanToImplied(ml_away);
        marketProb = pick === home ? marketHome : marketAway;
        if (marketProb != null) {
          modelEdge = modelPickProb - marketProb;
          confidence = bucketConfidence(modelEdge);
        }
      }

      return {
        gameId: game.gameId || `W${week}-${home}-${away}`,
        matchup: `${away} @ ${home}`,
        start: game.start ?? null,
        pick,
        homeProb: round3(homeProb),
        awayProb: round3(awayProb),
        modelPickProb: round3(modelPickProb),
        marketProb: marketProb != null ? round3(marketProb) : null,
        modelEdge: modelEdge != null ? round3(modelEdge) : null,
        ml_home,
        ml_away,
        confidence,
        oddsSource: o?.source || oddsBlob?.meta?.source || 'none',
        teamStats: {
          home: {
            epa: round3(homeTeam.offense?.epa_per_play || 0),
            form: round3(homeTeam.form || 0),
            strength: round3(homeStrength),
          },
          away: {
            epa: round3(awayTeam.offense?.epa_per_play || 0),
            form: round3(awayTeam.form || 0),
            strength: round3(awayStrength),
          },
        },
      };
    }).filter(Boolean);

    rows.sort((a, b) => (b.modelEdge || 0) - (a.modelEdge || 0));

    return json({
      meta: {
        ...meta,
        season,
        week,
        games: rows.length,
        updatedAt: new Date().toISOString(),
        model: 'nflverse_epa_v1',
        oddsCount: Array.isArray(oddsBlob?.rows) ? oddsBlob.rows.length : 0,
      },
      rows,
    });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};

/* ---------- helpers ---------- */

function buildOddsMap(rows) {
  // key as "AWAY@HOME" to match schedule pairings
  const m = new Map();
  for (const r of rows) {
    if (!r?.home || !r?.away) continue;
    const key = `${r.away}@${r.home}`;
    m.set(key, { ml_home: r.ml_home, ml_away: r.ml_away, source: 'theoddsapi' });
  }
  return m;
}

function calcStrength(team, isHome) {
  const offEPA = team.offense?.epa_per_play || 0;
  const defEPA = -(team.defense?.epa_allowed_per_play || 0);
  const form = team.form || 0;
  let s = 0.5 + offEPA * 0.4 + defEPA * 0.4 + form * 0.2;
  if (isHome) s += 0.025; // HFA
  return clamp(s, 0.1, 0.9);
}

async function getRealScheduleForWeek(week, season, teamData) {
  // Try your schedule bridge first
  try {
    const scheduleUrl = process.env.NFL_SCHEDULE_URL || 'nfl-schedule-get';
    const res = await fetch(`/.netlify/functions/${scheduleUrl}?week=${week}&season=${season}`);
    if (res.ok) {
      const data = await res.json();
      return data.games || data.schedule || [];
    }
  } catch (e) {
    console.warn('[nfl-predictions] schedule bridge failed, using fallback:', e);
  }

  // Fallback: compact pairing on team list (stable for testing)
  const teams = Object.keys(teamData || {});
  const games = [];
  for (let i = 0; i < Math.min(16, Math.floor(teams.length / 2)); i++) {
    const home = teams[i * 2];
    const away = teams[i * 2 + 1];
    if (home && away) {
      games.push({ gameId: `W${week}G${i + 1}`, week, season, home, away, start: null });
    }
  }
  return games;
}

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

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round3(x) { return Math.round(x * 1000) / 1000; }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
