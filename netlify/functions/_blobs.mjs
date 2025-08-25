// netlify/functions/_blobs.mjs
// Resilient Blobs helpers. Never hard-fail when blobs are unavailable.
import { getStore as netlifyGetStore } from "@netlify/blobs";

export function parseQuery(event) {
  const url = new URL(event.rawUrl || `https://x.example${event.rawQuery ? ("?"+event.rawQuery) : ""}`);
  const q = Object.fromEntries(url.searchParams.entries());
  return q;
}

export function hasNetlifyContext(event) {
  // Netlify Functions Runtime v2 exposes event.context.blobs
  return Boolean(event?.context?.blobs);
}

export function blobsEnabled() {
  // Feature flag via env; accept either BLOBS_STORE_NFL or BLOBS_STORE presence as signal
  const hasStoreName = !!(process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE);
  const hasSite = !!process.env.NETLIFY_SITE_ID;
  return hasStoreName && hasSite;
}

export function resolveStoreName(event, fallbackName="nfl-td") {
  const q = parseQuery(event);
  // Allow overriding via query for quick tests: ?store=foo
  return q.store || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || fallbackName;
}

export function blobsDiag(event) {
  return {
    NFL_STORE_NAME: resolveStoreName(event),
    HAS_NETLIFY_BLOBS_CONTEXT: hasNetlifyContext(event),
    HAS_NETLIFY_SITE_ID: !!process.env.NETLIFY_SITE_ID
  };
}

export async function maybeGetStore(event, opts={}) {
  const q = parseQuery(event);
  if (q.noblobs === "1" || q.noblobs === "true") return null;
  if (!blobsEnabled()) return null;
  try {
    const name = resolveStoreName(event, opts.fallbackName || "nfl-td");
    // When running on Netlify, we don't need to pass siteID/token—runtime injects them.
    return netlifyGetStore({ name });
  } catch (err) {
    // Return null so callers can use in-memory fallbacks
    return null;
  }
}
