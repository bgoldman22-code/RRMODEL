import { ok } from '../_lib/util.mjs';
export const handler = async () => {
  console.log('[DIAG] ok');
  return ok({ ok: true, msg: "diag ok" });
};
