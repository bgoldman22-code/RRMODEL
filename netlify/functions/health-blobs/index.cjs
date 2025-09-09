const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  const info = {
    node: process.version,
    env: {
      HAS_SITE_ID: Boolean(process.env.NETLIFY_SITE_ID),
      HAS_TOKEN: Boolean(process.env.NETLIFY_BLOBS_TOKEN),
    },
    attempt: null,
    error: null
  };

  try {
    // Explicit credentials path (bulletproof)
    const store = getStore('nfl-td', {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    });

    const key = `diagnostics/min-${Date.now()}.txt`;
    await store.set(key, 'ok', { contentType: 'text/plain' });
    const got = await store.get(key);
    info.attempt = { wrote: key, readOk: Boolean(got) };

    return { statusCode: 200, body: JSON.stringify({ ok: true, info }) };
  } catch (e) {
    info.error = String(e);
    return { statusCode: 200, body: JSON.stringify({ ok: false, info }) };
  }
};
