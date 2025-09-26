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
  // Enhanced: Handle both old and new advanced data structures
  const advanced = row._advanced;
  const homeName = (row.matchup || '').split(' @ ')[1] || 'Home';
  const awayName = (row.matchup || '').split(' @ ')[0] || 'Away';
  
  // Try advanced structure first
  if (advanced && advanced.homeWinProb && advanced.awayWinProb) {
    const homeProb = Number(advanced.homeWinProb);
    const awayProb = Number(advanced.awayWinProb);
    const mlEdge = Number(advanced.mlEdge || 0);
    
    if (homeProb >= awayProb) {
      return {
        side: 'Home',
        team: homeName.trim(),
        confidence: homeProb,
        price: row.odds?.moneyline?.home || null,
        edge: mlEdge,
        betRecommendation: advanced.betRecommendations?.moneyline || 'BET'
      };
    }
    return {
      side: 'Away', 
      team: awayName.trim(),
      confidence: awayProb,
      price: row.odds?.moneyline?.away || null,
      edge: mlEdge,
      betRecommendation: advanced.betRecommendations?.moneyline || 'BET'
    };
  }
  
  // Fallback to old structure
  const homeImp = Number(row.ml_home_imp ?? 0);
  const awayImp = Number(row.ml_away_imp ?? 0);
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
  const advanced = row._advanced;
  const homeName = (row.matchup || '').split(' @ ')[1] || 'Home';
  const awayName = (row.matchup || '').split(' @ ')[0] || 'Away';
  
  // Try advanced structure first
  if (advanced && advanced.spreadEdge !== undefined) {
    // Use the main pick data which contains spread info
    const spreadData = row.pick;
    if (spreadData && spreadData.type === 'spread') {
      return {
        team: spreadData.team,
        line: extractLineFromPickLabel(spreadData.pickLabel),
        confidence: spreadData.confidence,
        edge: advanced.spreadEdge,
        betRecommendation: advanced.betRecommendations?.spread || 'BET'
      };
    }
  }
  
  // Fallback to old structure  
  const favIsHome = Number(row.ml_home_imp ?? 0) >= Number(row.ml_away_imp ?? 0);
  const team = row.spread_team || (favIsHome ? homeName : awayName);
  const line = row.spread_line;
  return {
    team, line, confidence: spreadConfidence(Number(row.ml_home_imp), team)
  };
}

// Helper to extract line from pickLabel like "spread: Arizona Cardinals 2.5"
function extractLineFromPickLabel(pickLabel) {
  if (!pickLabel) return null;
  const match = pickLabel.match(/[-+]?\d+\.?\d*/);
  return match ? Number(match[0]) : null;
}

export function totalPick(row) {
  const advanced = row._advanced;
  
  // Try advanced structure first
  if (advanced && advanced.totalEdge !== undefined) {
    // For totals, we need to infer from the data structure
    const totalLine = row.odds?.total?.line || 44; // fallback
    const confidence = 0.58; // default from advanced model
    
    return {
      side: 'Over', // simplified for now
      line: totalLine,
      confidence: confidence,
      edge: advanced.totalEdge,
      betRecommendation: advanced.betRecommendations?.total || 'NO BET'
    };
  }
  
  // Fallback to old structure
  return { side: row.total_side, line: row.total_line, confidence: totalConfidence() };
}
