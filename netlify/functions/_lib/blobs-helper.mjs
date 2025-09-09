import { createClient } from '@netlify/blobs';

export function makeStore(name) {
  const client = createClient();
  return client.getStore(name);
}