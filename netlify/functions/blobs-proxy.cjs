// netlify/functions/blobs-proxy.cjs
const { getBlobsStore } = require('./_blobs.cjs');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const params = new URLSearchParams(event.rawQuery || event.queryStringParameters || '');
    const key = params.get('key');
    const storeName = params.get('store') || 'nfl-td';
    if (!key) {
      return { statusCode: 400, body: 'Missing ?key=...' };
    }

    const store = getBlobsStore(storeName);
    const data = await store.get(key);
    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'Not found', key }) };
    }
    // return the raw JSON if it looks like JSON; otherwise return as text
    let body = data;
    let headers = { 'Content-Type': 'application/json; charset=utf-8' };
    try {
      // ensure it is valid JSON
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      body = JSON.stringify(parsed);
    } catch (_) {
      headers['Content-Type'] = 'text/plain; charset=utf-8';
    }
    return { statusCode: 200, headers, body };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};