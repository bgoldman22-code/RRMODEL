// patched blobs-helper.mjs
import { getStore } from "@netlify/blobs";

export function openStore(name) {
  return getStore(name || process.env.BLOBS_STORE_NFL || "nfl-td");
}
