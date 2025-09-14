/**
 * Runtime-safe Netlify Blobs helper.
 */
export async function openStore(name, opts = {}) {
  const env = opts.env || process.env || {};
  let blobs;
  try {
    blobs = await import('@netlify/blobs');
  } catch (e) {
    throw new Error('[blobs-helper] Failed to import @netlify/blobs: ' + e.message);
  }
  if (typeof blobs.getStore === 'function') {
    return blobs.getStore({ name });
  }
  if (typeof blobs.createClient !== 'function') {
    throw new Error('[blobs-helper] @netlify/blobs.createClient is not available. Please update @netlify/blobs to v5+ or run in Netlify runtime.');
  }
  const siteID = opts.siteID || env.NETLIFY_SITE_ID || env.SITE_ID;
  const token  = opts.token  || env.NETLIFY_AUTH_TOKEN || env.AUTH_TOKEN;
  if (!siteID || !token) {
    throw new Error('The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: siteID, token');
  }
  const client = blobs.createClient({ siteID, token });
  if (typeof client.store === 'function') return client.store(name);
  if (typeof client.getStore === 'function') return client.getStore({ name });
  throw new Error('[blobs-helper] Unable to obtain store from createClient. Check @netlify/blobs version.');
}
