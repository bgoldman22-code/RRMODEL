// src/utils/archetypes.js
export const ENABLE_ARCHETYPES = false; // feature flag (default OFF)

export function classifyBatter(b){
  // b: { hr_per_pa, ev_p50, ev_p75, la_p50, la_p75 }
  const evp75 = Number(b?.ev_p75 || 0);
  const evp50 = Number(b?.ev_p50 || 0);
  const la75  = Number(b?.la_p75 || 0);
  const hrr   = Number(b?.hr_per_pa || 0);

  if (hrr >= 0.06 && evp75 >= 105) return "BARREL_BOMBER";
  if (hrr >= 0.035 && la75 >= 28 && la75 <= 36 && evp50 >= 97) return "LOFT_OPPORTUNIST";
  if (hrr <= 0.015 && evp50 <= 94) return "VARIANCE_ONLY";
  return "BALANCED";
}
