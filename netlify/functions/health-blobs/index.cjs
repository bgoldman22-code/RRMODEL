// netlify/functions/health-blobs/index.cjs
// Enhanced health check: tests both explicit and implicit getStore calls.
const { getStore } = require('@netlify/blobs');

function short(s) {
  if (!s) return null;
  return s.slice(0, 4) + "…" + s.slice(-4);
}

async function test(name, opts, label) {
  const res = { label, ok: false };
  try {
    const store = opts ? getStore(name, opts) : getStore(name);
    const key = `diagnostics/health-${label}-${Date.now()}.json`;
    const payload = { ok: true, label, ts: new Date().toISOString() };
    await store.set(key, JSON.stringify(payload), { contentType: 'application/json' });
    const got = await store.get(key);
    res.ok = Boolean(got);
    if (got) res.bytes = (await got.blob()).size;
    res.key = key;
  } catch (e) {
    res.error = String(e);
  }
  return res;
}

exports.handler = async () => {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  const info = {
    node: process.version,
    env: {
      HAS_SITE_ID: Boolean(siteID),
      HAS_TOKEN: Boolean(token),
      SITE_ID_PREVIEW: short(siteID),
      TOKEN_PREVIEW: short(token)
    },
    tests: []
  };

  // Try explicit creds first
  info.tests.push(await test("nfl-td", (siteID && token) ? { siteID, token } : null, "explicit"));

  // Then implicit (platform-provided)
  info.tests.push(await test("nfl-td", null, "implicit"));

  const ok = info.tests.some(t => t.ok);
  return { statusCode: 200, body: JSON.stringify({ ok, info }) };
};
