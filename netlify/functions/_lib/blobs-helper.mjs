// netlify/functions/_lib/blobs-helper.mjs
import { getStore } from "@netlify/blobs";
export function makeStore(name = "rrmodel") {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.siteID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_BLOBS_WRITE_TOKEN || process.env.BLOBS_TOKEN;
  const opts = { name };
  if (siteID && token) { opts.siteID = siteID; opts.token = token; }
  return getStore(opts);
}
