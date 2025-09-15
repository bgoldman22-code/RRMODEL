// netlify/functions/nfl-train/index.cjs
exports.handler = async (event, context) => {
  const mod = await import('./handler.mjs');
  return mod.handler(event, context);
};
