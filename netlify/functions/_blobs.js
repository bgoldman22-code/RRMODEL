// netlify/functions/_blobs.js
// Minimal helper to read/write JSON blobs using Netlify Blobs.
// Prefers Netlify runtime context; falls back to explicit SITE_ID + TOKEN if provided.
const { Blobs } = require('@netlify/blobs');

function getEnv(name, dflt = undefined) {
  return process.env[name] ?? dflt;
}

function getBlobsStore(namespaceDefault = 'rrmodelblobs') {
  const siteID = getEnv('NETLIFY_SITE_ID');
  const token  = getEnv('NETLIFY_BLOBS_TOKEN') || getEnv('NETLIFY_AUTH_TOKEN') || getEnv('NETLIFY_API_TOKEN');
  const store  = getEnv('BLOBS_STORE', namespaceDefault);

  const opts = {};
  if (siteID && token) {
    opts.siteID = siteID;
    opts.token  = token;
  }
  const client = new Blobs(opts);
  return {
    async get(key) {
      const res = await client.get(key, { consistency: 'strong' });
      if (!res) return null;
      return typeof res === 'string' ? res : await res.text();
    },
    async put(key, value) {
      const body = typeof value === 'string' ? value : JSON.stringify(value);
      await client.set(key, body, { contentType: 'application/json' });
      return { key, bytes: Buffer.byteLength(body) };
    },
    async del(key) {
      await client.delete(key);
    },
    store,
  };
}

module.exports = { getBlobsStore };
