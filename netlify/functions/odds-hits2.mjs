// netlify/functions/odds-hits2.mjs
// Fetch best prices for "2+ hits" markets per player and compute provider metadata.
// Expects env ODDS_API_KEY. Safe to call with low credit usage using event-specific pulls.
//
// Query params:
//   date=YYYY-MM-DD (optional; defaults today UTC)
//   league=mlb (optional)
//   bookmakers=comma,separated (optional)
//   limit=number (optional) max players returned
//
// Response:
//   { ok, provider: "theoddsapi"|"fallback", usingOddsApi: boolean, count, offers: [
//       { player, team, gameId, marketKey, selectionLabel, decimal, american, book, fetchedAt }
//     ] }
//
export const handler = async (event) => {
  try {
    const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const league = params.get("league") || "mlb";
    const limit = Math.max(0, parseInt(params.get("limit") || "0", 10)) || 0;
    const bookmakersCSV = params.get("bookmakers") || ""; // optional filter

    // Helper: convert decimal to American
    const decToAmerican = (dec) => {
      if (!dec || dec <= 1) return null;
      const imp = dec - 1;
      if (dec >= 2) return Math.round((dec - 1) * 100);
      return Math.round(-100 / (dec - 1));
    };

    const useOddsApi = !!apiKey;
    let offers = [];
    let provider = "fallback";

    if (useOddsApi) {
      provider = "theoddsapi";
      // TheOddsAPI per-event odds pattern for MLB games on a date.
      // We fetch once per date (events), then map markets to find "2+ hits"-style entries.
      const fetchJson = async (url) => {
        const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0" } });
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
        return await r.json();
      };

      // 1) List MLB events for the date
      const base = "https://api.the-odds-api.com/v4/sports/baseball_mlb/events";
      const evUrl = `${base}?apiKey=${apiKey}&dateFormat=iso&date=${date}`;
      let events = [];
      try {
        events = await fetchJson(evUrl);
      } catch (e) {
        // Hard fallback: skip to empty events to trigger empty offers path
        events = [];
      }

      // Market keys to scan for 2+ hits style
      const MARKET_KEYS = [
        "batter_hits",
        "batter_hits_over_under",
        "player_hits",
        "player_hits_over_under",
        "batter_player_hits",
      ];

      // 2) For each event, fetch markets (batters). Keep best price per player for "Over 1.5"
      const bkFilter = (bookmakersCSV || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
      const offersByPlayer = new Map();
      for (const ev of events) {
        const evId = ev.id;
        if (!evId) continue;
        const marketsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${evId}/odds?apiKey=${apiKey}&markets=${MARKET_KEYS.join(",")}&dateFormat=iso`;
        let odds = null;
        try {
          odds = await fetchJson(marketsUrl);
        } catch (e) {
          continue;
        }
        // TheOddsAPI returns an array per market; normalize
        for (const market of (odds || [])) {
          const mkey = market.key;
          if (!MARKET_KEYS.includes(mkey)) continue;
          for (const b of (market.bookmakers || [])) {
            if (bkFilter.length && !bkFilter.includes((b.key||"").toLowerCase())) continue;
            for (const m of (b.markets || [])) {
              for (const o of (m.outcomes || [])) {
                const label = (o.description || o.name || "").toLowerCase();
                // Keep outcomes that clearly mean 2+ hits:
                // Many books encode as "Over 1.5" or "2+" in label
                const isOver15 = /over\s*1\.5/.test(label) || /\b2\+\b/.test(label) || /two\+/.test(label);
                if (!isOver15) continue;
                const player = o.participant || o.description || o.name;
                if (!player) continue;
                const dec = o.price || o.odds || o.point || o.decimal;
                const decimal = typeof dec === "number" ? dec : parseFloat(dec);
                if (!decimal || !isFinite(decimal) || decimal <= 1) continue;
                const american = o.american || decToAmerican(decimal);
                const prev = offersByPlayer.get(player);
                if (!prev || decimal > prev.decimal) {
                  offersByPlayer.set(player, {
                    player,
                    team: o.team || "",
                    gameId: evId,
                    marketKey: mkey,
                    selectionLabel: o.name || o.description || "Over 1.5",
                    decimal,
                    american,
                    book: b.key,
                    fetchedAt: new Date().toISOString()
                  });
                }
              }
            }
          }
        }
      }

      offers = Array.from(offersByPlayer.values());
      if (limit && offers.length > limit) offers = offers.slice(0, limit);
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        provider,
        usingOddsApi: useOddsApi,
        count: offers.length,
        offers,
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err), provider: "fallback", usingOddsApi: false, count: 0, offers: [] })
    };
  }
};
