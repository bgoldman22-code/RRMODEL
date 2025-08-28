// Always ON version: applies Weather + BvP by default.
import { applyWeatherLite } from "./weather-lite-core.mjs";
import { applyBvp } from "./bvp-core.mjs";

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

export async function applyExtensions({ row, context }){
  try{
    let p = Number(row.p_model ?? row.p ?? 0);
    if (!Number.isFinite(p) || p <= 0) return { prob: row.p_model, meta: row.meta };

    // Weather (inline wx from row.meta.weatherInline if present)
    let meta = { ...(row.meta||{}) };
    const wx = meta.weatherInline || null;
    const W = await applyWeatherLite({ wx, baseProb: p });
    if (W?.applied && Number.isFinite(W.wMul)){
      p *= W.wMul;
      meta.weather = { applied:true, wMul:W.wMul, explain:W.explain };
    }

    // BvP (requires ids on row)
    const batterId = row.batterId || row.batterID || row.batter_id;
    const pitcherId = row.pitcherId || row.pitcherID || row.pitcher_id;
    if (batterId && pitcherId){
      const B = await applyBvp({ batterId, pitcherId, baseProb:p });
      if (B?.applied && Number.isFinite(B.bvpMul)){
        p *= B.bvpMul;
        meta.bvp = { applied:true, bvpMul:B.bvpMul, explain:B.explain, pa:B.pa, hr:B.hr };
      }
    }

    p = clamp(p, 0.005, 0.95);
    return { prob: p, meta };
  }catch{
    return { prob: row.p_model, meta: row.meta };
  }
}
