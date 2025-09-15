// Netlify Blobs helper using modern client API.
import { createClient } from '@netlify/blobs';

function getClient() {
  // createClient() auto-reads env in Netlify Functions
  return createClient();
}

export async function blobsGetJSON(key, defaultValue = null) {
  const client = getClient();
  try {
    const data = await client.getJSON(key);
    return (data === undefined || data === null) ? defaultValue : data;
  } catch (e) {
    // Fallback to raw GET + JSON.parse
    const res = await client.get(key);
    if (!res) return defaultValue;
    try {
      const txt = await res.text();
      return JSON.parse(txt);
    } catch {
      return defaultValue;
    }
  }
}

export async function blobsPutJSON(key, obj) {
  const client = getClient();
  const body = JSON.stringify(obj);
  try {
    await client.setJSON(key, obj);
  } catch (e) {
    await client.set(key, body, { contentType: 'application/json' });
  }
  // Byte count via TextEncoder to avoid Buffer dependency in ESM
  const bytes = new TextEncoder().encode(body).length;
  return { key, bytes };
}

export async function blobsGetResponse(key) {
  const client = getClient();
  try {
    const res = await client.get(key);
    return res || null;
  } catch {
    return null;
  }
}
