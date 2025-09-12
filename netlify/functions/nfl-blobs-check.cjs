const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  try {
    const store = getStore({
      name: process.env.BLOBS_STORE_NFL || 'rrmodelblobs',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });

    await store.set('test-key', JSON.stringify({ ok: true, ts: Date.now() }));
    const val = await store.get('test-key', { type: 'json' });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, store: process.env.BLOBS_STORE_NFL, val }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String(err), env: process.env.BLOBS_STORE_NFL }),
    };
  }
};
