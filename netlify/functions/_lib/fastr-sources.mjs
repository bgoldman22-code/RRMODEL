/**
 * nflverse fastR sources with multi-URL attempts
 */
import fetch from 'node-fetch';
export const GAME_URL_PATTERNS = [
  (y) => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${y}.csv.gz`,
  (y) => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/games_${y}.csv.gz`,
  (y) => `https://github.com/nflverse/nflfastR-data/raw/master/data/games/${y}.csv.gz`,
  (y) => `https://github.com/nflverse/nflfastR-data/raw/master/data/games/games_${y}.csv.gz`,
];

export async function fetchSeasonCSVGz(year) {
  const errors = [];
  for (const pat of GAME_URL_PATTERNS) {
    const url = pat(year);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        errors.push({url, status: res.status});
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: true, url, buf };
    } catch (e) {
      errors.push({url, error: e.message});
    }
  }
  return { ok: false, errors };
}