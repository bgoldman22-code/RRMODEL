// netlify/functions/_lib/mlb-slate-lite.wrapper.template.mjs
// FANDUEL_ODDS_INTEGRATED (no top-level await; CJS-safe under esbuild)
import { fetchFanDuelHrOdds, normName, americanToProb } from "./_lib/fanduel-hr.mjs";

// Lazy dynamic imports; look for *_orig first (underscore, not dot)
const tryImportMjs = () => import("./mlb-slate-lite_orig.mjs").catch(() => null);
const tryImportCjs = () => import("./mlb-slate-lite_orig.cjs").catch(() => null);

export const handler = async (event, context) => {
  // Resolve original at request time
  let orig = await tryImportMjs();
  if (!orig || !orig.handler) {
    orig = await tryImportCjs();
  }
  if (!orig || !orig.handler) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:false, error:"mlb-slate-lite_orig missing" })
    };
  }

  const res = await orig.handler(event, context);

  try {
    const json = JSON.parse(res.body || "{}");
    const games = Array.isArray(json.games) ? json.games : [];
    const candidates = Array.isArray(json.candidates) ? json.candidates : [];

    const eventMap = new Map();
    for (const g of games) {
      const gid = g.gameId || g.id || g.game_id;
      const eid = g.eventId || g.oddsEventId || g.statsapiEventId;
      if (gid && eid) eventMap.set(gid, String(eid));
    }

    if (eventMap.size > 0 && candidates.length > 0) {
      const fd = await fetchFanDuelHrOdds(eventMap);
      for (const c of candidates) {
        const byPlayer = fd.get(c.gameId);
        if (!byPlayer) continue;
        const hit = byPlayer.get(normName(c.name));
        if (!hit) continue;
        c.american = hit;
        const implied = americanToProb(hit);
        if (implied != null) {
          c.implied = implied;
          const p = Number(c.modelProb ?? c.baseProb ?? c.prob ?? 0);
          if (Number.isFinite(p)) c.ev = Number((p - implied).toFixed(3));
        }
        c.oddsSource = "fanduel";
      }
      json.candidates = candidates;
    }

    return { ...res, body: JSON.stringify(json) };
  } catch {
    return res;
  }
};
