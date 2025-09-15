const NFLDATA_CSV = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';

/** Fetch all games once, filter by seasons array, return rows with minimal fields */
export async function fetchGamesCsv({ seasons }) {
  const res = await fetch(NFLDATA_CSV, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`NFLData fetch failed: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  const idx = (name) => header.indexOf(name);
  const i_season = idx('season');
  const i_home = idx('home_team');
  const i_away = idx('away_team');
  const i_week = idx('week');
  const i_home_epa = idx('home_wp');
  const i_away_epa = idx('away_wp');
  const out = [];
  for (const line of lines) {
    const cols = line.split(',');
    const season = Number(cols[i_season]);
    if (!seasons.includes(season)) continue;
    const row = {
      season,
      week: Number(cols[i_week]),
      home: cols[i_home],
      away: cols[i_away],
      // placeholder: we don't have EPA in this CSV, use win prob proxies if present
      home_wp: cols[i_home_epa] ? Number(cols[i_home_epa]) : null,
      away_wp: cols[i_away_epa] ? Number(cols[i_away_epa]) : null
    };
    out.push(row);
  }
  return out;
}
