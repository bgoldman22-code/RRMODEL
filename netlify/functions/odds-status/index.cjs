// CommonJS Netlify Function: odds-status
const blobs = require('../_blobs.cjs');

exports.handler = async () => {
  const store = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
  let hasTeamForm = false;
  try {
    const tf = await blobs.get('team_form.json');
    hasTeamForm = !!tf;
  } catch {}
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, store, hasTeamForm, now: new Date().toISOString() })
  };
};
