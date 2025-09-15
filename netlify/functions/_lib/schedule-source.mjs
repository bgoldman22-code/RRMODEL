// Schedule source with *no placeholder odds*.
// Instead, we try to join cached odds from Blobs by matchup id (gameId).
// If none are found, we leave odds null and mark oddsSource:'none'.

import { blobsGetJSON } from './blobs.js';

// Expect an odds cache written by odds-refresh: odds_week_<W>.json
async function loadWeekOdds(week) {
  if (!week && week !== 0) return null;
  const key = `odds_week_${week}.json`;
  const data = await blobsGetJSON(key, null);
  if (!data) return null;
  // Normalize to a map gameId -> { ml_home, ml_away }
  const map = Object.create(null);
  for (const row of data?.rows || []) {
    if (!row?.gameId) continue;
    map[row.gameId] = { ml_home: row.ml_home ?? null, ml_away: row.ml_away ?? null };
  }
  return map;
}

// Fake schedule builder for demonstration; in your app you likely already have this.
// Keep the shape, but drop hard-coded odds.
export async function getWeekSchedule({ week, season, games }) {
  // `games` = incoming list you already build elsewhere with teams, ids, start times, etc.
  const oddsMap = await loadWeekOdds(week);
  return (games || []).map(g => {
    const odds = oddsMap?.[g.gameId] || null;
    return {
      ...g,
      odds,
      oddsSource: odds ? 'blobs:week' : 'none',
    };
  });
}
