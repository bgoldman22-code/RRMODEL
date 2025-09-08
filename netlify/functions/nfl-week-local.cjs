'use strict';
const fs = require('fs');
const path = require('path');

function readSchedule() {
  const p = path.resolve(__dirname, './_data/nfl/2025/schedule.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Return ISO string for now in America/New_York (no external deps)
function nowInETISO() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  const yyyy = get('year');
  const mm = get('month');
  const dd = get('day');
  const hh = get('hour');
  const min = get('minute');
  const ss = get('second');
  // Return a naive ET time string (ISO-like)
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-04:00`; // -04/-05 changes with DST; offset is not used for comparisons below
}

// Parse ET string like 2025-09-07T13:00:00-04:00 to Date in ET via trick: treat as UTC then adjust by offset
function parseET(iso) {
  // We only need ordering; Date can parse and we compare timestamps
  return new Date(iso);
}

// Compute "currentWeek" as the first week whose games are still upcoming or ongoing
function computeCurrentWeek(schedule) {
  const now = new Date(nowInETISO()).getTime();
  const weeks = schedule.weeks || {};
  const weekNums = Object.keys(weeks).map(k => parseInt(k, 10)).sort((a,b)=>a-b);

  // If all weeks are in the future, return the smallest week number.
  let minWeek = weekNums[0] || 1;
  let chosen = minWeek;

  for (const w of weekNums) {
    const games = weeks[w] || [];
    if (games.length === 0) continue;
    // If any game kickoff is still in the future relative to now, pick this week
    const anyFuture = games.some(g => parseET(g.kickoff_et).getTime() >= now);
    if (anyFuture) { chosen = w; break; }
    // Otherwise keep scanning until we reach a week with future games
  }
  return chosen;
}

exports.handler = async (event) => {
  try {
    const sched = readSchedule();
    const query = event && event.queryStringParameters ? event.queryStringParameters : {};
    let week = query.week;

    if (!week || week === 'auto') {
      week = computeCurrentWeek(sched);
    } else {
      week = parseInt(week, 10);
      if (!sched.weeks[String(week)]) {
        return { statusCode: 400, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:`Unknown week ${week}` }) };
      }
    }

    // Return just the target week + some meta
    const games = sched.weeks[String(week)] || [];
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        season: sched.season,
        week,
        gameCount: games.length,
        games
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
