// netlify/functions/mlb-hr-generate-exp2.cjs
const { createBlob } = require("@netlify/blobs");
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
      return cors(400, { ok: false, error: "POST JSON body required: { picks:[...], known_out?:[...] }" });
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch { return cors(400, { ok:false, error:"Invalid JSON body" }); }

    const picks = Array.isArray(body.picks) ? body.picks : null;
    const knownOut = Array.isArray(body.known_out) ? body.known_out : [];
    if (!picks) return cors(400, { ok:false, error:"Body must include picks: []" });

    // Build the two tracks (control = lineup validation only; adjusted = slugger+cluster)
    const { control, adjusted } = buildTracks(picks, knownOut);

    const dayIso = isoDateET(new Date()); // ET date key
    const now = new Date().toISOString();

    // Write blobs
    await createBlob({
      key: `mlb-hr/experiments/${dayIso}/control.json`,
      data: Buffer.from(JSON.stringify({ date: dayIso, updated_at: now, picks: control }, null, 2)),
      contentType: "application/json",
    });
    await createBlob({
      key: `mlb-hr/experiments/${dayIso}/adjusted-v1.json`,
      data: Buffer.from(JSON.stringify({ date: dayIso, updated_at: now, picks: adjusted }, null, 2)),
      contentType: "application/json",
    });

    return cors(200, {
      ok: true,
      date: dayIso,
      counts: { control: control.length, adjusted: adjusted.length },
      preview: {
        control: control.slice(0, 3),
        adjusted: adjusted.slice(0, 3)
      }
    });
  } catch (e) {
    return cors(500, { ok:false, error: e?.message || "Server error" });
  }
};
