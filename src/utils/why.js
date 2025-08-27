// src/utils/why.js
// Minimal "why" formatter used by MLB.jsx
// Exports: formatWhy, normName

/**
 * Normalize a display name safely.
 */
export function normName(x) {
  if (!x) return '';
  return String(x).trim();
}

/**
 * Format a "Why" string. Accepts a row object r and tries, in order:
 *  1) r.whyParts: [{ label, weight? }] -> bold the highest weight, join with •
 *  2) r.why: string -> return as-is
 *  3) Construct a compact fallback from parkAdj, p_base, sp
 */
export function formatWhy(r) {
  try {
    if (Array.isArray(r?.whyParts) && r.whyParts.length) {
      let maxW = -Infinity, maxIdx = -1;
      r.whyParts.forEach((p, i) => {
        const w = Number(p?.weight) || 0;
        if (w > maxW) { maxW = w; maxIdx = i; }
      });
      return r.whyParts.map((p, i) => i === maxIdx ? `**${p.label}**` : p.label).join(' • ');
    }
    if (typeof r?.why === 'string') return r.why;

    const bits = [];
    if (typeof r?.parkAdj === 'number') {
      const v = Math.round(r.parkAdj * 100);
      if (v !== 0) bits.push(`Spray × park fit ${v > 0 ? `+${v}%` : `${v}%`}`);
    }
    if (typeof r?.p_base === 'number') bits.push(`Model ${(r.p_base * 100).toFixed(1)}%`);
    if (r?.sp) bits.push(`vs ${r.sp}`);
    return bits.join(' • ');
  } catch {
    return '';
  }
}
