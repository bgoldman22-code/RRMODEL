
// netlify/functions/fd-proxy.cjs
// CommonJS (works fine when package.json has "type":"module")

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

exports.handler = async (event) => {
  try {
    const url = new URL(event.queryStringParameters?.url || '');
    if (!url || !/^https?:\/\//i.test(url.href)) {
      return json(400, { ok: false, error: 'missing_or_invalid_url' });
    }

    // Example: forward GET with minimal headers
    const resp = await fetch(url.href, {
      method: 'GET',
      headers: { 'user-agent': 'fd-proxy/1.0' },
      timeout: 15000
    });

    const text = await resp.text();
    return {
      statusCode: resp.status,
      headers: { 'content-type': resp.headers.get('content-type') || 'text/plain' },
      body: text
    };
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
