const { get } = require('../_blobs');
const BUNDLE_VERSION = 'predictions-2025-09-12-v11';
const CURRENT_KEY = 'nfl/predictions/current.json';

exports.handler = async () => {
  try {
    const data = await get(CURRENT_KEY);
    if (data) {
      return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify(data) };
    }
    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:true, updated:null, rows:[], parlays:null, source:'empty', key: CURRENT_KEY, BUNDLE_VERSION }) };
  } catch (err) {
    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:false, error:String(err), source:'error', BUNDLE_VERSION }) };
  }
};
