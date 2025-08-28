// patch-odds-get-players-v3-2025-08-20/netlify/functions/odds-get.cjs
// Backward-compatible odds getter for MLB HR props.
// Builds players map with: median_american, count_books, by_book.
// Also includes players_norm with same structure (best-effort).

const { getStore } = require('./_blobs.js');

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function getStoreSafe(name) {
  return getStore({ name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

function stripDiacritics(s) {
  try { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch { return s; }
}
function normName(s) {
  return s ? stripDiacritics(String(s)).toLowerCase().replace(/[.]/g,'').replace(/[’']/g,"'").trim() : "";
}

function median(arr) {
  if (!arr || !arr.length) return null;
  const sorted = [...arr].sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid-1] + sorted[mid]) / 2);
}

exports.handler = async function() {
  try {
    const store = getStoreSafe(process.env.BLOBS_STORE || "mlb-odds");
    let snap = null;

    if (typeof store.getJSON === "function") {
      snap = (await store.getJSON("mlb-hr-over05.json")) || (await store.getJSON("latest.json"));
    } else {
      const raw = (await store.get("mlb-hr-over05.json")) || (await store.get("latest.json"));
      snap = raw ? JSON.parse(raw) : null;
    }

    const offers = Array.isArray(snap?.offers) ? snap.offers : [];

    // Build maps
    const aggByName = new Map(); // name -> { prices:[], by_book:{}, books:Set }
    for (const o of offers) {
      const name = (o && o.player) ? String(o.player).trim() : null;
      const bk = (o && o.bookKey) ? String(o.bookKey).toLowerCase() : (o && o.book ? String(o.book).toLowerCase().replace(/\s+/g,'') : 'book');
      const priceRaw = (o && (o.american ?? o.price ?? o.odds));
      const price = Number(priceRaw);
      if (!name || !Number.isFinite(price)) continue;
      if (!aggByName.has(name)) aggByName.set(name, { prices: [], by_book: {}, books: new Set() });
      const a = aggByName.get(name);
      a.prices.push(price);
      a.by_book[bk] = price;
      a.books.add(bk);
    }

    const players = {}, players_norm = {};
    for (const [name, a] of aggByName.entries()) {
      const median_american = median(a.prices);
      const count_books = a.books.size;
      const by_book = a.by_book;
      const rec = { median_american, count_books, by_book };
      players[name] = rec;
      const key = normName(name);
      if (!players_norm[key]) players_norm[key] = rec;
      else {
        // merge: prefer better (more favorable) median
        const prev = players_norm[key];
        const better = (x,y) => (x >= 0 && y >= 0) ? x>y : (x<0 && y<0) ? x>y : x>=0;
        players_norm[key] = better(median_american, prev.median_american) ? rec : prev;
      }
    }

    const out = {
      provider: snap?.provider || "none",
      usingOddsApi: !!snap?.usingOddsApi,
      count: Number(snap?.count || offers.length || 0),
      fetched: snap?.fetched || null,
      offers,
      players,
      players_norm,
      diag: snap?.diag || null,
    };

    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
