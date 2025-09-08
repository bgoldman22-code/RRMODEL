'use strict';
const { readSchedule } = require('../_lib/common.cjs');
exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const schedule = await readSchedule(season);
    const weeks = schedule.weeks || {};
    const summary = Object.fromEntries(Object.entries(weeks).map(([wk, arr]) => [wk, Array.isArray(arr) ? arr.length : 0]));
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, weekCounts: summary }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
