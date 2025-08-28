// netlify/functions/env-dump.mjs
// Temporary debug endpoint to confirm runtime env (doesn't leak secrets)
export const handler = async () => {
  const keys = [
    'NETLIFY_SITE_ID',
    'NETLIFY_BLOBS_TOKEN',
    'BLOBS_STORE',
    'NODE_ENV'
  ];
  const result = {};
  for (const k of keys) {
    const v = process.env[k];
    result[k] = v ? (k.includes('TOKEN') ? '***present***' : v) : null;
  }
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, env: result })
  };
};
