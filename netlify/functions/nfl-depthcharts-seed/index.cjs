// netlify/functions/nfl-depthcharts-seed/index.cjs
const { getBlobsStore } = require('../_blobs.js');

const TEAM_ALIASES = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE",
  "DAL","DEN","DET","GB","HOU","IND","JAX","KC",
  "LAR","LAC","LV","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"
];

function makeEmptyCharts() {
  const charts = {};
  for (const t of TEAM_ALIASES) {
    charts[t] = { RB: [], WR: [], TE: [], QB: [] };
  }
  return charts;
}

exports.handler = async (event) => {
  try {
    const season = Number(new URLSearchParams(event.queryStringParameters || {}).get('season')) || 2025;
    const week   = Number(new URLSearchParams(event.queryStringParameters || {}).get('week'))   || 1;

    const store = getBlobsStore('nfl-td');

    const payload = {
      ok: true,
      season,
      week,
      generated_at: new Date().toISOString(),
      charts: makeEmptyCharts(),
    };

    const weeklyKey  = `depth/${season}/week${week}/depth-charts.json`;
    const currentKey = `depth/current.json`;

    await store.set(weeklyKey, JSON.stringify(payload), { contentType: 'application/json' });
    await store.set(currentKey, JSON.stringify(payload), { contentType: 'application/json' });

    const probe = await store.get(weeklyKey);
    const okRead = Boolean(probe);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: okRead,
        wrote: [weeklyKey, currentKey],
        sampleExists: okRead
      })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
