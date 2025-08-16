// netlify/functions/test-why.mjs
import { buildWhy } from "../../src/utils/why.js";

export async function handler(event) {
  const sample = {
    player: "Michael Busch",
    team: "PIT",
    opponent: "CHC",
    bats: "L",
    lineup_slot: 3,
    exp_pa: 4.2,
    base_hr_pa: 0.035,
    recent_window_pa: 50,
    recent_barrel_pct: 0.14,
    recent_xiso: 0.220,
    pull_fb_pct: 0.41,
    pitcher: {
      name: "Shota Imanaga",
      throws: "L",
      hr9: 1.3,
      barrel_pct_allowed: 0.089,
      gb_fb: 0.72,
      primary_pitches: [
        { pitch: "FF", usage: 0.55 },
        { pitch: "SL", usage: 0.27 }
      ]
    },
    hitter_vs_pitch: [
      { pitch: "FF", sample_pa: 30, xiso: 0.240 },
      { pitch: "SL", sample_pa: 12, xiso: 0.120 }
    ],
    park: { name: "Wrigley Field", hr_index_rhb: 104, hr_index_lhb: 107 },
    weather: { temp_f: 83, wind_mph: 10, wind_dir: "outRF" },
    odds_best_american: +250,
    implied_prob: 0.285,
    true_hr_prob: 0.305,
    ev_per_unit: 0.20,
    risk_notes: "Lineup pending",
    h2h: { pa: 9, hr: 2, iso: 0.556 } // shows small-sample H2H (>=8 and <15)
  };

  const result = buildWhy(sample);
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result, null, 2)
  };
}
