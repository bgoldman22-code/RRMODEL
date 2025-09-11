// Lightweight helpers to format odds and derive heuristic confidences for spread & total
export const usd = new Intl.NumberFormat('en-US');

export function americanToProb(price) {
  if (!price || isNaN(price)) return null;
  price = Number(price);
  if (price > 0) return 100 / (price + 100);
  return (-price) / ((-price) + 100);
}

// Heuristic spread confidence: tie to ML edge (how far from a coin flip)
// If spread aligns with ML favorite, we upweight. Bound between 0.52 and 0.80.
export function spreadConfidence(mlHomeImp, spreadTeam) {
  if (mlHomeImp == null) return 0.54;
  const edge = Math.abs(mlHomeImp - 0.5); // 0..0.5
  const base = 0.52;
  const bonus = edge * 0.6; // up to +0.30
  return clamp(base + bonus, 0.52, 0.80);
}

// Heuristic total confidence: modest fixed edge; you can replace with model-based total later
export function totalConfidence() {
  return 0.54; // placeholder; replace when a totals model lands
}

export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function formatKickoffLocal(iso) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short', timeStyle: 'short'
    }).format(d);
  } catch { return iso; }
}

export function bestMoneyline(row) {
  // decide ML pick + confidence based on implied probabilities
  const homeImp = Number(row.ml_home_imp ?? 0);
  const awayImp = Number(row.ml_away_imp ?? 0);
  const homeName = (row.matchup || '').split(' @ ')[1] || 'Home';
  const awayName = (row.matchup || '').split(' @ ')[0] || 'Away';
  if (homeImp >= awayImp) {
    return {
      side: 'Home',
      team: homeName.trim(),
      confidence: homeImp,
      price: row.ml_home_best
    };
  }
  return {
    side: 'Away',
    team: awayName.trim(),
    confidence: awayImp,
    price: row.ml_away_best
  };
}

export function spreadPick(row) {
  const favIsHome = Number(row.ml_home_imp ?? 0) >= Number(row.ml_away_imp ?? 0);
  const team = row.spread_team || (favIsHome ? (row.matchup || '').split(' @ ')[1] : (row.matchup || '').split(' @ ')[0]);
  const line = row.spread_line;
  return {
    team, line, confidence: spreadConfidence(Number(row.ml_home_imp), team)
  };
}

export function totalPick(row) {
  return { side: row.total_side, line: row.total_line, confidence: totalConfidence() };
}
