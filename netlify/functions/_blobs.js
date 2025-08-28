// netlify/functions/_blobs.js
import { getStore } from '@netlify/blobs';
export function getBlobsStore(name = 'mlb-odds') {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}
