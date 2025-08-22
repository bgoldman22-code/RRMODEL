// Tunable knobs for variance features (middle-ground defaults)
module.exports = {
  // variance budget
  variance_pct_max: 0.30,   // at most 30% of slate influenced by variance flags
  anchors_min: 2,
  anchors_max: 3,

  // PEP (Pitcher Exploitable Pool)
  pep_enable: true,
  pep_add: 0.012,           // +1.2% abs
  pep_hrp_floor: 0.16,      // baseline HR% or...
  pep_barrel7_floor: 0.08,  // last-7d barrel% floor

  // Odds band requirement
  odds_band_enable: true,
  odds_min: 300,
  odds_max: 650,
  odds_required: 3,         // try for 3–4; allow 2 if not enough
  odds_required_min: 2,

  // Repeat dampener
  repeat_enable: true,
  repeat_add_threshold_pct: 0.10, // if today's odds within ±10% of yesterday
  repeat_dampen: -0.007,

  // 7-day form
  form_enable: true,
  form_xwoba_pct: 0.85,     // 85th percentile
  form_barrel7_floor: 0.09, // 9%
  form_add: 0.008,
  form_k7_high: 0.30,
  form_k7_dampen: -0.006,

  // Second-tier pool
  tier2_enable: true,
  tier2_hrp_low: 0.20,
  tier2_hrp_high: 0.25,
  tier2_daily_count: 2,
  tier2_ev_floor: 0.10,     // only include if EV >= +0.10 or PEP tagged
};
