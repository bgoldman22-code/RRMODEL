// EXAMPLE drop-in logger that computes p_ctx (context-boosted prob) alongside your existing p_base.
// This does NOT modify the WHY column and does NOT replace your live logger. Safe to keep side-by-side.
const { getStore } = require("@netlify/blobs");
const { computeContextBoosts, applyBoosts } = require("../lib/contextBoosts");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { date, picks = [] } = body;
    if (!Array.isArray(picks) || picks.length === 0) {
      return resp(400, { ok:false, error:"No picks payload" });
    }

    const enriched = await Promise.all(picks.map(async (pk) => {
      const p_base = typeof pk.p === "number" ? pk.p : (pk.p_base ?? pk.modelProb ?? 0);
      const ctx = {
        batter: {
          hrRateCareer: pk.batter?.hrRateCareer,
          barrelRateSeason: pk.batter?.barrelRateSeason,
          seasonPA: pk.batter?.seasonPA,
          milbHrRate: pk.batter?.milbHrRate,
        },
        recent: {
          barrelRate7d: pk.recent?.barrelRate7d,
          hrLast14: pk.recent?.hrLast14,
        },
        splits: {
          batter: pk.splits?.batter,
          pitcher: pk.splits?.pitcher,
        },
        park: pk.park,
        matchup: {
          paVsPitcher: pk.matchup?.paVsPitcher,
          hrRateVsPitcher: pk.matchup?.hrRateVsPitcher,
          primaryRiskPitch: pk.matchup?.primaryRiskPitch,
        },
      };
      const boosts = await computeContextBoosts(ctx);
      const p_ctx = applyBoosts(p_base, boosts);
      return { ...pk, p_base: p_base, p_ctx, ctxParts: boosts.parts };
    }));

    const store = getStore("mlb-logs");
    const key = `predictions-with-ctx/${date || new Date().toISOString().slice(0,10)}.json`;
    await store.set(key, JSON.stringify({ date, picks: enriched, ts: Date.now() }), { addRandomSuffix:false, contentType:"application/json" });

    return resp(200, { ok:true, saved:key, n: enriched.length });
  } catch (e) {
    return resp(500, { ok:false, error: e?.message || "Server error" });
  }
};

function resp(statusCode, body){
  return { statusCode, headers: { "content-type":"application/json" }, body: JSON.stringify(body) };
}
