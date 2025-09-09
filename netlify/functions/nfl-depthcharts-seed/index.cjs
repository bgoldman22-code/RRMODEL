const { getStore } = require('@netlify/blobs');

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
    const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE;
    if (!storeName) {
      return { statusCode: 400, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'BLOBS_STORE_NFL (or BLOBS_STORE) not set' }) };
    }

    const payload = { season, week, charts: emptyCharts() };
    const store = getStore(storeName);

    const currentKey = 'depth/current.json';
    const weeklyKey = `depth/${season}/week${week}/depth-charts.json`;

    await store.set(currentKey, JSON.stringify(payload), { contentType: 'application/json; charset=utf-8' });
    await store.set(weeklyKey, JSON.stringify(payload), { contentType: 'application/json; charset=utf-8' });

    return {
      statusCode: 200,
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ ok:true, store:storeName, wrote:[currentKey, weeklyKey] })
    };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.stack || err) }) };
  }
};