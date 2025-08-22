const { buildTracks, isoDateET, writeExperiment, CAPS } = require('../../src/utils/hrExp.cjs');
const knobs = require('../../src/utils/knobs.cjs');
const { applyVariance } = require('../../src/utils/variance.cjs');

function cors(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    },
    body: JSON.stringify(bodyObj)
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
        body: ""
      };
    }

    if (!(event.httpMethod === 'POST' && event.body)) {
      return cors(400, { ok:false, error:'POST JSON body required: { picks:[...], known_out?:[], ctx?:{...} }' });
    }

    let body;
    try { body = JSON.parse(event.body); } catch { return cors(400, { ok:false, error:'Invalid JSON body' }); }
    const baseline = Array.isArray(body.picks) ? body.picks : null;
    const knownOut = Array.isArray(body.known_out) ? body.known_out : [];
    const ctx = body.ctx || {};

    if (!baseline) return cors(400, { ok:false, error:'Body must include picks: []' });

    // v1 tracks
    const { control, adjusted } = buildTracks(baseline, knownOut);

    // v2 knobs applied on top of CONTROL baseline
    const v2 = JSON.parse(JSON.stringify(control)); // fresh copy with model_hrp_final = base
    // bring base probs into model_hrp for simpler math
    for (const p of v2){ p.model_hrp = Number(p.model_hrp_final); delete p.model_hrp_final; }
    const v2Flags = applyVariance(v2, knobs, ctx);
    // cap total bump with existing maxAdjBump
    const finalized = v2.map(p => {
      const base = Number(p.model_hrp||0);
      const adj = Number(p.model_hrp_adjusted ?? base);
      const bump = Math.min(CAPS.maxAdjBump, Math.max(0, adj - base));
      const final = Math.min(CAPS.maxProb, base + bump);
      return { ...p, model_hrp_final: final, flags: { ...(p.flags||{}), ...(v2Flags[p.player]||{}) } };
    });

    // logging
    const dayIso = isoDateET(new Date());
    const ctrlKey = await writeExperiment(dayIso, 'control', { date: dayIso, picks: control, updated_at: new Date().toISOString() });
    const adjKey  = await writeExperiment(dayIso, 'adjusted-v1', { date: dayIso, picks: adjusted, updated_at: new Date().toISOString() });
    const v2Key   = await writeExperiment(dayIso, 'adjusted-v2', { date: dayIso, picks: finalized, updated_at: new Date().toISOString(), knobs });

    return cors(200, {
      ok:true,
      date: dayIso,
      counts: { control: control.length, adjusted_v1: adjusted.length, adjusted_v2: finalized.length },
      blobs: { control: ctrlKey, adjusted_v1: adjKey, adjusted_v2: v2Key },
      preview: {
        control: control.slice(0,3),
        adjusted_v1: adjusted.slice(0,3),
        adjusted_v2: finalized.slice(0,3)
      }
    });
  } catch (e) {
    return cors(500, { ok:false, error: e?.message || 'Server error' });
  }
};
