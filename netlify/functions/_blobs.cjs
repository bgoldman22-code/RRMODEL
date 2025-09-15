// netlify/functions/_blobs.cjs
// CommonJS shim helpers (if your code expects require/exports style)
const { handler: diagHandler } = (() => {
  return { handler: async () => ({ statusCode: 200, body: JSON.stringify({ ok: true }) }) };
})();

exports.handler = async (event) => {
  if (event && event.queryStringParameters && event.queryStringParameters.ping) {
    return { statusCode: 200, body: 'pong' };
  }
  return diagHandler(event);
};
