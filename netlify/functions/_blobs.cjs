// CommonJS shim around Netlify Blobs, for CJS handlers only.
const { createClient } = require('@netlify/blobs');

function client() {
  // Allow override of store via env; caller can also pass an explicit store.
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.TOKEN;
  const store = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
  const opts = {};
  if (siteID && token) opts.siteID = siteID, opts.token = token;
  return createClient({ ...opts, name: store });
}

exports.get = async (key) => {
  const c = client();
  try {
    const r = await c.get(key);
    return r?.body ?? null;
  } catch (e) {
    return null;
  }
};

exports.set = async (key, value, { contentType = 'application/json' } = {}) => {
  const c = client();
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  await c.set(key, body, { contentType });
  return true;
};
