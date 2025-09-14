// ESM helper for Netlify Blobs that works in both Netlify runtime and local/dev
// - In Netlify runtime: uses blobs.getStore({ name })
// - Locally (or older environments): tries blobs.createClient({ siteID, token })
//   and returns client.store(name) (v5+) or client.getStore(name) (older)

export async function openStore(options = {}) {
  const {
    name,
    fallbackName,
    siteID: siteIDArg,
    token: tokenArg,
  } = options;

  const storeName =
    name ||
    process.env.BLOBS_STORE_NFL ||
    process.env.BLOBS_STORE ||
    fallbackName ||
    'rr-nfl';

  let blobs;
  try {
    blobs = await import('@netlify/blobs');
  } catch (err) {
    const e = new Error('[blobs-helper] @netlify/blobs not available. Add the dependency or run in Netlify runtime.');
    e.cause = err;
    throw e;
  }

  // Runtime path (Netlify provides getStore)
  if (typeof blobs.getStore === 'function') {
    return blobs.getStore({ name: storeName });
  }

  // Manual/local path (needs credentials)
  const siteID = siteIDArg || process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = tokenArg  || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;

  if (typeof blobs.createClient === 'function') {
    if (!siteID || !token) {
      const e = new Error('The environment has not been configured to use Netlify Blobs. To use it manually, supply siteID and token');
      e.name = 'MissingBlobsEnvironmentError';
      throw e;
    }
    const client = blobs.createClient({ siteID, token });
    if (client && typeof client.store === 'function') {
      return client.store(storeName);
    }
    if (client && typeof client.getStore === 'function') {
      return client.getStore(storeName);
    }
  }

  const e = new Error('[blobs-helper] @netlify/blobs.createClient is not available. Please update @netlify/blobs to v5+ or run in Netlify runtime.');
  e.name = 'BlobsNotAvailableError';
  throw e;
}

export default { openStore };
