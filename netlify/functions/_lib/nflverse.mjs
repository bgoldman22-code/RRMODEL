// single stable source: nflverse/nfldata games.csv
const NFLDATA_GAMES = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

// tiny CSV parser (no extra deps) — assumes no quoted commas
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const cols = lines.shift().split(",");
  return lines.map((line) => {
    const vals = line.split(",");
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
  });
}

export async function loadGames({ seasons }) {
  const res = await fetch(NFLDATA_GAMES, { headers: { "User-Agent": "rrmodel-nfl/1.0" } });
  if (!res.ok) throw new Error(`NFLData fetch failed: ${res.status}`);
  const text = await res.text();
  const all = parseCSV(text);
  const wanted = new Set(seasons.map(String));
  const filtered = all.filter(r => wanted.has(r.season));
  return filtered.map(r => ({
    season: Number(r.season),
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    kickoff: r.gameday || r.game_date || r.game_date_time || "",
    homePoints: toNum(r.result_home) ?? toNum(r.home_score) ?? null,
    awayPoints: toNum(r.result_away) ?? toNum(r.away_score) ?? null,
  }));
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
