// netlify/functions/_lib/respond.js
export function ok(body = {}, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
export function err(message = 'error', status = 500, extra = {}) {
  return ok({ ok: false, error: message, ...extra }, status);
}
export function json(body, status = 200, headers = {}) {
  return ok(body, status, headers);
}
