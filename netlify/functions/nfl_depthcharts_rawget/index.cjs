const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  try {
    const key = event.queryStringParameters.key;
    if (!key) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Missing ?key=" }) };
    }

    const store = getStore('nfl-td');
    const data = await store.get(key, { type: 'json' });

    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, error: `No blob at ${key}` }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
