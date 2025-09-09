import { getStore } from '@netlify/blobs';
export const NFL_STORE_NAME = 'nfl-td';
export function makeNFLStore() {
  return getStore(NFL_STORE_NAME);
}