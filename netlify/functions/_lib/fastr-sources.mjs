
import { gunzipSync } from 'node:zlib';

const URL_PATTERNS = [
  // historic nflfastR path
  (y) => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/games_${y}.csv.gz`,
  (y) => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/games_${y}.csv`,
  // newer nflverse-data paths
  (y) => `https://raw.githubusercontent.com/nflverse/nflverse-data/master/data/games/games_${y}.csv.gz`,
  (y) => `https://raw.githubusercontent.com/nflverse/nflverse-data/master/data/games/games_${y}.csv`,
  // releases (content-redirected)
  (y) => `https://github.com/nflverse/nflverse-data/releases/download/games/games_${y}.csv.gz`,
  (y) => `https://github.com/nflverse/nflverse-data/releases/download/games/games_${y}.csv`,
];

export async function fetchSeasonCSV(year, logs) {
  const tried = [];
  for (const pat of URL_PATTERNS) {
    const url = pat(year);
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) { tried.push({ url, status: r.status }); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const text = url.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
      logs.push({ level: 'info', msg: 'fetched', year, url, bytes: buf.length });
      return text;
    } catch (e) {
      tried.push({ url, error: String(e) });
    }
  }
  logs.push({ level: 'error', msg: 'season_fetch_failed', year, tried });
  return null;
}
