// netlify/functions/_blobs.js
import { getStore } from '@netlify/blobs';

// Create a store by name. Falls back to env defaults.
export function makeStore(opts = {}) {
  const storeName =
    opts.name ||
    process.env.BLOBS_STORE_NFL ||
    process.env.BLOBS_STORE ||
    'nfl-td';

  const siteID = opts.siteID || process.env.NETLIFY_SITE_ID;
  const token = opts.token || process.env.NETLIFY_AUTH_TOKEN;

  // Attempt to create a store. If Netlify Blobs is not configured, return null.
  try {
    const store = getStore({ name: storeName, siteID, token });
    return store;
  } catch (err) {
    // return null so callers can gracefully skip blobs
    return null;
  }
}

// Helper used inside functions. Honors ?noblobs=1 and BLOBS_DISABLED=1
export function getBlobsStore(event, { allowFallback = true } = {}) {
  try {
    const rawUrl = event?.rawUrl ||
      (event?.headers?.host ? `https://${event.headers.host}${event.path || ''}${event.rawQuery ? '?' + event.rawQuery : ''}` : 'https://example.com');
    const url = new URL(rawUrl);

    if (url.searchParams.get('noblobs') === '1' || process.env.BLOBS_DISABLED === '1') {
      return null;
    }
  } catch (_) {
    // If URL parsing fails, continue and attempt to use blobs
  }
  return makeStore();
}

// Back-compat for files importing { createStore } specifically
export function createStore(name) {
  return makeStore({ name });
}
