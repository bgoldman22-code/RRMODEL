import { getStore } from "@netlify/blobs";

export default async (req, res) => {
  try {
    const provider = "theoddsapi";
    const apiKey = process.env.THEODDS_API_KEY;
    const sport = process.env.ODDSAPI_SPORT_KEY || "baseball_mlb";
    const regions = process.env.ODDSAPI_REGION || "us,us2";
    const marketKey = process.env.PROP_MARKET_KEY || "batter_home_runs";
    const books = (process.env.BOOKS || "").split(",").filter(Boolean);
    const store = getStore(process.env.BLOBS_STORE || "mlb-odds");

    const markets = [
      marketKey,
      "player_home_runs",
      "player_to_hit_a_home_run",
      "home_runs",
    ];

    let data = null;
    for (const mkt of markets) {
      const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?regions=${regions}&markets=${mkt}&apiKey=${apiKey}`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.length > 0) {
        data = { provider, market: mkt, ts: Date.now(), raw: j };
        break;
      }
    }

    if (!data) {
      return res.status(500).json({ ok: false, error: "no odds markets returned" });
    }

    // Optionally filter books
    if (books.length > 0) {
      data.raw.forEach(ev => {
        ev.bookmakers = ev.bookmakers.filter(b => books.includes(b.key));
      });
    }

    await store.setJSON("latest.json", data);
    await store.setJSON(`snapshots/${new Date().toISOString().split("T")[0]}.json`, data);

    return res.json({ ok: true, provider, market: data.market, events: data.raw.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};