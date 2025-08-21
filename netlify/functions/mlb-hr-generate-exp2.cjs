// netlify/functions/mlb-hr-generate-exp2.cjs
const { getStore } = require("@netlify/blobs");
const { buildTracks, isoDateET } = require("../../src/utils/hrExp.cjs");

function cors(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    },
    body: JSON.stringify(bodyObj)
  };
}

exports.handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
        body: ""
      };
    }

    if (event.httpMethod !== "POST" || !event.body) {
      return cors(400, { ok:false, error:"POST JSON body required: { picks:[...], known_out?:[...] }" });
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch { return cors(400, { ok:false, error:"Invalid JSON body" }); }

    const picks = Array.isArray(body.picks) ? body.picks : null;
    const knownOut = Array.isArray(body.known_out) ? body.known_out : [];
    if (!picks) return cors(400, { ok:false, error:"Body must include picks: []" });

    // Build the two tracks
    const { control, adjusted } = buildTracks(picks, knownOut);

    // Keys / timestamps
    const dayIso = isoDateET(new Date());
    const now = new Date().toISOString();

    // Write using named store (fixes “getStore requires name”)
    const store = getStore("default"); // change "default" to another store name if you prefer
    await store.set(
      `mlb-hr/experiments/${dayIso}/control.json`,
      JSON.stringify({ ok:true, date: dayIso, updated_at: now, picks: control }),
      { contentType: "application/json" }
    );
    await store.set(
      `mlb-hr/experiments/${dayIso}/adjusted-v1.json`,
      JSON.stringify({ ok:true, date: dayIso, updated_at: now, picks: adjusted }),
      { contentType: "application/json" }
    );

    return cors(200, {
      ok:true,
      date: dayIso,
      counts: { control: control.length, adjusted: adjusted.length },
      preview: { control: control.slice(0,3), adjusted: adjusted.slice(0,3) },
      blobs: {
        control: `mlb-hr/experiments/${dayIso}/control.json`,
        adjusted: `mlb-hr/experiments/${dayIso}/adjusted-v1.json`
      }
    });
  } catch (e) {
    return cors(500, { ok:false, error: e?.message || "Server error" });
  }
};
