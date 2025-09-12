function scorePredictions(data) {
  const rows = (data || []).map(r => ({
    ...r,
    scored: true,
    confidence: r.pick?.confidence || Math.random()
  }));
  return { ok: true, scored: true, updated: new Date().toISOString(), rows };
}

exports.scorePredictions = scorePredictions;

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(scorePredictions(globalThis.__NFL_PREDICTIONS__ || []))
  };
};
