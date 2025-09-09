// netlify/functions/nfl-depthcharts-seed/index.cjs
const { getBlobsStore } = require('../_blobs.js');

const EMPTY_32 = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB',
  'HOU','IND','JAX','KC','LAR','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ',
  'PHI','PIT','SEA','SF','TB','TEN','WAS'
];

function scaffoldCharts() {
  const charts = {};
  for (const t of EMPTY_32) charts[t] = { RB: [], WR: [], TE: [], QB: [] };
  return charts;
}

exports.handler = async (event) => {
  const season = Number(event.queryStringParameters?.season || 2025);
  const week   = Number(event.queryStringParameters?.week   || 1);

  try {
    const store = getBlobsStore('nfl-td');

    const weekPayload = {
      ok: true,
      season,
      week,
      charts: scaffoldCharts(),
      meta: { seededAt: new Date().toISOString(), source: 'seed' }
    };

    const currentPayload = {
      ok: true,
      season,
      week,
      charts: scaffoldCharts(),
      meta: { seededAt: new Date().toISOString(), source: 'seed-current' }
    };

    const weekKey = `depth/season/${season}/week${week}.json`;
    const currKey = `depth/season/${season}/current.json`;

    await store.set(weekKey, JSON.stringify(weekPayload), { contentType: 'application/json' });
    await store.set(currKey, JSON.stringify(currentPayload), { contentType: 'application/json' });

    const probeStr = await store.get(currKey);
    const okWrite = !!probeStr;

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: okWrite, season, week, wrote: { weekKey, currKey } })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
};
