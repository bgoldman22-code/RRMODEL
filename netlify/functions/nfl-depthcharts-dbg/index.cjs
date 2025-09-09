// netlify/functions/nfl-depthcharts-dbg/index.cjs
const path = require('path');
const fs = require('fs/promises');
const { getBlobsStore } = require('../_blobs.js');

exports.handler = async () => {
  const info = {
    node: process.version,
    env: {
      HAS_SITE_ID: !!process.env.NETLIFY_SITE_ID,
      HAS_TOKEN: !!process.env.NETLIFY_BLOBS_TOKEN
    },
    attempts: [],
    local: {}
  };

  try {
    const store = getBlobsStore('nfl-td');
    const probeKey = 'diagnostics/dbg-probe.json';
    await store.set(probeKey, JSON.stringify({ ok: true, ts: Date.now() }), { contentType: 'application/json' });
    const v = await store.get(probeKey);
    info.attempts.push({ method: 'helper:getStore(name,{siteID,token})', ok: !!v });
  } catch (e) {
    info.attempts.push({ method: 'helper:getStore(name,{siteID,token})', ok: false, error: String(e) });
  }

  const base = path.join(__dirname, '..', 'nfl-depthcharts-get', '_data', 'nfl');
  const curr = path.join(base, 'current.json');
  const wk1  = path.join(base, '2025', 'week1', 'depth-charts.json');

  const currExists = !!(await fs.readFile(curr, 'utf8').catch(() => null));
  const wk1Exists  = !!(await fs.readFile(wk1, 'utf8').catch(() => null));

  info.local = {
    here: __dirname,
    exists: { current: currExists, week1: wk1Exists },
    paths: { current: curr, week1: wk1 }
  };

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, info })
  };
};
