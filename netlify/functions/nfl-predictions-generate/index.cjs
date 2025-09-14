/**
 * Robust handler wrapper for nfl-predictions-generate
 * - Always returns a valid { statusCode, headers, body }
 * - Fixes "rows is not defined" by scoping rows
 * - Adds logging of counts and a preview row
 * - No illegal 'finally' tokens
 */
const { ok, badRequest, internalError } = require('../_lib/http.cjs');
const Log = require('../_lib/logger.cjs');
const { openStore } = require('../_lib/blobs-helper.mjs'); // ESM re-export works in esbuild bundler

// Optional: environment keys used by the model/generator
const KEY_CACHE = 'nfl:predictions:latest';

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      // CORS preflight
      return ok({});
    }

    const url = new URL(event.rawUrl || ('https://x.local' + (event.path || '')) + (event.rawQuery || ''));
    const params = url.searchParams;
    const limit = Math.max(0, Math.min(500, parseInt(params.get('limit') || '0', 10) || 0));
    const force = params.get('force') === 'true';
    const wantDebug = (params.get('log') === 'debug');
    if (wantDebug) process.env.LOG_LEVEL = 'debug';

    // Load from blobs (if present)
    const store = openStore({});
    let cached = await store.getJSON(KEY_CACHE, null);
    if (force || !cached) {
      // If your real generation runs here, ensure it ALWAYS produces an array.
      // For now, keep stub structure and never crash.
      const nowISO = new Date().toISOString();
      cached = { ok: true, updated: nowISO, meta: { source: force ? 'force-stub' : 'stub' }, rows: [] };
      await store.setJSON(KEY_CACHE, cached);
    }

    // Ensure rows is always a scoped array
    let rows = Array.isArray(cached.rows) ? cached.rows : [];

    // Optional limiting for sanity checks
    if (limit > 0 && rows.length > limit) {
      rows = rows.slice(0, limit);
    }

    // Logging
    Log.info('nfl-predictions-generate result', { count: rows.length });
    if (rows.length) {
      Log.debug('first row preview', { row: Log.preview(rows[0]) });
    }

    return ok({ updated: cached.updated, meta: cached.meta || {}, rows });
  } catch (err) {
    // Last-resort guard: never return statusCode 0
    Log.error('nfl-predictions-generate fatal', { err: String(err), stack: (err && err.stack) ? String(err.stack).slice(0, 2000) : undefined });
    return internalError('Function crashed', { hint: 'See function logs', code: 'GEN_CRASH' });
  }
};
