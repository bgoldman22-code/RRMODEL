const { getNFLStore, NFL_STORE_NAME } = require('../_blobs.js');

const TEAMS = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAR","LAC","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];

function emptyCharts() {
  const charts = {};
  for (const t of TEAMS) charts[t] = { QB: [], RB: [], WR: [], TE: [] };
  return charts;
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const season = parseInt(q.season || '2025', 10);
    const week = parseInt(q.week || '1', 10);
    const store = getNFLStore(); // explicit 'nfl-td'

    const payload = { season, week, charts: emptyCharts() };

    const currentKey = 'depth/current.json';
    const weeklyKey = `depth/${season}/week${week}/depth-charts.json`;

    await store.set(currentKey, JSON.stringify(payload), { contentType: 'application/json; charset=utf-8' });
    await store.set(weeklyKey, JSON.stringify(payload), { contentType: 'application/json; charset=utf-8' });

    return {
      statusCode: 200,
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ ok:true, store:NFL_STORE_NAME, wrote:[currentKey, weeklyKey] })
    };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.stack || err) }) };
  }
};