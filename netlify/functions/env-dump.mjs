// netlify/functions/env-dump.mjs
export const handler = async () => {
  const mask = (v) => (v ? (v.slice(0, 4) + '…' + v.slice(-4)) : null);
  const pick = (k) => process.env[k] ?? null;

  const keys = [
    'BLOBS_STORE',
    'BLOBS_STORE_NFL',
    'NETLIFY_SITE_ID',
    'NETLIFY_BLOBS_TOKEN',
    'NETLIFY_API_TOKEN',
    'NETLIFY_AUTH_TOKEN',
    'ODDS_API_KEY',
    'ODDS_API_KEY_NFL',
    'THEODDS_API_KEY',
    'VITE_ODDS_API_KEY',
  ];

  const data = { ok: true };
  for (const k of keys) {
    const v = pick(k);
    data[k] = typeof v === 'string' && v.length > 10 ? mask(v) : v;
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  };
};
