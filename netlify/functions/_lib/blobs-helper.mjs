// netlify/functions/_lib/blobs-helper.mjs
import { getStore, createClient } from '@netlify/blobs';

export function makeStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  try {
    if (siteID && token && createClient) {
      const client = createClient({ siteID, token });
      if (client && client.getStore) return client.getStore(name);
    }
  } catch {}

  try {
    if (siteID && token) return getStore(name, { siteID, token });
  } catch {}

  try {
    if (siteID && token) return getStore({ name, siteID, token });
  } catch {}

  return getStore(name);
}
