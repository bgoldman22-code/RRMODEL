// netlify/functions/nfl-predictions-generate/index.cjs
// If an ESM handler exists, use it; otherwise, provide a safe stub that never crashes.
exports.handler = async function(event, context) {
  try {
    try {
      const mod = await import('./index.mjs?' + Date.now());
      if (typeof mod.handler === 'function') {
        return await mod.handler(event, context);
      }
    } catch (e) {
      // fall through to stub
      console.warn('[predictions] ESM handler not found, using stub:', e?.message || e);
    }
    // Safe stub: ensures a valid JSON shape and logs query
    const qp = new URLSearchParams(event.queryStringParameters || {});
    const force = qp.get('force');
    const sample = [];
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        updated: new Date().toISOString(),
        meta: { source: 'stub', force },
        rows: sample
      })
    };
  } catch (err) {
    // Final safety net
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'GEN_CRASH', details: { message: String(err) } })
    };
  }
};
