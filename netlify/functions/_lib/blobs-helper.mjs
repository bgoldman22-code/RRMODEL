// netlify/functions/_lib/blobs-helper.mjs
// ESM twin of getBlobsStore()
import { getStore } from '@netlify/blobs';

export function makeStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore(name, { siteID, token });
  }
  return getStore(name);
}
