'use strict';
// CJS -> ESM bridge so Netlify can require() this file while your logic stays in index.mjs
// This prevents: "Error: require() of ES Module ... index.mjs not supported"
exports.handler = async (event, context) => {
  const mod = await import('./index.mjs');
  const handler = mod.handler || mod.default || (mod.exports && mod.exports.handler);
  if (typeof handler !== 'function') {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'nfl-train missing `handler` export in index.mjs' }),
    };
  }
  return handler(event, context);
};
