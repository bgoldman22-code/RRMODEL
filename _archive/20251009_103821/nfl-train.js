// Root entry used by Netlify for the "nfl-train" function.
// Fixes "require() of ES Module ... index.mjs not supported" by using a dynamic import.
exports.handler = async (event, context) => {
  const mod = await import('./netlify/functions/nfl-train/index.mjs');
  if (!mod || typeof mod.handler !== 'function') {
    throw new Error('nfl-train: index.mjs did not export a handler');
  }
  return mod.handler(event, context);
};
