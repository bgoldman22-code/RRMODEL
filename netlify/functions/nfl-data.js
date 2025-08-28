// netlify/functions/nfl-data.js
import { getBlobsStore as nflStore } from './_blobs.js';

export async function handler(event) {
  try {
    const store = nflStore('nfl-td');
    const { searchParams } = new URL(event.rawUrl);
    const key = searchParams.get('key');
    const value = key ? await store.get(key) : null;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, key, value }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
}
