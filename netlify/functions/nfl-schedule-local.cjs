'use strict';
const fs = require('fs');
const path = require('path');

function readSchedule() {
  const p = path.resolve(__dirname, './_data/nfl/2025/schedule.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

exports.handler = async (event) => {
  try {
    const sched = readSchedule();
    const query = event && event.queryStringParameters ? event.queryStringParameters : {};
    let week = query.week ? parseInt(query.week, 10) : 1;
    const games = sched.weeks[String(week)] || [];
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, season: sched.season, week, games })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
