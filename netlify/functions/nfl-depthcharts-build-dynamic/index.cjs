'use strict';
const { getBlobsStore } = require('../_blobs.js');

function pickNames(arr, key) {
  return arr.map(o => o[key || 'player']).filter(Boolean);
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const season = String(qs.season || '2025');
  const week = parseInt(String(qs.week || '1'), 10);
  const lookback = parseInt(String(qs.lookback || '5'), 10);

  const store = getBlobsStore(process.env.BLOBS_STORE_NFL || 'nfl-td');
  const priorsKey = `history/${season}/pbp-priors.json`;
  let priors = null;
  try {
    const raw = await store.get(priorsKey);
    if (raw) priors = JSON.parse(raw.body);
  } catch (_) {}

  if (!priors || !priors.byTeam) {
    return { statusCode: 200, headers: {'content-type':'application/json'},
      body: JSON.stringify({ ok:false, error:'Missing priors and no current-season history; run nfl-history-fetch-nflverse first', expect:[priorsKey] }) };
  }

  const charts = {};
  for (const [team, by] of Object.entries(priors.byTeam)) {
    charts[team] = {
      QB: pickNames(by.QB).slice(0, 3),
      RB: pickNames(by.RB).slice(0, 3),
      WR: pickNames(by.WR).slice(0, 3),
      TE: pickNames(by.TE).slice(0, 3),
    };
  }

  const key = `depth/${season}/week${week}/depth-charts.json`;
  await store.set(key, JSON.stringify(charts, null, 2), { contentType:'application/json; charset=utf-8' });

  return { statusCode: 200, headers: {'content-type':'application/json'},
    body: JSON.stringify({ ok:true, season, week, saved:key, source:'priors' }) };
};
