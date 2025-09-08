'use strict';
const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

async function readSchedule(season = 2025) {
  // Use the dedicated NFL store (isolated from MLB)
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID; // optional; Netlify usually injects this for you
  const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN; // optional for manual auth

  try {
    const store = getStore({ name, siteID, token });
    const key = `schedules/${season}/full.json`;
    const fromBlobs = await store.get(key, { type: 'json' });
    if (fromBlobs && fromBlobs.season) return { data: fromBlobs, source: `blobs:${name}:${key}` };
  } catch (e) {
    // ignore and fall back
  }

  // Fallback to repo override (if present)
  const shared = path.resolve(__dirname, '../..', 'data/nfl', String(season), 'schedule.full.json');
  if (fs.existsSync(shared)) {
    return { data: JSON.parse(fs.readFileSync(shared, 'utf8')), source: shared };
  }

  // Fallback to function-local stub (if present)
  const local = path.resolve(__dirname, './_data/schedule.json');
  if (fs.existsSync(local)) {
    return { data: JSON.parse(fs.readFileSync(local, 'utf8')), source: local };
  }

  throw new Error('No schedule found in Blobs or local files.');
}

function nowInETISO() {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}
function computeCurrentWeek(schedule) {
  const now = new Date(nowInETISO()).getTime();
  const weekNums = Object.keys(schedule.weeks || {}).map(k=>parseInt(k,10)).sort((a,b)=>a-b);
  let chosen = weekNums[0] || 1;
  for (const w of weekNums) {
    const games = schedule.weeks[String(w)] || [];
    if (games.some(g => new Date(g.kickoff_et).getTime() >= now)) { chosen = w; break; }
  }
  return chosen;
}
exports.handler = async (event) => {
  try {
    const qs = (event && event.queryStringParameters) || {};
    const season = qs.season ? parseInt(qs.season, 10) : 2025;
    const { data: sched, source } = await readSchedule(season);
    let week = qs.week;
    if (!week || week === 'auto') week = computeCurrentWeek(sched);
    else { week = parseInt(week, 10); if (!(sched.weeks && sched.weeks[String(week)])) return { statusCode: 400, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:`Unknown week ${week}` }) }; }
    const games = (sched.weeks && sched.weeks[String(week)]) ? sched.weeks[String(week)] : [];
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:true, season: sched.season, week, gameCount: games.length, games, meta: { source } }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
