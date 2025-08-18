import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  const STORE_NAME = process.env.BLOBS_STORE || 'mlb-odds';
  const store = getStore(STORE_NAME);
  const date = event.queryStringParameters?.date;
  const key = date ? `${date}.json` : 'latest.json';
  try {
    const data = await store.get(key);
    if (!data) return { statusCode: 404, body: JSON.stringify({ ok:false, error:`no snapshot for ${key}` }) };
    return { statusCode: 200, body: data };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
