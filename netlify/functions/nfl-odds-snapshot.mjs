// netlify/functions/nfl-odds-snapshot.mjs
// Fetch Anytime TD odds via TheOddsAPI, normalize, and cache to Netlify Blobs.

import { getStore } from "@netlify/blobs";
import { toDecimal } from "./lib/mathNFL.mjs";

const SPORT = "americanfootball_nfl";
const DEFAULT_MARKET_ALIASES = ["player_anytime_td","player_touchdown_anytime","anytime_td","touchdown_scorer_anytime"];

function pick(q, env, def) {
  const v = (q ?? env ?? "").toString().trim();
  return v || def;
}

function normOffer(bookTitle, outcome) {
  const selection = outcome?.name || outcome?.title || outcome?.player || outcome?.label;
  const american = outcome?.price?.american ?? outcome?.american ?? null;
  const decimal = outcome?.price?.decimal ?? outcome?.decimal ?? toDecimal(american);
  return { book: bookTitle || "unknown", selection, american, decimal };
}

function getNFLStore() {
  try {
    return getStore({ name: process.env.NFL_TD_BLOBS || process.env.BLOBS_STORE_NFL || "nfl-td" });
  } catch {
    return null;
  }
}

export async function handler(event) {
  const qs = event?.queryStringParameters || {};
  const debug = qs.debug === "1" || qs.debug === "true";
  const API_KEY = process.env.ODDS_API_KEY_NFL || process.env.ODDS_API_KEY;

  if (!API_KEY) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, message: "Missing ODDS_API_KEY_NFL", offers: [], meta: { reason: "no_api_key" } }) };
  }

  const date = qs.date || new Date().toISOString().slice(0,10);
  const bookmaker = pick(qs.book, process.env.ODDSAPI_BOOKMAKER_NFL, "fanduel").toLowerCase();
  const marketPref = pick(qs.market, process.env.ODDSAPI_MARKET_NFL, "player_anytime_td").toLowerCase();
  const markets = Array.from(new Set([marketPref, ...DEFAULT_MARKET_ALIASES]));

  const store = getNFLStore();
  const blobKey = `nfl-td:odds:${date}:${bookmaker}`;

  let all = [];
  let tried = null;
  let lastError = null;

  try {
    const base = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds`;
    for (const market of markets) {
      tried = market;
      const url = `${base}?regions=us&markets=${encodeURIComponent(market)}&bookmakers=${encodeURIComponent(bookmaker)}&apiKey=${API_KEY}`;
      if (debug) console.log(`[odds-snapshot] GET ${url}`);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const ev of (Array.isArray(data) ? data : [])) {
        for (const bk of (ev.bookmakers || [])) {
          const title = (bk.title || bk.key || "").toString();
          for (const mk of (bk.markets || [])) {
            const mkey = (mk.key || mk.market || "").toString().toLowerCase();
            const accept = (mkey === market) || mkey.includes("anytime") || DEFAULT_MARKET_ALIASES.includes(mkey);
            if (!accept) continue;
            for (const oc of (mk.outcomes || [])) {
              const o = normOffer(title, oc);
              if (o.selection) all.push(o);
            }
          }
        }
      }
      if (all.length) break;
    }

    if (store) {
      await store.set(blobKey, JSON.stringify({ data: all, updatedAt: new Date().toISOString(), meta: { date, bookmaker, marketTried: tried, count: all.length } }), { contentType: "application/json" });
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, offersCount: all.length, meta: { date, bookmaker, marketTried: tried } }) };
  } catch (e) {
    lastError = String(e);
    return { statusCode: 200, body: JSON.stringify({ ok: false, message: `Snapshot error: ${lastError}`, meta: { date, bookmaker, marketTried: tried } }) };
  }
}

export const config = { schedule: "0 18 * * 4" };
