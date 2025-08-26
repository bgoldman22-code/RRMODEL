// src/utils/why_sb.js
import { clamp01 } from "./prob_math.js";

export function buildWhySB(c){
  const parts = [];
  // Base profile
  if (c.attempts2y!=null && c.success2y!=null){
    parts.push(`high-attempt profile (${c.attempts2y} tries, ${Math.round(c.success2y*100)}% success last 2 yrs)`);
  }
  if (c.obp!=null && c.pa!=null){
    parts.push(`gets on (${Math.round(c.obp*100)}% OBP, ~${(c.pa||0)} PA sample)`);
  }
  // Context multipliers (optional)
  if (c.ctx?.speedTier) parts.push(`${c.ctx.speedTier} speed`);
  if (c.ctx?.pitcherHoldNote) parts.push(`${c.ctx.pitcherHoldNote}`);
  if (c.ctx?.catcherArmNote) parts.push(`${c.ctx.catcherArmNote}`);
  if (c.ctx?.recentObpDelta!=null){
    const s = c.ctx.recentObpDelta>0 ? "up" : "down";
    parts.push(`OBP trend ${s} ${Math.round(Math.abs(c.ctx.recentObpDelta)*100)} bp`);
  }
  return sentence(parts, "; ");
}

function sentence(arr, sep=", "){
  return arr.filter(Boolean).join(sep);
}
