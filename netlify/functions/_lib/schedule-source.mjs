// Schedule source that reads odds from Blobs using either gameId OR team pair key (HOME-AWAY).
// This lets us join odds even if your schedule uses different gameIds than the odds cache.

import { blobsGetJSON } from './blobs.js';

function pairKey(home, away) {
  return `${home}-${away}`;
}

async function loadWeekOdds(week) {
  if (week == null) return null;
  const key = `odds_week_${week}.json`;
  const data = await blobsGetJSON(key, null);
  if (!data) return null;
  const byId = Object.create(null);
  const byPair = Object.create(null);
  for (const r of data.rows || []) {
    const rec = { ml_home: r.ml_home ?? null, ml_away: r.ml_away ?? null };
    if (r.gameId) byId[r.gameId] = rec;
    if (r.home && r.away) byPair[pairKey(r.home, r.away)] = rec;
  }
  return { byId, byPair, meta: data.meta || {} };
}

export async function getWeekSchedule({ week, season, games }) {
  const oddsIndex = await loadWeekOdds(week);
  return (games || []).map(g => {
    let odds = null;
    let src = 'none';
    if (oddsIndex) {
      if (g.gameId && oddsIndex.byId[g.gameId]) {
        odds = oddsIndex.byId[g.gameId];
        src = 'blobs:week:id';
      } else if (g.home && g.away && oddsIndex.byPair[`${g.home}-${g.away}`]) {
        odds = oddsIndex.byPair[`${g.home}-${g.away}`];
        src = 'blobs:week:pair';
      }
    }
    return { ...g, odds, oddsSource: src };
  });
}
