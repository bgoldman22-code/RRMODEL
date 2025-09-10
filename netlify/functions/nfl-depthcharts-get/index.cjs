const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  try {
    const season = event.queryStringParameters.season || '2025';
    const week = event.queryStringParameters.week || 'current';

    const store = getStore('nfl-td');

    // blob keys we’ll try in order
    const keys = [
      `depth/season/${season}/week${week}.json`,                 // new style
      `depth/season/${season}/week${week}/depth-charts.json`,    // legacy
      `depth/season/${season}/current.json`                      // current fallback
    ];

    let data;
    let foundKey = null;

    for (const key of keys) {
      const res = await store.get(key, { type: 'json' });
      if (res) {
        data = res;
        foundKey = key;
        break;
      }
    }

    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'No depth chart found' }) };
    }

    // slice each team to standard roster lengths
    const sliced = {};
    for (const [team, pos] of Object.entries(data)) {
      sliced[team] = {
        QB: (pos.QB || []).slice(0, 2),
        RB: (pos.RB || []).slice(0, 3),
        WR: (pos.WR || []).slice(0, 6),
        TE: (pos.TE || []).slice(0, 3),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        season,
        week,
        charts: sliced,
        source: `blobs:${foundKey}`
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
