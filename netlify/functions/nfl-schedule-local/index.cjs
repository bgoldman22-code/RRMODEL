'use strict';
const fs = require('fs');
const path = require('path');

function dataPath() { return path.resolve(__dirname, './_data/schedule.json'); }
function readSchedule() { return JSON.parse(fs.readFileSync(dataPath(), 'utf8')); }

exports.handler = async (event) => {
  try {
    const sched = readSchedule();
    const qs = (event && event.queryStringParameters) || {};
    const weekStr = qs.week ? String(parseInt(qs.week, 10)) : '1';
    const games = sched.weeks[weekStr] || [];
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, season: sched.season, week: parseInt(weekStr,10), games, meta: { dataPath: dataPath(), dirname: __dirname } })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err), meta: { dataPath: dataPath(), dirname: __dirname } }) };
  }
};
