import { get, put } from '@netlify/blobs';

export async function blobsGetJSON(key, defaultValue = null) {
  const res = await get(key);
  if (!res) return defaultValue;
  const text = await res.text();
  try { return JSON.parse(text); } catch { return defaultValue; }
}

export async function blobsPutJSON(key, obj) {
  const body = JSON.stringify(obj);
  await put(key, body, { contentType: 'application/json' });
  return { key, bytes: body.length };
}
