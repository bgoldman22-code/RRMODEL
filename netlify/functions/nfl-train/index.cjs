// CJS -> ESM bridge in case the function directory is referenced directly by the bundler.
exports.handler = async (event, context) => {
  const mod = await import('./index.mjs');
  if (!mod || typeof mod.handler !== 'function') {
    throw new Error('nfl-train/index.cjs: index.mjs did not export a handler');
  }
  return mod.handler(event, context);
};
