// netlify/functions/odds-hits2.mjs
// Production-leaning odds fetcher for 2+ hits markets.
// Uses TheOddsAPI per-event pulls and normalizes player names to improve matching.
export const handler = async (event) => {
  try {
    const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const limit = Math.max(0, parseInt(params.get("limit") || "0", 10)) || 0;
    const bookmakersCSV = params.get("bookmakers") || ""; // optional filter
    const useOddsApi = !!apiKey;
    const clean = (s) => (s||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
    const decToAmerican = (dec) => {
      if (!dec || dec <= 1) return null;
      if (dec >= 2) return Math.round((dec - 1) * 100);
      return Math.round(-100 / (dec - 1));
    };

    let offers = [];
    let provider = "fallback";
    if (useOddsApi) {
      provider = "theoddsapi";
      const fetchJson = async (url) => {
        const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0" } });
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
        return await r.json();
      };
      const evUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=${apiKey}&dateFormat=iso&date=${date}`;
      const events = await fetchJson(evUrl).catch(()=>[]);
      const MARKET_KEYS = [
        "batter_hits","batter_hits_over_under","player_hits","player_hits_over_under","batter_player_hits"
      ];
      const labelIs2Plus = (label, point) => {
        const L = (label||"").toLowerCase();
        return /\bover\s*1\.5\b/.test(L) || /\b2\+\b/.test(L) || /two\+/.test(L) || (point && Number(point) >= 1.5);
      };
      const bkFilter = (bookmakersCSV || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
      const bestByPlayer = new Map();

      for (const ev of (events||[])) {
        if (!ev?.id) continue;
        const oddsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${ev.id}/odds?apiKey=${apiKey}&markets=${MARKET_KEYS.join(",")}&dateFormat=iso`;
        const resp = await fetchJson(oddsUrl).catch(()=>null);
        if (!Array.isArray(resp)) continue;
        for (const market of resp) {
          if (!MARKET_KEYS.includes(market.key)) continue;
          for (const b of (market.bookmakers||[])) {
            if (bkFilter.length && !bkFilter.includes((b.key||"").toLowerCase())) continue;
            for (const m of (b.markets||[])) {
              const point = m.point;
              for (const o of (m.outcomes||[])) {
                const label = o.description || o.name || "";
                if (!labelIs2Plus(label, point)) continue;
                const participant = o.participant || o.name || o.description || "";
                const player = participant;
                const decimal = (typeof o.price === "number" ? o.price : (typeof o.decimal === "number" ? o.decimal : null));
                if (!decimal || decimal <= 1) continue;
                const american = o.american ?? decToAmerican(decimal);
                const key = clean(player);
                const prev = bestByPlayer.get(key);
                if (!prev || decimal > prev.decimal) {
                  bestByPlayer.set(key, {
                    player, playerKey: key,
                    team: o.team || "",
                    gameId: ev.id,
                    marketKey: market.key,
                    selectionLabel: label || "Over 1.5",
                    decimal, american, book: b.key,
                    fetchedAt: new Date().toISOString()
                  });
                }
              }
            }
          }
        }
      }
      offers = Array.from(bestByPlayer.values());
      if (limit && offers.length > limit) offers = offers.slice(0, limit);
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, provider, usingOddsApi: useOddsApi, count: offers.length, offers })
    };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:false, error:String(err), provider:"fallback", usingOddsApi:false, count:0, offers:[] }) };
  }
};
