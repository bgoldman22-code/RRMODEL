import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  const store = getStore();
  const date = event.queryStringParameters?.date;
  const key = date ? `odds/${date}.json` : 'odds/latest.json';
  try {
    const data = await store.get(key);
    if (!data) return { statusCode: 404, body: JSON.stringify({ ok:false, error:'no snapshot' }) };
    return { statusCode: 200, body: data };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
