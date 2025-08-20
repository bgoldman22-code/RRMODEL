// patch-hr-ui-lock-provider-2025-08-20/netlify/functions/odds-get.cjs
// Legacy-compatible odds getter: returns offers[] and also a 'players' map keyed by name and normalized name.
// Adds top-level 'provider' and 'usingOddsApi' pass-through so legacy banners flip to "yes".

const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function getStoreSafe(name) {
  return getStore({ name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

function stripDiacritics(s) {
  try { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch { return s; }
}
function normName(s) {
  return s ? stripDiacritics(String(s)).toLowerCase().trim() : "";
}

exports.handler = async function () {
  try {
    const store = getStoreSafe(process.env.BLOBS_STORE || "mlb-odds");
    let snap = null;

    if (typeof store.getJSON === "function") {
      snap = (await store.getJSON("mlb-hr-over05.json")) || (await store.getJSON("latest.json"));
    } else {
      const raw = (await store.get("mlb-hr-over05.json")) || (await store.get("latest.json"));
      snap = raw ? JSON.parse(raw) : null;
    }

    if (!snap) {
      return { statusCode: 200, body: JSON.stringify({ provider: "none", usingOddsApi: false, count: 0, offers: [], players: {} }) };
    }

    const offers = Array.isArray(snap.offers) ? snap.offers : [];
    const players = {};
    const players_norm = {};

    for (const o of offers) {
      if (!o?.player) continue;
      const price = Number(o.american ?? o.price ?? o.odds ?? NaN);
      if (!Number.isFinite(price)) continue;

      const name = String(o.player).trim();
      const key = normName(name);
      // keep the best (most favorable) price
      const prev = players[name];
      const prevNorm = players_norm[key];
      const better = (a, b) => {
        if (a >= 0 && b >= 0) return a > b;
        if (a < 0  && b < 0) return a > b; // -110 > -120
        return a >= 0; // favor plus money
      };
      if (prev === undefined || better(price, prev)) players[name] = price;
      if (prevNorm === undefined || better(price, prevNorm)) players_norm[key] = price;
    }

    const out = {
      provider: snap.provider,           // "theoddsapi" or "sgo" or "none"
      usingOddsApi: !!snap.usingOddsApi, // boolean for your banner
      count: Number(snap.count || offers.length || 0),
      fetched: snap.fetched,
      offers,
      players,
      players_norm,
      diag: snap.diag || null,
    };

    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
