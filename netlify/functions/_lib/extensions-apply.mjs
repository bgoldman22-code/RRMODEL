// netlify/functions/_lib/extensions-apply.mjs
import { bvpMultiplier } from './extensions-bvp.mjs';
import { weatherMultiplier } from './extensions-weather.mjs';
function clampProb(p, lo=0.005, hi=0.95){ p=Number(p||0); if(!Number.isFinite(p)) return lo; return Math.max(lo, Math.min(hi, p)); }
export async function applyExtensions(rows,{date}={}){
  if(!Array.isArray(rows)) return rows;
  const out = [];
  for(const row of rows){
    const copy = { ...row };
    const p0 = Number(copy.p_model ?? copy.p ?? copy.hr ?? 0);
    const wMeta = await weatherMultiplier(copy);
    let p1 = clampProb(p0 * (wMeta.mul ?? 1.0));
    const bMeta = await bvpMultiplier(copy);
    let p2 = clampProb(p1 * (bMeta.mul ?? 1.0));
    copy.meta = { ...(copy.meta || {}) };
    copy.meta.weather = wMeta;
    copy.meta.bvp = bMeta;
    copy.meta.adjustments = { p_before: p0, weatherMul: wMeta.mul ?? 1.0, bvpMul: bMeta.mul ?? 1.0, p_after: p2 };
    copy.p_model = p2;
    out.push(copy);
  }
  return out;
}
