// netlify/functions/_blobs-helper.mjs
// Some functions import this older helper name. Keep it delegating to _blobs.js
import { getBlobsStore } from './_blobs.js';
export const getSafeStore = getBlobsStore;
export const openStore = getBlobsStore;
export const makeStore = (name) => getBlobsStore(name);
export default { getSafeStore, openStore, makeStore };
