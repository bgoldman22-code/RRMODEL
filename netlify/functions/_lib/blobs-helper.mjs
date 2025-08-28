import { getStore } from "@netlify/blobs";

export async function openStore(name = process.env.BLOBS_STORE || "mlb-odds"){
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.BLOBS_TOKEN;
  const opts = {};
  if (siteID && token){ opts.siteID = siteID; opts.token = token; }
  return getStore(name, opts);
}

export async function getJSON(store, key){
  const val = await store.get(key);
  if (!val) return null;
  try{ return JSON.parse(val); }catch{ return null; }
}
