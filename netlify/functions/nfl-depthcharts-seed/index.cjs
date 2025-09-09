// netlify/functions/nfl-depthcharts-seed/index.cjs
const path = require('path');
const fs = require('fs');
const { getBlobsStore } = require('../_blobs.js');

function readLocalScaffold() {
  const here = __dirname;
  const local = path.join(here, '_data', 'nfl', 'current.json');
  if (fs.existsSync(local)) {
    return JSON.parse(fs.readFileSync(local, 'utf8'));
  }
  return { ok: true, teams: {}, note: 'empty scaffold (no local file found)' };
}

exports.handler = async () => {
  try {
    const store = getBlobsStore('nfl-td'); // sync helper
    const seed = readLocalScaffold();
    const key = 'depth/current.json';
    await store.set(key, JSON.stringify(seed), { contentType: 'application/json' });
    const check = await store.get(key);
    const size = check ? (await check.blob()).size : 0;
    return { statusCode: 200, body: JSON.stringify({ ok: true, wrote: key, bytes: size }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
