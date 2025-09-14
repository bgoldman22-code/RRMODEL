// CJS proxy to call ESM openStore from CommonJS modules
exports.openStore = async function(name, opts) {
  const mod = await import('./blobs-helper.mjs');
  if (!mod || typeof mod.openStore !== 'function') {
    throw new Error('[blobs-helper.cjs] openStore not found');
  }
  return mod.openStore(name, opts);
}
