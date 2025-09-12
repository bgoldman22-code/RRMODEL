exports.handler = async () => {
  const rows = globalThis.__NFL_PREDICTIONS__ || [];
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, updated: new Date().toISOString(), rows })
  };
};
