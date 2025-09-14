
function json(statusCode, bodyObj, headers = {}) {
  return {
    statusCode: statusCode || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...headers,
    },
    body: JSON.stringify(bodyObj ?? {}, null, 2),
  };
}

function ok(payload) {
  return json(200, { ok: true, ...(payload || {}) });
}

function fail(statusCode, message, details) {
  const code = statusCode >= 400 ? statusCode : 500;
  const body = { ok: false, error: message || 'error', details: details || {} };
  return json(code, body);
}

module.exports = { json, ok, fail };
