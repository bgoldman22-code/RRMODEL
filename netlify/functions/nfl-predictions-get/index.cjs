// netlify/functions/nfl-predictions-get/index.cjs
const BUNDLE_VERSION = "predictions-2025-09-12-v7";
const CURRENT_KEY    = "nfl/predictions/current.json";

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}

exports.handler = async () => {
  try {
    let storeGet;
    try {
      const blobs = require("../_blobs.cjs");
      storeGet = blobs?.get;
      if (typeof storeGet !== "function") {
        const blobs2 = require("../_blobs.js");
        storeGet = blobs2?.get;
      }
    } catch (e) {
      return json(500, { ok:false, stage:"require(_blobs)", error:String(e), BUNDLE_VERSION });
    }

    if (typeof storeGet !== "function") {
      return json(500, { ok:false, stage:"resolve(_blobs.get)", error:"_blobs.get not a function", BUNDLE_VERSION });
    }

    const data = await storeGet(CURRENT_KEY);
    if (data) return json(200, data);
    return json(200, { ok:true, updated:null, rows:[], source:"empty", key:CURRENT_KEY, BUNDLE_VERSION });
  } catch (err) {
    return json(500, { ok:false, error:String(err), source:"error", BUNDLE_VERSION });
  }
};