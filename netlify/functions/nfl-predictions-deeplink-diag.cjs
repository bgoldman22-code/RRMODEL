const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  try {
    const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;
    const store = (siteID && token) ? getStore({ siteID, token, name }) : getStore(name);

    const data = await store.get('predictions/current.json', { type: 'json' });
    if (!data || !Array.isArray(data.rows)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, rows: 0, ml: 0, spread: 0, total: 0, note: 'No rows' }) };
    }

    let ml = 0, spread = 0, total = 0;
    for (const r of data.rows) {
      const p = r.predictions || {};
      if (p.moneyline?.best_book?.deep_link || r.ml_deep_link) ml++;
      if (p.spread?.best_book?.deep_link || r.spread_deep_link) spread++;
      if (p.total?.best_book?.deep_link || r.total_deep_link) total++;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, rows: data.rows.length, ml, spread, total, updated: data.updated })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
