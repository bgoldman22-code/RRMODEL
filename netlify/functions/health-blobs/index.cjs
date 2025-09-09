// netlify/functions/health-blobs/index.cjs
const { getStore } = require('@netlify/blobs');

function getExplicitStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore(name, { siteID, token });
  }
  return getStore(name);
}

exports.handler = async () => {
  const info = {
    node: process.version,
    env: {
      HAS_SITE_ID: Boolean(process.env.NETLIFY_SITE_ID),
      HAS_TOKEN: Boolean(process.env.NETLIFY_BLOBS_TOKEN),
    },
    tests: []
  };

  try {
    const store = getExplicitStore('nfl-td'); // explicit named store
    const key = `diagnostics/selftest-${Date.now()}.json`;
    const payload = { ok: true, ts: new Date().toISOString() };
    await store.set(key, JSON.stringify(payload), { contentType: 'application/json' });
    const res = await store.get(key);
    info.tests.push({ step: 'write-read', key, ok: Boolean(res) });
    return { statusCode: 200, body: JSON.stringify({ ok: true, info }) };
  } catch (e) {
    info.tests.push({ step: 'error', error: String(e) });
    return { statusCode: 200, body: JSON.stringify({ ok: false, info }) };
  }
};
