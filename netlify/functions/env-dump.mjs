// netlify/functions/env-dump.mjs
export const handler = async () => {
  const mask = (v) => v ? (v[:4] + "…" + v[-4:]) : null;
  const safe = (v) => {
    if (!v) return null;
    if (v.length <= 8) return "****";
    return v.slice(0,4) + "…" + v.slice(-4);
  };
  const body = {
    ok: true,
    NODE_ENV: process.env.NODE_ENV || null,
    BLOBS_STORE: process.env.BLOBS_STORE || null,
    NETLIFY_SITE_ID: safe(process.env.NETLIFY_SITE_ID || ""),
    NETLIFY_BLOBS_TOKEN: safe(process.env.NETLIFY_BLOBS_TOKEN || ""),
    HAS_NETLIFY_CONTEXT: !!process.env.NETLIFY,
  };
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
};
