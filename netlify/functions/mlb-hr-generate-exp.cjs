const { buildTracks, isoDateET, writeExperiment } = require('../../src/utils/hrExp.cjs');

exports.handler = async (event) => {
  try {
    if (!(event.httpMethod === 'POST' && event.body)) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok:false, error:'POST JSON body required: { picks:[...], known_out?:[...] }' })
      };
    }

    const body = JSON.parse(event.body);
    const baseline = Array.isArray(body.picks) ? body.picks : null;
    const knownOut = Array.isArray(body.known_out) ? body.known_out : [];

    if (!baseline) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok:false, error:'Body must include picks: []' })
      };
    }

    const { control, adjusted } = buildTracks(baseline, knownOut);

    const dayIso = isoDateET(new Date());
    const ctrlKey = await writeExperiment(dayIso, 'control', { date: dayIso, picks: control, updated_at: new Date().toISOString() });
    const adjKey  = await writeExperiment(dayIso, 'adjusted-v1', { date: dayIso, picks: adjusted, updated_at: new Date().toISOString() });

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok:true,
        date: dayIso,
        counts: { control: control.length, adjusted: adjusted.length },
        blobs: { control: ctrlKey, adjusted: adjKey },
        preview: { control: control.slice(0,3), adjusted: adjusted.slice(0,3) }
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e?.message || 'Server error' }) };
  }
};
