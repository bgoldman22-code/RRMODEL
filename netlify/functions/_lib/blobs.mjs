export function getStoreName() {
  return process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
}
export async function openStore() {
  try {
    const mod = await import('@netlify/blobs');
    const { getStore } = mod;
    const opts = {};
    if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_API_TOKEN) {
      opts.siteID = process.env.NETLIFY_SITE_ID;
      opts.token = process.env.NETLIFY_API_TOKEN;
    }
    const store = getStore(getStoreName(), opts);
    return { store, ok: true, managed: !opts.siteID && !opts.token, error: null };
  } catch (err) {
    return { store: null, ok: false, managed: false, error: String(err) };
  }
}
export async function blobsHas(key) {
  const { store, ok } = await openStore();
  if (!ok || !store) return false;
  try { return !!(await store.has(key)); } catch { return false; }
}
export async function blobsGetJSON(key) {
  const { store, ok } = await openStore();
  if (!ok || !store) return { ok:false, value:null, error:"blobs_unavailable" };
  try {
    const res = await store.get(key);
    if (!res) return { ok:true, value:null };
    const text = await res.text();
    return { ok:true, value: JSON.parse(text) };
  } catch (e) {
    return { ok:false, value:null, error:String(e) };
  }
}
export async function blobsPutJSON(key, value) {
  const { store, ok } = await openStore();
  if (!ok || !store) return { ok:false, error:"blobs_unavailable" };
  try {
    await store.set(key, JSON.stringify(value), { contentType: "application/json" });
    return { ok:true };
  } catch (e) {
    return { ok:false, error:String(e) };
  }
}
