// netlify/functions/odds-hits2.mjs
// HOTFIX: ensure offers appear by forcing regions=us & oddsFormat=american and broader 2+ hits detection.
export const handler = async (event) => {
  try {
    const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const limit = Math.max(0, parseInt(params.get("limit") || "0", 10)) || 0;
    const bookmakersCSV = params.get("bookmakers") || "";
    const useOddsApi = !!apiKey;

    const clean = (s) => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
    const decToAmerican = (dec) => {
      if (!dec || dec <= 1) return null;
      if (dec >= 2) return Math.round((dec - 1) * 100);
      return Math.round(-100 / (dec - 1));
    };

    let offers = []; let provider = "fallback";
    if (useOddsApi) {
      provider = "theoddsapi";
      const fetchJson = async (url) => {
        const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0" } });
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
        return await r.json();
      };
      const evUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=${apiKey}&dateFormat=iso&date=${date}`;
      const events = await fetchJson(evUrl).catch(()=>[]);
      const MARKET_KEYS = ["batter_hits","batter_hits_over_under","player_hits","player_hits_over_under","batter_player_hits"];
      const bkFilter = (bookmakersCSV || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);

      const labelIsOver15 = (name, desc, point) => {
        const N = (name||"").toLowerCase(); const D = (desc||"").toLowerCase();
        return /over/.test(N+D) && (/\b1\.5\b/.test(N+D) || /\b2\+\b/.test(N+D) || /two\+/.test(N+D) || (point && Number(point)>=1.5));
      };

      const bestByPlayer = new Map();
      for (const ev of (events||[])) {
        if (!ev?.id) continue;
        const oddsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${ev.id}/odds?apiKey=${apiKey}&markets=${MARKET_KEYS.join(",")}&regions=us&oddsFormat=american&dateFormat=iso`;
        const resp = await fetchJson(oddsUrl).catch(()=>null);
        if (!Array.isArray(resp)) continue;
        for (const market of resp) {
          if (!MARKET_KEYS.includes(market.key)) continue;
          for (const b of (market.bookmakers||[])) {
            if (bkFilter.length && !bkFilter.includes((b.key||"").toLowerCase())) continue;
            for (const m of (b.markets||[])) {
              for (const o of (m.outcomes||[])) {
                const ok2 = labelIsOver15(o.name, o.description, m.point);
                if (!ok2) continue;
                const participant = o.participant || o.name || o.description || "";
                const key = clean(participant);
                const american = (typeof o.price === "number") ? o.price : (typeof o.american === "number" ? o.american : null);
                let decimal = null;
                if (typeof o.decimal === "number") decimal = o.decimal;
                if (!decimal && typeof american === "number") decimal = (american>0) ? 1+american/100 : 1+100/Math.abs(american);
                if (!decimal || decimal<=1) continue;

                const prev = bestByPlayer.get(key);
                if (!prev || decimal > prev.decimal) {
                  bestByPlayer.set(key, { player: participant, playerKey: key, gameId: ev.id, decimal, american, book: b.key, marketKey: market.key, selectionLabel: o.name||o.description||"Over 1.5", fetchedAt: new Date().toISOString() });
                }
              }
            }
          }
        }
      }
      offers = Array.from(bestByPlayer.values());
      if (limit && offers.length > limit) offers = offers.slice(0, limit);
    }

    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok:true, provider, usingOddsApi: useOddsApi, count: offers.length, offers }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok:false, error:String(err), provider:"fallback", usingOddsApi:false, count:0, offers:[] }) };
  }
};
