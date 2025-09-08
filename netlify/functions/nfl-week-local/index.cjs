'use strict';
const fs = require('fs');
const path = require('path');

function locateScheduleJSON() {
  // Prefer shared override at: netlify/data/nfl/2025/schedule.full.json
  const override = path.resolve(__dirname, '../..', 'data/nfl/2025/schedule.full.json');
  if (fs.existsSync(override)) return override;
  // Fallback to function-local data
  return path.resolve(__dirname, './_data/schedule.json');
}

function readSchedule() {
  const p = locateScheduleJSON();
  return JSON.parse(fs.readFileSync(p, 'utf8'));
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
    const sched = readSchedule();
    const qs = (event && event.queryStringParameters) || {};
    let week = qs.week;
    if (!week || week === 'auto') week = computeCurrentWeek(sched);
    else { week = parseInt(week, 10); if (!sched.weeks[String(week)]) return { statusCode: 400, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:`Unknown week ${week}` }) }; }
    const games = sched.weeks[String(week)] || [];
    return { statusCode: 200, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:true, season: sched.season, week, gameCount: games.length, games, meta: { using: locateScheduleJSON().replace(process.cwd(), ''), dirname: __dirname } }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
