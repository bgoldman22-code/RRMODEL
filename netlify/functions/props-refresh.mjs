
// netlify/functions/props-refresh.mjs
import { getBlobsStore } from "./_blobs.js";

const BASE = process.env.THEODDS_API_BASE || "https://api.the-odds-api.com/v4";
const KEY = process.env.THEODDS_API_KEY;
const REGIONS = (process.env.ODDS_REGIONS || "us,us2").split(",").map(s=>s.trim()).filter(Boolean);

const MARKET_MAP = { tb: "batter_total_bases", hrrbi: "batter_hits_runs_rbis" };

function normName(s){
  return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"'").replace(/[.]/g,"").replace(/,+/g,"").replace(/\s+/g," ").trim();
}

export const handler = async (event) => {
  if (!KEY) return json(400, { ok:false, error:"Missing THEODDS_API_KEY" });
  const q = event.queryStringParameters || {};
  const want = (q.markets || "tb,hrrbi").split(",").map(s=>s.trim()).filter(Boolean);

  const store = getBlobsStore();
  const out = { ok:true, provider:"theoddsapi", regions:REGIONS, markets:[], counts:{} };

  for (const key of want){
    const market = MARKET_MAP[key];
    if (!market) continue;
    const perPlayer = new Map();
    for (const region of REGIONS){
      const url = `${BASE}/sports/baseball_mlb/odds?regions=${region}&markets=${market}&dateFormat=iso&apiKey=${KEY}`;
      const r = await fetch(url);
      out.markets.push({ key, market, region, status:r.status });
      if (!r.ok) continue;
      const events = await r.json();
      for (const ev of events || []){
        for (const bk of ev?.bookmakers || []){
          const bookKey = bk?.key;
          for (const mk of bk?.markets || []){
            if (mk?.key !== market) continue;
            for (const outcome of mk?.outcomes || []){
              const isOver = /over/i.test(outcome?.name || outcome?.description || "");
              const line = Number(outcome?.point ?? outcome?.line);
              if (!isOver || !(line >= 1.5 - 1e-9 && line <= 1.5 + 1e-9)) continue;
              const player = outcome?.participant || outcome?.player || outcome?.description || "";
              const name = normName(player);
              if (!name) continue;
              const price = Number(outcome?.price);
              if (!Number.isFinite(price)) continue;
              const rec = perPlayer.get(name) || { books:{}, lines:new Set(), raw:[] };
              rec.books[bookKey] = price;
              if (Number.isFinite(line)) rec.lines.add(line);
              rec.raw.push({book:bookKey, price, line});
              perPlayer.set(name, rec);
            }
          }
        }
      }
    }
    const reduced = {};
    for (const [name, rec] of perPlayer.entries()){
      const prices = Object.values(rec.books).filter(x=>Number.isFinite(x));
      if (!prices.length) continue;
      prices.sort((a,b)=>a-b);
      const mid = prices[Math.floor(prices.length/2)];
      reduced[name] = { median_american: mid, by_book: rec.books, count_books: prices.length, lines: Array.from(rec.lines||[]).sort() };
    }
    const blobKey = key === "tb" ? "props/latest_tb.json" : "props/latest_hrrbi.json";
    await store.setJSON(blobKey, reduced, { metadata: { market } });
    out.counts[key] = Object.keys(reduced).length;
  }
  return json(200, out);
};

function json(code, obj){ return { statusCode: code, headers: { "content-type":"application/json" }, body: JSON.stringify(obj)} }
