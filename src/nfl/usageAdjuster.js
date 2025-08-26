// src/nfl/usageAdjuster.js
// Compute "starter-rep" weights from preseason context and apply to base depth charts.
//
// preseasonSnaps format (array of events). Example element:
// {
//   "team": "NE",
//   "player": "TreVeyon Henderson",
//   "pos": "RB",
//   "quarter": 1,          // 1..4
//   "series": 1,           // 1..N within game
//   "offense_unit": "1",   // "1","2","3" (or "starter","backup","third")
//   "opp_unit": "1",       // same semantics for defense
//   "with_qb1": true       // optional
// }
//
export function computeStarterRepWeights(preseasonSnaps = []) {
  const teamPosPlayerScore = {}; // team -> pos -> player -> score
  const unitW = (u) => {
    if (!u) return 0.5;
    const s = String(u).toLowerCase();
    if (s.startsWith('1') || s.includes('starter')) return 1.0;
    if (s.startsWith('2') || s.includes('backup') || s.includes('second')) return 0.55;
    return 0.25; // 3rd unit
  };
  const quarterW = (q) => {
    if (q === 1) return 1.0;
    if (q === 2) return 0.7;
    if (q === 3) return 0.4;
    return 0.2;
  };
  const seriesW = (s) => {
    if (!Number.isFinite(s)) return 0.6;
    const w = 1.0 - 0.1 * (s - 1);
    return Math.max(0.3, Math.min(1.0, w));
  };
  for (const e of preseasonSnaps) {
    const team = e.team;
    const pos = e.pos;
    const player = e.player;
    if (!team || !pos || !player) continue;
    const w =
      unitW(e.offense_unit) *
      (0.75 + 0.25 * unitW(e.opp_unit)) *  // slight boost if vs opp starters
      quarterW(e.quarter) *
      seriesW(e.series) *
      (e.with_qb1 ? 1.15 : 1.0);
    teamPosPlayerScore[team] ??= {};
    teamPosPlayerScore[team][pos] ??= {};
    teamPosPlayerScore[team][pos][player] = (teamPosPlayerScore[team][pos][player] || 0) + w;
  }
  // Normalize 0..1 within each team/pos group
  const out = {};
  for (const [team, byPos] of Object.entries(teamPosPlayerScore)) {
    out[team] = {};
    for (const [pos, byPlayer] of Object.entries(byPos)) {
      const max = Math.max(1e-6, ...Object.values(byPlayer));
      out[team][pos] = {};
      for (const [player, score] of Object.entries(byPlayer)) {
        out[team][pos][player] = score / max;
      }
    }
  }
  return out; // team -> pos -> player -> weight(0..1)
}

// Apply preseason weights to reorder depth charts within each team/position.
// alpha in [0..1]: 0 = ignore preseason, 1 = preseason decides entirely.
export function applyPreseasonWeights(baseDepthCharts, weights, alpha = 0.6) {
  const POS_FROM_ROLE = { RB1:'RB', WR1:'WR', WR2:'WR', TE1:'TE', QB1:'QB' };
  const result = JSON.parse(JSON.stringify(baseDepthCharts || {}));
  for (const [team, chart] of Object.entries(result)) {
    const group = { RB: [], WR: [], TE: [], QB: [] };
    // Collect candidates from existing chart roles
    for (const [role, name] of Object.entries(chart)) {
      const pos = POS_FROM_ROLE[role];
      if (!pos || !name) continue;
      group[pos].push(name);
    }
    // For WR, you may want more than two; we keep existing list for WR2 selection.
    // Build scored lists per pos
    const wTeam = weights?.[team] || {};
    const scoreOf = (pos, name) => {
      const w = (wTeam?.[pos]?.[name] ?? 0);
      // blend preseason with a small prior so incumbents aren't wiped out without info
      const prior = 0.5;
      return (1 - alpha) * prior + alpha * w;
    };
    const pickTop = (pos, n) => {
      const unique = Array.from(new Set(group[pos] || []));
      // If weights include other players not in chart, add them too (e.g., rookies)
      if (wTeam?.[pos]) {
        for (const pName of Object.keys(wTeam[pos])) {
          if (!unique.includes(pName)) unique.push(pName);
        }
      }
      unique.sort((a,b) => scoreOf(pos,b) - scoreOf(pos,a));
      return unique.slice(0, n);
    };
    // Reassign roles based on scores
    const [rb1] = pickTop('RB', 1);
    const [wr1, wr2] = pickTop('WR', 2);
    const [te1] = pickTop('TE', 1);
    const [qb1] = pickTop('QB', 1);
    if (rb1) chart.RB1 = rb1;
    if (wr1) chart.WR1 = wr1;
    if (wr2) chart.WR2 = wr2;
    if (te1) chart.TE1 = te1;
    if (qb1) chart.QB1 = qb1;
  }
  return result;
}
