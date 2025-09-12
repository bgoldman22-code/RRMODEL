// netlify/functions/nfl-predictions-score/index.cjs
// Minimal scorer to avoid runtime errors and return JSON.
// If you already have a real scoring library, wire it in here and export it.

async function scorePredictions() {
  // placeholder: you can import your real scorer here.
  const now = new Date().toISOString();
  return { ok: true, scored: true, updated: now, notes: "No-op scorer (placeholder). Replace with real scoring logic when ready." };
}

async function handler() {
  try {
    const out = await scorePredictions();
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(out),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e) }),
    };
  }
}

module.exports = { handler, scorePredictions };