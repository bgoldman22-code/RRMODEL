import { getStore } from '@netlify/blobs';

export function makeStore(name) {
  return getStore(name);
}