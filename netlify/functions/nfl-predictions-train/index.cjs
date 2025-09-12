// netlify/functions/nfl-predictions-train/index.cjs
// Open training trigger (no secret) via ?open=1. Always returns JSON.

function allow(event) {
  const qs = event.queryStringParameters || {};
  if (qs.open === "1" || qs.open === "true") return true;
  const secret = process.env.TRAIN_SECRET;
  if (!secret) return true; // if no secret configured, allow by default
  return qs.secret === secret;
}

exports.handler = async (event) => {
  try {
    if (!allow(event)) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "unauthorized" }),
      };
    }

    // TODO: place your real learning job here (download NFLVerse/ESPN snapshots, fit weights, persist artifacts)
    const now = new Date().toISOString();
    const payload = { ok: true, trained: true, updated: now, samples_used: 0, notes: "No-op trainer (placeholder)." };

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(payload),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e) }),
    };
  }
};