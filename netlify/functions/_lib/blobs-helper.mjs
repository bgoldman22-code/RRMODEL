import { getBlobsStore } from "../_blobs.mjs";

export function makeStore(name) {
  return getBlobsStore(name);
}
