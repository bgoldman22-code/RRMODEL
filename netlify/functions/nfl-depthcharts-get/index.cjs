'use strict';
const { readDepthCharts } = require('../_lib/common.cjs');
exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);
    const charts = await readDepthCharts(season, week);
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, week, teams:Object.keys(charts||{}).length, charts }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
