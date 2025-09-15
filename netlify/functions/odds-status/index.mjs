import { ok } from '../_lib/util.mjs';
import { getStoreName, blobsHas } from '../_lib/blobs.mjs';

export const handler = async () => {
  const hasTeamForm = await blobsHas('team_form.json');
  return ok({ ok:true, store: getStoreName(), hasTeamForm, now: new Date().toISOString() });
};
