// netlify/functions/lib/blobs.js
import { getStore, blobs } from '@netlify/blobs';

/** Safe store getter: bound → env-manual → null */
export function getSafeStore(nameEnv = 'BLOBS_STORE') {
  const name = process.env[nameEnv] || 'mlb-odds';
  try {
    const store = getStore(name);
    if (store) return store;
  } catch {}
  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN;
    if (siteID && token) return blobs.connect({ siteID, token, name });
  } catch {}
  return null;
}
