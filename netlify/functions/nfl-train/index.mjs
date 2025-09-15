/** nfl-train: fetch NFLverse games CSV, compute simple team form, persist to blobs */
import { saveToBlobs } from '../_lib/blobs-helper.mjs';
import { parse } from 'csv-parse/sync';

const NFLDATA_CSV = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';

export const handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const years = qs.years ? qs.years.split(',').map(s => Number(s.trim())).filter(Boolean)
              : (qs.season ? [Number(qs.season)] : []);

  let csv;
  try {
    const res = await fetch(NFLDATA_CSV, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csv = await res.text();
  } catch (e) {
    return json(200, { ok: true, meta: { years, persisted: false, wrote: null, persist_error: String(e) },
      summary: { teams: 0, totalRows: 0 }, seasonResults: [], updated: new Date().toISOString() });
  }

  const records = parse(csv, { columns: true, skip_empty_lines: true });
  // Filter by years if provided (columns: season or year)
  const yearKey = records.length && ('season' in records[0] ? 'season' : ('year' in records[0] ? 'year' : null));
  const filtered = yearKey && years.length ? records.filter(r => Number(r[yearKey]) && years.includes(Number(r[yearKey]))) : records;

  // Build team form: last 6 average point differential per team
  const byTeam = new Map();
  function pushGame(team, margin, dateStr) {
    const arr = byTeam.get(team) || [];
    arr.push({ margin, date: dateStr });
    byTeam.set(team, arr);
  }
  for (const r of filtered) {
    const home = r.home_team || r.home || r.team_home || r.team_home_name;
    const away = r.away_team || r.away || r.team_away || r.team_away_name;
    const hs = Number(r.home_score ?? r.result_home ?? r.score_home ?? r.home_points ?? 0);
    const as = Number(r.away_score ?? r.result_away ?? r.score_away ?? r.away_points ?? 0);
    const date = r.game_date || r.gameday || r.start_time || r.start_date || r.game_id || '';
    if (!home || !away) continue;
    const marginHome = hs - as;
    pushGame(home, marginHome, date);
    pushGame(away, -marginHome, date);
  }
  const teamForm = {};
  for (const [team, arr] of byTeam.entries()) {
    arr.sort((a,b) => String(a.date).localeCompare(String(b.date)));
    const last = arr.slice(-6);
    const avg = last.length ? last.reduce((s,x)=>s+Number(x.margin||0),0)/last.length : 0;
    teamForm[team] = { games: last.length, avg_margin: Number(avg.toFixed(3)) };
  }

  let persist_error = null, wrote = null, persisted = false;
  try {
    await saveToBlobs('team_form.json', { teamForm, updated: new Date().toISOString() });
    wrote = 'team_form.json';
    persisted = true;
  } catch (e) {
    persist_error = String(e);
  }

  return json(200, {
    ok: true,
    meta: { years: years.length? years : 'ALL', persisted, wrote, persist_error },
    summary: { teams: Object.keys(teamForm).length, totalRows: filtered.length },
    seasonResults: [],
    updated: new Date().toISOString()
  });
};

function json(status, obj) {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}
