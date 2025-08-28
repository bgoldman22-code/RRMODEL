// netlify/functions/_lib/http.mjs

// Parse JSON body from a Netlify event (handles base64)
export function getJSON(event) {
  try {
    if (!event) return null;
    if (event.isBase64Encoded && event.body) {
      const buf = Buffer.from(event.body, 'base64').toString('utf8');
      return buf ? JSON.parse(buf) : null;
    }
    if (event.body) {
      return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Convenience: return a 200 with JSON
export function ok(data, extraHeaders) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json', ...(extraHeaders || {}) },
    body
  };
}

// Convenience: return a 4xx/5xx with JSON
export function bad(codeOrErr, data, extraHeaders) {
  const statusCode = typeof codeOrErr === 'number' ? codeOrErr : 400;
  const payload = data ?? (typeof codeOrErr === 'object' && codeOrErr !== null
    ? { ok: false, error: String(codeOrErr.message || codeOrErr) }
    : { ok: false });

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...(extraHeaders || {}) },
    body
  };
}
