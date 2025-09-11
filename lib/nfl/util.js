// lib/nfl/util.js
const fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));

function env(name, def=null) {
  return process.env[name] ?? def;
}

function nowISO() {
  return new Date().toISOString();
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

// Simple blobs wrapper (optional). If not configured, becomes no-op in-memory.
let memoryStore = {};
const siteId = env("NETLIFY_SITE_ID");
const token  = env("NETLIFY_BLOBS_TOKEN") || env("NETLIFY_AUTH_TOKEN") || env("NETLIFY_API_TOKEN");
const storeName = env("BLOBS_STORE_NFL") || env("BLOBS_STORE") || "predictions-nfl";

async function blobsGet(key) {
  if (!siteId || !token) return memoryStore[key] ?? null;
  const url = `https://api.netlify.com/api/v1/sites/${siteId}/blobs/${encodeURIComponent(storeName)}/${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`blobsGet ${key} -> ${res.status}`);
  return res.text();
}

async function blobsPut(key, text) {
  if (!siteId || !token) { memoryStore[key] = text; return true; }
  const url = `https://api.netlify.com/api/v1/sites/${siteId}/blobs/${encodeURIComponent(storeName)}/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "text/plain" },
    body: text
  });
  if (!res.ok) throw new Error(`blobsPut ${key} -> ${res.status}`);
  return true;
}

module.exports = { env, nowISO, getJSON, blobsGet, blobsPut };
