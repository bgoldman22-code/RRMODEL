import { NetlifyBlobs } from '@netlify/blobs';

export function makeStore(name) {
  const client = new NetlifyBlobs();
  return client.getStore(name);
}