// netlify/functions/ping.mjs
export async function handler() {
  return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, t: Date.now() }) };
}
