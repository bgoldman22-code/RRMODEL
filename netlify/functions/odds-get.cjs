// patch-hr-all-in-one-2025-08-20/netlify/functions/odds-get.cjs
// Returns the last written HR props blob (mlb-hr-over05.json), fallback latest.json

const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function getStoreSafe(name) {
  return getStore({ name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

exports.handler = async function () {
  try {
    const store = getStoreSafe(process.env.BLOBS_STORE || "mlb-odds");

    let data = null;
    if (typeof store.getJSON === "function") {
      data = await store.getJSON("mlb-hr-over05.json") || await store.getJSON("latest.json");
    } else {
      const raw = await store.get("mlb-hr-over05.json") || await store.get("latest.json");
      data = raw ? JSON.parse(raw) : null;
    }

    // Build backward-compatible players map for UI consuming snapshot.players
    let payload = data || { provider: "none", offers: [], count: 0 };
    if (payload && !payload.players) {
      const players = {};
      const strip = (s)=> (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      for (const o of (payload.offers || [])) {
        const name = (o && o.player) ? String(o.player).trim() : null;
        if (!name) continue;
        const key = name.toLowerCase();
        const american = Number(o.american ?? o.price ?? o.odds ?? NaN);
        if (!Number.isFinite(american)) continue;
        // Keep the best (most favorable) price if duplicates
        if (!players[key] || (american >= 0 && american > players[key].american) || (american < 0 && american > players[key].american)) {
          players[key] = {
            name,
            american,
            book: o.book || o.bookKey || null,
            gameId: o.gameId || null,
            market: o.market || null
          };
          const keyNorm = strip(key);
          if (keyNorm && keyNorm !== key) {
            const prev = players[keyNorm];
            if (!prev || (american >= 0 && american > prev.american) || (american < 0 && american > prev.american)) {
              players[keyNorm] = players[key];
            }
          }
        }
      }
      payload.players = players;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(payload),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
