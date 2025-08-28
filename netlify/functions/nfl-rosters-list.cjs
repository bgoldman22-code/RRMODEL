// netlify/functions/nfl-rosters-list.cjs
const { getStore } = require('./_blobs.js');

exports.handler = async () => {
  try {
    const storeName = process.env.NFL_TD_BLOBS || "nfl-td";
    const store = getStore(storeName);
    const out = [];
    for await (const entry of store.list()) {
      out.push({ key: entry.key, size: entry.size, uploadedAt: entry.uploadedAt });
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, store: storeName, keys: out }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
