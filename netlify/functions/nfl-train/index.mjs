
/**
 * netlify/functions/nfl-train/index.mjs
 * Pure ESM, Node 18+. Builds simple team-form features from nflverse game CSVs and
 * persists to Netlify Blobs as `team_form.json` in store BLOBS_STORE_NFL (default 'nfl-model').
 */
import { fetchSeasonCSV } from '../_lib/fastr-sources.mjs';
import { parseCSV } from '../_lib/csv.mjs';
import { saveToBlobs } from '../_lib/blobs-helper.mjs';

/** Compute basic rolling form: exponential moving average of point diff and total points. */
function computeTeamForm(games, alpha = 0.3) {
  // games: [{ season, week, home_team, away_team, home_score, away_score, game_id }]
  const form = new Map(); // team -> { rating, total, count, lastWeek, lastSeason }
  const perTeamLatest = new Map(); // to help UI know recency

  // sort by season, week
  games.sort((a, b) => (a.season - b.season) || (a.week - b.week) || (a.game_id || '').localeCompare(b.game_id || ''));

  function update(team, pd, tp, season, week) {
    const prev = form.get(team) || { rating: 0, total: 0, count: 0 };
    const rating = (1 - alpha) * prev.rating + alpha * pd;
    const total = (1 - alpha) * (prev.total ?? 0) + alpha * tp;
    const count = prev.count + 1;
    form.set(team, { rating, total, count });
    perTeamLatest.set(team, { season, week });
  }

  for (const g of games) {
    const hs = Number(g.home_score || 0);
    const as = Number(g.away_score || 0);
    if (Number.isNaN(hs) || Number.isNaN(as)) continue;
    const pdHome = hs - as;
    const pdAway = -pdHome;
    const tp = hs + as;
    update(g.home_team, pdHome, tp, g.season, g.week);
    update(g.away_team, pdAway, tp, g.season, g.week);
  }

  // finalize
  const out = {};
  for (const [team, stats] of form.entries()) {
    out[team] = {
      rating: Number(stats.rating.toFixed(3)),
      paceTotal: Number(stats.total.toFixed(3)),
      games: stats.count,
      latest: perTeamLatest.get(team) || null,
    };
  }
  return out;
}

function parseGames(csvText, logs, year) {
  const { header, rows } = parseCSV(csvText);
  // normalize common header names
  const H = (name) => name in rows[0] ? name : header.find(h => h.toLowerCase() === name.toLowerCase()) || name;
  const seasonKey = H('season');
  const weekKey   = H('week');
  const homeKey   = H('home_team');
  const awayKey   = H('away_team');
  const hsKey     = H('home_score');
  const asKey     = H('away_score');
  const gidKey    = H('game_id') || H('game_id_old') || H('gameId');

  const games = rows.map(r => ({
    season: Number(r[seasonKey] || year),
    week: Number(r[weekKey] || 0),
    home_team: r[homeKey],
    away_team: r[awayKey],
    home_score: r[hsKey],
    away_score: r[asKey],
    game_id: r[gidKey] || `${r[seasonKey]}-${r[weekKey]}-${r[homeKey]}-${r[awayKey]}`
  })).filter(g => g.home_team && g.away_team);
  logs.push({ level: 'info', msg: 'parsed_games', year, rows: games.length });
  return games;
}

export const handler = async (event) => {
  const t0 = Date.now();
  const qp = event.queryStringParameters || {};
  const force = String(qp.force ?? '') === '1';
  const years = (qp.years ? qp.years.split(',').map(s => Number(s.trim())) :
                qp.season ? [Number(qp.season)] :
                [2022, 2023, 2024, 2025]).filter(Boolean);

  const logs = [];
  const seasons = [];
  try {
    for (const y of years) {
      const text = await fetchSeasonCSV(y, logs);
      if (!text) { seasons.push({ year: y, ok: false, reason: 'fetch_failed' }); continue; }
      const games = parseGames(text, logs, y);
      seasons.push({ year: y, ok: true, rowsProcessed: games.length });
    }

    // Flatten and compute features if we have any games
    const haveAny = seasons.some(s => s.ok && s.rowsProcessed > 0);
    let features = null;
    if (haveAny) {
      const allTexts = [];
      // Refetch for feature build to avoid re-parsing logs-only; or reuse above by re-parsing quickly
      // Here we just recompute by concatenating parsed games again for simplicity:
      // We'll refetch minimally to keep function straightforward.
      const gamesAll = [];
      for (const y of years) {
        const text = await fetchSeasonCSV(y, logs);
        if (!text) continue;
        gamesAll.push(...parseGames(text, logs, y));
      }
      features = computeTeamForm(gamesAll);
    }

    // persist (only if any data)
    let persisted = false, wrote = null, persist_error = null;
    if (features && Object.keys(features).length) {
      try {
        await saveToBlobs('team_form.json', { generatedAt: new Date().toISOString(), features });
        persisted = true;
        wrote = 'team_form.json';
      } catch (e) {
        persist_error = String(e?.message || e);
      }
    }

    const body = {
      ok: true,
      meta: { years, persisted, wrote, persist_error },
      seasonResults: seasons,
      summary: { teams: features ? Object.keys(features).length : 0 },
      updated: new Date().toISOString(),
      logs,
      ms: Date.now() - t0
    };
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  } catch (err) {
    const body = { ok: false, error: String(err?.message || err), logs, ms: Date.now() - t0 };
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  }
};
