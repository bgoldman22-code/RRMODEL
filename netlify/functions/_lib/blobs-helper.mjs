// netlify/functions/_lib/blobs-helper.mjs
// Tiny wrapper to satisfy imports like "./_lib/blobs-helper.mjs"
import { getBlobsStore } from '../_blobs.js';
export const getSafeStore = getBlobsStore;
export const openStore = getBlobsStore;
export const makeStore = (name) => getBlobsStore(name);
export default { getSafeStore, openStore, makeStore };
