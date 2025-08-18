// odds-get.js (CommonJS)
const { getStore } = require('@netlify/blobs');

function initStore(){
  const name = process.env.BLOBS_STORE || 'mlb-odds';
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token){
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}

exports.handler = async (event) => {
  const store = initStore();
  const date = event.queryStringParameters && event.queryStringParameters.date;
  const key = date ? (date + '.json') : 'latest.json';
  try {
    const data = await store.get(key);
    if (!data) return { statusCode: 404, body: JSON.stringify({ ok:false, error: 'no snapshot for ' + key }) };
    return { statusCode: 200, body: data };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
