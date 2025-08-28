// netlify/functions/nfl-bootstrap.js
import { getBlobsStore as nflStore, diagBlobsEnv } from './_blobs.js';

export async function handler(event) {
  try {
    const store = nflStore('nfl-td');
    const diag = await diagBlobsEnv();
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, diag }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
}
