// CommonJS helpers for Netlify function responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(body, statusCode = 200, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body)
  };
}

function ok(payload = {}) {
  return json({ ok: true, ...payload }, 200);
}

function badRequest(message = 'Bad Request', details) {
  return json({ ok: false, error: message, details }, 400);
}

function internalError(message = 'Internal Server Error', details) {
  return json({ ok: false, error: message, details }, 500);
}

module.exports = { ok, badRequest, internalError };
