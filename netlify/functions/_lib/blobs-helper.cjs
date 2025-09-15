// CJS bridge -> ESM helper
const { createRequire } = require('module');
const require2 = createRequire(import.meta ? import.meta.url : __filename);

async function load() {
  const mod = await import('./blobs-helper.mjs');
  return mod;
}

exports.loadFromBlobs = async function(key){ const m = await load(); return m.loadFromBlobs(key); };
exports.saveToBlobs = async function(key, data){ const m = await load(); return m.saveToBlobs(key, data); };
exports.getStoreNameEffective = function(){ return require2('./blobs-helper.mjs').then(m => m.getStoreNameEffective()); };
