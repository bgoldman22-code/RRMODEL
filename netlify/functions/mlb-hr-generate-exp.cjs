// CORS-hardened version of the POST-only endpoint.
const { buildTracks, isoDateET, writeExperiment } = require('../../src/utils/hrExp.cjs');

function cors(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
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

    if (!(event.httpMethod === 'POST' && event.body)) {
      return cors(400, { ok:false, error:'POST JSON body required: { picks:[...], known_out?:[...] }' });
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return cors(400, { ok:false, error:'Invalid JSON body' });
    }

    const baseline = Array.isArray(body.picks) ? body.picks : null;
    const knownOut = Array.isArray(body.known_out) ? body.known_out : [];

    if (!baseline) {
      return cors(400, { ok:false, error:'Body must include picks: []' });
    }

    const { control, adjusted } = buildTracks(baseline, knownOut);

    const dayIso = isoDateET(new Date());
    const ctrlKey = await writeExperiment(dayIso, 'control', { date: dayIso, picks: control, updated_at: new Date().toISOString() });
    const adjKey  = await writeExperiment(dayIso, 'adjusted-v1', { date: dayIso, picks: adjusted, updated_at: new Date().toISOString() });

    return cors(200, {
      ok:true,
      date: dayIso,
      counts: { control: control.length, adjusted: adjusted.length },
      blobs: { control: ctrlKey, adjusted: adjKey },
      preview: { control: control.slice(0,3), adjusted: adjusted.slice(0,3) }
    });
  } catch (e) {
    return cors(500, { ok:false, error: e?.message || 'Server error' });
  }
};
