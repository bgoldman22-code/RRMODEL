import fetch from "node-fetch";

const URLS = [
  y => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${y}.csv.gz`,
  y => `https://github.com/nflverse/nflfastR-data/raw/master/data/games/${y}.csv.gz`,
  y => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/games_${y}.csv.gz`,
];

export async function fetchSeasonData(year) {
  for (const make of URLS) {
    const url = make(year);
    try {
      const res = await fetch(url);
      if (res.ok) {
        return { year, ok: true, status: res.status, url };
      }
    } catch (err) {
      continue;
    }
  }
  return { year, ok: false, reason: "fetch_failed" };
}
