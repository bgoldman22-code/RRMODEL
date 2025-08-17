// src/MLB.jsx (patched Option B)
import { buildWhy } from './utils/why';

// ... inside your map loop
rows.push({
  player: c.name,
  game: c.gameId,
  model: (100*c.baseProb).toFixed(1) + '%',
  american,
  ev,
  why: (() => {
    try {
      return buildWhy({
        player: c.name,
        team: c.team,
        opponent: c.opp,
        bats: c.bats,
        exp_pa: c.exp_pa,
        base_hr_pa: c.baseProb,
        recent_window_pa: c.recent_window_pa,
        recent_barrel_pct: c.recent_barrel_pct,
        recent_xiso: c.recent_xiso,
        pull_fb_pct: c.pull_fb_pct,
        pitcher: { name: c.pitcherName, throws: c.pitcherHand },
        park: { name: c.parkName, hr_index_rhb: c.parkHRR, hr_index_lhb: c.parkHRL },
        weather: c.weather,
        odds_best_american: american,
        implied_prob: c.impliedProb,
        true_hr_prob: c.baseProb,
        ev_per_unit: ev,
      }).text;
    } catch(e) {
      return c.why || '';
    }
  })()
});

export default function MLBWrapper(){ return null }
