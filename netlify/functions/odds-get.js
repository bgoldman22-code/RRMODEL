// Netlify Blobs store init that works whether Blobs is auto-configured or not.
// If your environment isn't auto-wired, set env vars:
//   NETLIFY_SITE_ID=<your site id>
//   NETLIFY_BLOBS_TOKEN=<a Blobs API token for that site>
// Optionally set BLOBS_STORE (defaults to 'mlb-odds').
import { getStore } from '@netlify/blobs';

function initStore(){
  const name = process.env.BLOBS_STORE || 'mlb-odds';
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token){
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}


export const handler = async (event) => {
  const store = initStore();
  const date = event.queryStringParameters?.date;
  const key = date ? `${date}.json` : 'latest.json';
  try {
    const data = await store.get(key);
    if (!data) return { statusCode: 404, body: JSON.stringify({ "ok": false, "error": `no snapshot for ${key}` }) };
    return { statusCode: 200, body: data };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ "ok": false, "error": String(e) }) };
  }
};
