// netlify/functions/odds-status/index.cjs
// CommonJS wrapper so Netlify can bootstrap an ESM handler without ERR_REQUIRE_ESM.
exports.handler = async (event, context) => {
  const mod = await import('./handler.mjs');
  return mod.handler(event, context);
};
