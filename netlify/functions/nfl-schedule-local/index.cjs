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
exports.handler = async (event) => {
  try {
    const sched = readSchedule();
    const qs = (event && event.queryStringParameters) || {};
    const weekStr = qs.week ? String(parseInt(qs.week, 10)) : '1';
    const games = sched.weeks[weekStr] || [];
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true, season: sched.season, week: parseInt(weekStr,10), games,
        meta: { using: locateScheduleJSON().replace(process.cwd(), ''), dirname: __dirname }
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
