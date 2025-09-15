export async function fetchGamesCsv() {
  const url = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`NFLVerse fetch failed ${res.status}`);
  return await res.text();
}
export async function parseGamesCsv(csvText) {
  const mod = await import('csv-parse/sync');
  const { parse } = mod;
  const records = parse(csvText, { columns: true, skip_empty_lines: true });
  return records;
}
export async function loadGamesBySeasons(seasons) {
  const text = await fetchGamesCsv();
  const rows = await parseGamesCsv(text);
  const set = new Set(seasons.map(Number));
  return rows.filter(r => set.has(Number(r.season)));
}
