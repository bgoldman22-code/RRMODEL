// netlify/functions/nfl-predictions-get/index.cjs
const BUNDLE_VERSION = "predictions-2025-09-12-v7";
const CURRENT_KEY    = "nfl/predictions/current.json";

const json = (code, obj) => ({
  statusCode: code,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj)
});

exports.handler = async () => {
  try {
    let blobs;
    try {
      blobs = require("../_blobs.js");
    } catch (e) {
      return json(500, { ok:false, error:`Blobs wrapper import failed: ${String(e)}`, BUNDLE_VERSION });
    }

    const data = await blobs.get(CURRENT_KEY);
    if (data && data.ok !== false) {
      return json(200, data);
    }
    return json(200, { ok:true, updated:null, rows:[], source:"empty", key:CURRENT_KEY, BUNDLE_VERSION });
  } catch (err) {
    return json(500, { ok:false, error:`Unhandled: ${String(err)}`, BUNDLE_VERSION, source:"error" });
  }
};
