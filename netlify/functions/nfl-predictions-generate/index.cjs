'use strict';

/**
 * Netlify Function: nfl-predictions-generate
 * This version ensures we ALWAYS return a proper Lambda response
 * to avoid "invalid status code returned from lambda: 0".
 *
 * Query params:
 *  - force=true (existing)
 *  - source=odds|schedule (optional)
 *  - limit=<n> (optional)
 *  - log=debug|info (optional; overrides LOG_LEVEL)
 */

const { ok, badRequest, internalError } = require('../_lib/http.cjs');
const { log } = require('../_lib/logger.cjs');

// Dummy predict function; in your repo this will already be implemented.
// We keep a safe fallback so the function never throws because of undefined variables.
async function generatePredictions({ source = 'auto', limit }) {
  try {
    // IMPORTANT: Replace this stub with your actual logic.
    // We just return an empty array to prove the function shape works.
    const rows = [];
    return { ok: true, source: 'stub', rows: Array.isArray(rows) ? rows.slice(0, limit || rows.length) : [] };
  } catch (err) {
    // Bubble up, caller will convert to 500
    throw err;
  }
}

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return ok({ ok: true });
  }

  try {
    const q = event.queryStringParameters || {};
    if (q.log) process.env.LOG_LEVEL = q.log;
    const limit = q.limit ? parseInt(q.limit, 10) : undefined;
    const source = q.source || 'auto';

    log.info('nfl-predictions-generate start', { source, limit });

    const result = await generatePredictions({ source, limit });

    // Always defined shape
    const rows = Array.isArray(result.rows) ? result.rows : [];
    log.debug('rows_count', rows.length, 'sample', rows[0] || null);

    return ok({
      ok: true,
      updated: new Date().toISOString(),
      meta: { source: result.source || source },
      rows
    });
  } catch (err) {
    log.error('handler_error', err && err.stack || String(err));
    return internalError(err);
  }
};
