// netlify/functions/nfl-train/index.cjs
// CJS bridge -> ESM handler to avoid "require() of ES Module not supported" crashes.
exports.handler = async function(event, context) {
  const mod = await import('./index.mjs?' + Date.now());
  if (typeof mod.handler !== 'function') {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'missing_handler_in_mjs' })
    };
  }
  return await mod.handler(event, context);
};
