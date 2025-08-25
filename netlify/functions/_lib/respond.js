// netlify/functions/_lib/respond.js
export const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const ok = (data = {}) => json(200, { ok: true, ...data });
export const err = (message, extra = {}) =>
  json(200, { ok: false, error: message, ...extra });