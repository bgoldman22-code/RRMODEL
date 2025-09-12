exports.handler = async (event) => {
  const open = event.queryStringParameters?.open;
  // Placeholder trainer
  globalThis.__NFL_PREDICTIONS__ = [
    { id: "1", matchup: "Team A vs Team B", pick: { type: "moneyline", team: "Team A", confidence: 0.65 } }
  ];
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, trained: true, updated: new Date().toISOString(), notes: open ? "open mode" : "secret mode" })
  };
};
