// netlify/functions/_lib/blobs-helper.mjs
import { getStore, blobs } from '@netlify/blobs';

/** Create a store by name using bound blobs or env token */
export function makeStore(name = 'mlb-odds') {
  try {
    const s = getStore(name);
    if (s) return s;
  } catch {}
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return blobs.connect({ siteID, token, name });
  return null;
}

export function openStore(name='mlb-odds'){ return makeStore(name); }
