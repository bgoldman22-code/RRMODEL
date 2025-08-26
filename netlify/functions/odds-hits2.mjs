// netlify/functions/odds-hits2.mjs
// Prefer Netlify Blobs snapshot via odds-get-hits, then fallback to provider fetch (TheOddsAPI / ALT).
const clean = (s) => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
const americanToDecimal = (a) => {
  if (a == null) return null; const n = Number(a); if (!isFinite(n)) return null;
  return n > 0 ? 1 + n/100 : 1 + 100/Math.abs(n);
};
const decToAmerican = (dec) => { if (!dec || dec<=1) return null; return dec>=2 ? Math.round((dec-1)*100) : Math.round(-100/(dec-1)); };

async function fetchJson(url, headers={}) {
  const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0", ...headers }, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}

async function fromBlobs() {
  try {
    const j = await fetchJson("/.netlify/functions/odds-get-hits");
    if (j && j.ok && j.players) {
      const offers = [];
      for (const [name, info] of Object.entries(j.players)) {
        const k = clean(name);
        const am = info.best_american;
        const dec = americanToDecimal(am);
        if (dec && dec>1) offers.push({ player: name, playerKey: k, american: am, decimal: dec, book: info.best_book || "blob", source:"blobs" });
      }
      return { provider:"blobs", usingOddsApi:false, offers };
    }
  } catch (_e) {}
  return { provider:"blobs", usingOddsApi:false, offers:[] };
}

// FALLBACK: provider (same as multi-provider earlier, compacted)
async function fromTheOddsApi(date) {
  const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
  if (!apiKey) return { provider:"theoddsapi", usingOddsApi:false, offers:[] };
  const evs = await fetchJson(`https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=${apiKey}&dateFormat=iso&date=${date}`)
    .catch(()=>[]);
  const MARKET_KEYS = ["batter_hits","batter_hits_over_under","player_hits","player_hits_over_under","batter_player_hits"];
  const offers = [];
  for (const ev of (evs||[])) {
    const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${ev.id}/odds?apiKey=${apiKey}&markets=${MARKET_KEYS.join(",")}&regions=us&oddsFormat=american&dateFormat=iso`;
    const arr = await fetchJson(url).catch(()=>null); if (!Array.isArray(arr)) continue;
    for (const market of arr) for (const b of (market.bookmakers||[])) for (const m of (b.markets||[])) for (const o of (m.outcomes||[])) {
      const name = o.participant || o.name || o.description || "";
      const am = typeof o.price === "number" ? o.price : (typeof o.american === "number" ? o.american : null);
      const dec = americanToDecimal(am);
      const label = (o.name||o.description||"").toLowerCase();
      const ok = /over/.test(label) && (/\b1\.5\b/.test(label) || /\b2\+\b/.test(label) || /two\+/.test(label)) || (m.point && Number(m.point)>=1.5 && /over/.test(label));
      if (name && dec && dec>1 && ok) offers.push({ player:name, playerKey: clean(name), american:am, decimal:dec, book:b.key, source:"theoddsapi" });
    }
  }
  // Best per player
  const best = new Map();
  for (const o of offers) {
    const prev = best.get(o.playerKey);
    if (!prev || o.decimal > prev.decimal) best.set(o.playerKey, o);
  }
  return { provider:"theoddsapi", usingOddsApi:true, offers: Array.from(best.values()) };
}

// ALT provider hook
async function fromAlt(date) {
  const base = process.env.ALT_ODDS_URL;
  if (!base) return { provider:"alt", usingOddsApi:false, offers:[] };
  const hdrName = process.env.ALT_ODDS_HEADER || "";
  const key = process.env.ALT_ODDS_API_KEY || "";
  const q = new URLSearchParams({ sport:"mlb", date, market:"player_hits" }).toString();
  const headers = hdrName && key ? { [hdrName]: key } : {};
  const j = await fetchJson(`${base}${base.includes("?")?"&":"?"}${q}`, headers).catch(()=>null);
  if (!j) return { provider:"alt", usingOddsApi:true, offers:[] };
  const offers = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.outcomes)) {
      for (const o of node.outcomes) {
        const name = o.participant || o.player || o.name || o.description;
        const am = o.american ?? o.price ?? o.odds;
        const dec = americanToDecimal(am) ?? o.decimal;
        const label = (o.name||o.description||"").toLowerCase();
        const ok = /over/.test(label) && (/\b1\.5\b/.test(label) || /\b2\+\b/.test(label) || /two\+/.test(label));
        if (name && dec && dec>1 && ok) offers.push({ player:name, playerKey: clean(name), american: decToAmerican(dec), decimal:dec, book: node.bookmaker || node.book || "alt", source:"alt" });
      }
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === "object") visit(v);
      if (Array.isArray(v)) for (const it of v) visit(it);
    }
  };
  visit(j);
  const best = new Map();
  for (const o of offers) {
    const prev = best.get(o.playerKey);
    if (!prev || o.decimal > prev.decimal) best.set(o.playerKey, o);
  }
  return { provider:"alt", usingOddsApi:true, offers: Array.from(best.values()) };
}

export const handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);

    // 1) blobs
    let res = await fromBlobs();
    // 2) provider fallback if empty
    if (!res.offers.length) res = await fromTheOddsApi(date);
    // 3) alt fallback if still empty
    if (!res.offers.length) res = await fromAlt(date);

    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, provider: res.provider, usingOddsApi: res.usingOddsApi, count: res.offers.length, offers: res.offers }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, error:String(err), provider:"unknown", usingOddsApi:false, count:0, offers:[] }) };
  }
};
