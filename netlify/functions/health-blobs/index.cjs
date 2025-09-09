// netlify/functions/health-blobs/index.cjs
const { getBlobsStore } = require('../_blobs.js');

exports.handler = async () => {
  const info = {
    node: process.version,
    env: {
      HAS_SITE_ID: Boolean(process.env.NETLIFY_SITE_ID),
      HAS_TOKEN: Boolean(process.env.NETLIFY_BLOBS_TOKEN),
      SITE_ID_PREVIEW: (process.env.NETLIFY_SITE_ID || '').slice(0,4) + '…' + (process.env.NETLIFY_SITE_ID || '').slice(-4),
      TOKEN_PREVIEW: (process.env.NETLIFY_BLOBS_TOKEN || '').slice(0,4) + '…' + (process.env.NETLIFY_BLOBS_TOKEN || '').slice(-4),
    },
    attempts: []
  };

  try {
    const store = getBlobsStore('nfl-td'); // named store
    const key = `diagnostics/selftest-${Date.now()}.json`;
    const payload = { ok: true, ts: new Date().toISOString() };

    await store.set(key, JSON.stringify(payload), { contentType: 'application/json' });
    const res = await store.get(key);

    info.attempts.push({ step: 'write-read', key, ok: Boolean(res) });
    return { statusCode: 200, body: JSON.stringify({ ok: true, info }) };
  } catch (e) {
    info.attempts.push({ step: 'error', error: String(e) });
    return { statusCode: 200, body: JSON.stringify({ ok: false, info }) };
  }
};
