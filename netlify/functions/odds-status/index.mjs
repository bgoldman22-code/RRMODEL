import { hasKey } from "../_lib/blobs-helper.mjs";

export async function handler() {
  const store = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
  const hasTeamForm = await hasKey("team_form.json", store);
  return {
    statusCode: 200,
    body: JSON.stringify({ ok:true, store, hasTeamForm, now: new Date().toISOString() })
  };
}

export default { handler };
