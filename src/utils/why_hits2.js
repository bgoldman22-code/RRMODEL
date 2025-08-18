// src/utils/why_hits2.js
export function buildWhyHits2(c){
  const parts = [];
  if (typeof c.avg === "number"){
    parts.push(`contact profile (${(c.avg*100).toFixed(1)}% AVG)`);
  }
  if (c.ctx?.formNote) parts.push(c.ctx.formNote);
  if (c.ctx?.pitchMatchNote) parts.push(c.ctx.pitchMatchNote);
  if (c.ctx?.parkNote) parts.push(c.ctx.parkNote);
  if (c.ctx?.lineupNote) parts.push(c.ctx.lineupNote);
  return parts.filter(Boolean).join("; ");
}
