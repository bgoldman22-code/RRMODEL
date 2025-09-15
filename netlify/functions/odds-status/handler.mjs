// netlify/functions/odds-status/handler.mjs
import { resolveStoreName, loadFromBlobs } from '../_lib/blobs-helper.mjs';

export async function handler() {
  const store = resolveStoreName();
  let modelInfo = null;
  try {
    modelInfo = await loadFromBlobs('team_form.json');
  } catch (e) {
    // ignore; may not exist yet
  }
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      store,
      hasTeamForm: !!modelInfo,
      now: new Date().toISOString()
    })
  };
}
