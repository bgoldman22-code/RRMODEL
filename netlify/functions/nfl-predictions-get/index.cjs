const { get } = require('../_blobs');
const CURRENT_KEY = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v8';

exports.handler = async () => {
  try {
    const data = await get(CURRENT_KEY);
    if (data) {
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:true, updated:null, rows:[], source:'empty', key: CURRENT_KEY, BUNDLE_VERSION })
    };
  } catch (e) {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(e), BUNDLE_VERSION }) };
  }
};