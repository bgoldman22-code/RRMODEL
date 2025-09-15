/** odds-status (CJS) */
const path = require('path');
const pkg = { name: 'odds-status' };

exports.handler = async () => {
  // We don't *require* blobs here to avoid version errors, just report env + a quick probe.
  const store = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
  const now = new Date().toISOString();
  // Indicate whether team_form.json appears present by attempting a lightweight fetch via the ESM helper.
  let hasTeamForm = false;
  try {
    const helper = await import('../_lib/blobs-helper.mjs');
    const v = await helper.loadFromBlobs('team_form.json');
    hasTeamForm = !!v;
  } catch (_e) {
    // ignore; keep hasTeamForm false
  }
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, store, hasTeamForm, now })
  };
};
