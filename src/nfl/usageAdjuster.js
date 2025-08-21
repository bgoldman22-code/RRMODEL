// src/nfl/usageAdjuster.js
// Starter-rep weighted usage from preseason snaps.
// We weight snaps by *context*, not raw volume:
// - First-team unit reps >> second/third unit
// - Early game > late game
// - Close score > garbage time
// - Versus opponent starters > backups
// - Series index: first 3 series carry the signal for starters
//
// Input 'snapEvents' shape (array):
// {
//   "team": "NE",
//   "pos": "RB",
//   "player": "Rhamondre Stevenson",
//   "week": "PS3",
//   "quarter": 1,
//   "time_sec": 12*60,       // game clock seconds left in quarter
//   "series_index": 1,       // 1 = first offensive series for this team
//   "offense_unit": 1,       // 1=first-team, 2=second, 3=third (if unknown, leave null)
//   "opp_defense_unit": 1,   // 1=starters, 2=twos, 3=threes (optional)
//   "score_diff": 0          // offense score - defense score at snap time
// }
//
// Returns per-team per-position player weights { [team]: { [pos]: { [player]: weight } } }
// These weights are normalized per (team,pos) and used to split team-level RZ shares.

export function computeStarterRepWeights(snapEvents=[]) {
  const byKey = new Map();
  const add = (team, pos, player, w) => {
    const k = team + '|' + pos + '|' + player;
    byKey.set(k, (byKey.get(k) || 0) + w);
  };

  for (const e of snapEvents) {
    if (!e || !e.team || !e.pos || !e.player) continue;

    // Base weight
    let w = 1.0;

    // Period weighting: Q1>Q2>Q3>Q4 (starters usually appear early)
    const qW = {1: 1.0, 2: 0.7, 3: 0.3, 4: 0.15};
    w *= qW[e.quarter] ?? 0.3;

    // Series weighting: first 3 series matter most
    if (typeof e.series_index === 'number') {
      if (e.series_index === 1) w *= 1.2;
      else if (e.series_index === 2) w *= 1.0;
      else if (e.series_index === 3) w *= 0.8;
      else w *= 0.5;
    }

    // Unit weighting (first-team >> others)
    if (e.offense_unit) {
      if (e.offense_unit === 1) w *= 1.5;
      else if (e.offense_unit === 2) w *= 0.8;
      else w *= 0.5;
    }

    // Opponent starters vs backups (optional)
    if (e.opp_defense_unit) {
      if (e.opp_defense_unit === 1) w *= 1.1;
      else if (e.opp_defense_unit === 2) w *= 0.9;
      else w *= 0.8;
    }

    // Garbage time dampener: large leads/deficits reduce signal
    if (typeof e.score_diff === 'number') {
      const ad = Math.abs(e.score_diff);
      if (ad >= 14) w *= 0.7;
      else if (ad >= 7) w *= 0.9;
    }

    add(e.team, e.pos, e.player, w);
  }

  // Normalize per team/pos
  const out = {};
  for (const [k, v] of byKey.entries()) {
    const [team, pos, player] = k.split('|');
    out[team] = out[team] || {};
    out[team][pos] = out[team][pos] || {};
    out[team][pos][player] = (out[team][pos][player] || 0) + v;
  }
  for (const t of Object.keys(out)) {
    for (const p of Object.keys(out[t])) {
      const sum = Object.values(out[t][p]).reduce((a,b)=>a+b,0) || 1;
      for (const name of Object.keys(out[t][p])) {
        out[t][p][name] = out[t][p][name] / sum;
      }
    }
  }
  return out;
}

// Blend preseason weights into depth charts role weights.
// depthCharts format example:
// { "NE": { "RB": ["Rhamondre Stevenson","TreVeyon Henderson","Ezekiel Elliott"], "WR": [...], "TE": [...] } }
export function applyPreseasonWeights(depthCharts, starterWeights, blend=0.6) {
  // blend=0.6 => 60% preseason weighting, 40% prior chart order
  const result = JSON.parse(JSON.stringify(depthCharts || {}));
  for (const team of Object.keys(result)) {
    for (const pos of Object.keys(result[team])) {
      const names = result[team][pos];
      const sw = (starterWeights?.[team]?.[pos]) || {};
      // prior order scores: 1st=1.0, 2nd=0.6, 3rd=0.3, others=0.1
      const priorScores = {};
      names.forEach((n, i) => priorScores[n] = i===0 ? 1.0 : i===1 ? 0.6 : i===2 ? 0.3 : 0.1);
      const blended = {};
      for (const n of names) {
        const wPre = sw[n] ?? 0;
        const wPrior = priorScores[n] ?? 0.1;
        blended[n] = blend * wPre + (1 - blend) * wPrior;
      }
      // re-rank by blended score
      const sorted = [...names].sort((a,b)=> (blended[b]||0) - (blended[a]||0));
      result[team][pos] = sorted;
    }
  }
  return result;
}
