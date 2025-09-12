// netlify/functions/_blobs.js
// Thin wrapper around @netlify/blobs with lazy require and JSON helpers.
// This guards against "Blobs is not a constructor" / missing dep causing HTML 500s.
function getStoreLazy() {
  try {
    const { getStore } = require('@netlify/blobs');
    const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'rrmodelblobs';
    // On Netlify Functions in production, credentials are auto-provisioned.
    return getStore({ name });
  } catch (e) {
    const err = new Error(`[blobs] require('@netlify/blobs') failed: ${e && e.message}`);
    err.code = 'BLOBS_IMPORT_FAIL';
    throw err;
  }
}

const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

exports.get = async (key) => {
  try {
    const store = getStoreLazy();
    const raw = await store.get(key, { type: 'text' });
    if (!raw) return null;
    return safeParse(raw);
  } catch (e) {
    return { ok:false, error:String(e), where:'_blobs.get', key };
  }
};

exports.set = async (key, value) => {
  try {
    const store = getStoreLazy();
    const body = JSON.stringify(value);
    await store.set(key, body);
    return true;
  } catch (e) {
    return { ok:false, error:String(e), where:'_blobs.set', key };
  }
};

exports.del = async (key) => {
  try {
    const store = getStoreLazy();
    await store.delete(key);
    return true;
  } catch (e) {
    return { ok:false, error:String(e), where:'_blobs.del', key };
  }
};
