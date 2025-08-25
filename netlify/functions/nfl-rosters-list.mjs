// netlify/functions/nfl-rosters-list.mjs
import { openStore } from "./_lib/blobs-helper.mjs";
import { ok } from "./_lib/respond.js";

export const handler = async () => {
  const store = openStore("nfl");
  const blobs = await (await store).list();
  return ok({ keys: { blobs, directories: [] } });
};