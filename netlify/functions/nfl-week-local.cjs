'use strict';
const fs = require('fs');
const path = require('path');

function readSchedule() {
  const p = path.resolve(__dirname, './_data/schedule.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ET "now" as ISO-like (naive is fine for ordering)
function nowInETISO() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  const yyyy = get('year'), mm = get('month'), dd = get('day');
  const hh = get('hour'), mi = get('minute'), ss = get('second');
  // We don't rely on offset; Date parsing provides ordering we need.
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
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
    if (!week || week === 'auto') {
      week = computeCurrentWeek(sched);
    } else {
      week = parseInt(week, 10);
      if (!sched.weeks[String(week)]) {
        return { statusCode: 400, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:`Unknown week ${week}` }) };
      }
    }
    const games = sched.weeks[String(week)] || [];
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:true, season: sched.season, week, gameCount: games.length, games })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
