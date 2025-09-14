'use strict';
// CJS bridge into the ESM helper so CommonJS functions can call openStore(...)
exports.openStore = async function openStore(opts) {
  const mod = await import('./blobs-helper.mjs');
  return mod.openStore(opts);
};
