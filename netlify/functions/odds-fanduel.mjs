// netlify/functions/odds-fanduel.mjs
// Fetch FanDuel MLB home run props via The Odds API and return a clean map.
// Test: /.netlify/functions/odds-fanduel?games=PHI@WSH,SEA@NYM

import fetch from "node-fetch";

const ODDS_API_KEY = process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;

function normName(s) {
  return String(s || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function toAmerican(price) {
  if (price == null) return null;
  const n = Number(price);
  return Number.isFinite(n) ? n : null;
}

function abbr(teamName) {
  const t = String(teamName || "").trim();
  if (/^[A-Z]{2,4}$/.test(t)) return t;
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0,3).toUpperCase();
  return (parts[0][0] + (parts[1] ? parts[1][0] : "") + parts[parts.length - 1][0]).slice(0,3).toUpperCase();
}

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body, null, 2) };
}

export const handler = async (event) => {
  try {
    if (!ODDS_API_KEY) return json(500, { ok: false, error: "Missing VITE_ODDS_API_KEY / ODDS_API_KEY" });

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const gamesParam = qs.get("games"); // CSV "PHI@WSH,SEA@NYM"
    const wanted = new Set((gamesParam || "").split(",").map(s => s.trim()).filter(Boolean));

    const url = new URL("https://api.the-odds-api.com/v4/sports/baseball_mlb/odds");
    url.searchParams.set("apiKey", ODDS_API_KEY);
    url.searchParams.set("regions", "us");
    url.searchParams.set("markets", "player_home_run");
    url.searchParams.set("bookmakers", "fanduel");

    const resp = await fetch(url.toString(), { timeout: 15000 });
    if (!resp.ok) return json(500, { ok: false, error: "odds_api_http_error", status: resp.status, body: await resp.text() });

    const data = await resp.json();
    const result = {};

    for (const g of Array.isArray(data) ? data : []) {
      const home = g.home_team || "";
      const away = g.away_team || "";
      const gameId = `${abbr(away)}@${abbr(home)}`;
      if (wanted.size && !wanted.has(gameId)) continue;

      const fd = (g.bookmakers || []).find(b => (b.key || "").toLowerCase() === "fanduel");
      if (!fd) continue;
      const hr = (fd.markets || []).find(m => (m.key || "") === "player_home_run");
      if (!hr) continue;

      const byPlayer = {};
      for (const o of hr.outcomes || []) {
        const name = normName(o.name);
        const price = toAmerican(o.price);
        if (name && price != null) byPlayer[name] = price;
      }
      if (Object.keys(byPlayer).length) result[gameId] = byPlayer;
    }

    return json(200, { ok: true, bookmaker: "fanduel", games: Object.keys(result).length, odds: result });
  } catch (err) {
    return json(500, { ok: false, error: String(err && err.message || err) });
  }
};
