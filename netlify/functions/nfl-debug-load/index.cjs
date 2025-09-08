'use strict';
const { readSchedule, readDepthCharts, readHistory } = require('../_lib/common.cjs');

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);

    const schedule = await readSchedule(season);
    const games = schedule.weeks && (schedule.weeks[String(week)] || schedule.weeks[week]) || [];
    const depth = await readDepthCharts(season, week);
    const history = await readHistory(season);

    const depthTeams = Object.keys(depth || {});
    const sampleTeam = depthTeams[0] || null;
    const sample = sampleTeam ? depth[sampleTeam] : null;

    return {
      statusCode: 200,
      headers: {'content-type':'application/json'},
      body: JSON.stringify({
        ok: true,
        season, week,
        scheduleWeeksKeys: schedule.weeks ? Object.keys(schedule.weeks).slice(0,5) : null,
        gamesCount: Array.isArray(games) ? games.length : 0,
        firstGame: Array.isArray(games) && games[0] ? games[0] : null,
        depthTeamsCount: depthTeams.length,
        depthSampleTeam: sampleTeam,
        depthSample: sample,
        historyWeeks: history.map(h => ({ week: h.week, games: h.games?.length || 0 }))
      })
    };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
