// netlify/functions/_lib/prediction-display.mjs
// CRITICAL: Always show model predictions, bet/no-bet is just a layer on top

export function formatPredictionWithBetLayer(prediction, betDecision, marketOdds = {}, marketLines = {}) {
  const {
    homeWinProb,
    predictedSpread, 
    predictedTotal,
    gameVariance,
    netEPAAdvantage
  } = prediction;
  
  const { takeBet, skipReason, edgeInfo } = betDecision;
  
  // ALWAYS show the model's predictions regardless of bet decision
  const modelPredictions = {
    homeWinProb: Math.round(homeWinProb * 1000) / 10, // 65.7%
    awayWinProb: Math.round((1 - homeWinProb) * 1000) / 10,
    predictedSpread: Math.round(predictedSpread * 10) / 10, // +3.2
    predictedTotal: Math.round(predictedTotal * 10) / 10,   // 47.5
    
    // Model confidence in predictions (separate from bet confidence)
    modelConfidence: {
      winProb: Math.round(50 + Math.abs(homeWinProb - 0.5) * 100), // 57%
      spread: Math.round(50 + Math.min(Math.abs(netEPAAdvantage) * 200, 25)), // 64%
      total: Math.round(52 + (gameVariance < 0.08 ? 8 : 0)) // 60%
    }
  };
  
  // Betting layer (shows picks and betting confidence only if taking bet)
  const bettingLayer = {
    moneyline: {
      // ALWAYS show what the model thinks
      modelPick: homeWinProb >= 0.5 ? 'home' : 'away',
      modelEdge: edgeInfo?.edgePercent || 0,
      
      // Only show betting recommendation if taking bet
      betPick: takeBet ? (homeWinProb >= 0.5 ? 'home' : 'away') : '—',
      betConfidence: takeBet ? Math.round(50 + Math.abs(homeWinProb - 0.5) * 100) : '—',
      betEdge: takeBet ? edgeInfo?.edgePercent || 0 : '—',
      
      // Betting metadata
      takeBet,
      skipReason: takeBet ? null : skipReason
    },
    
    spread: {
      // Model's spread prediction vs market
      modelSpread: predictedSpread,
      modelPick: Math.abs(predictedSpread) < 1 ? 'push' : 
                (predictedSpread > 0 ? 'home' : 'away'),
      modelEdge: marketLines.spread ? 
                Math.abs(predictedSpread - marketLines.spread) : 0,
      
      // Betting recommendation
      betPick: takeBet ? (Math.abs(predictedSpread) < 1 ? '—' : 
              (predictedSpread > (marketLines.spread || 0) ? 'home' : 'away')) : '—',
      betConfidence: takeBet ? Math.round(52 + Math.min(Math.abs(predictedSpread - (marketLines.spread || 0)) * 3, 23)) : '—',
      
      takeBet,
      skipReason: takeBet ? null : skipReason
    },
    
    total: {
      // Model's total prediction
      modelTotal: predictedTotal,
      modelPick: marketLines.total ? 
                (predictedTotal > marketLines.total ? 'over' : 'under') : 'no-line',
      modelEdge: marketLines.total ? 
                Math.abs(predictedTotal - marketLines.total) : 0,
      
      // Betting recommendation  
      betPick: takeBet && marketLines.total ? 
              (predictedTotal > marketLines.total ? 'over' : 'under') : '—',
      betConfidence: takeBet && marketLines.total ? 
                    Math.round(50 + Math.min(Math.abs(predictedTotal - marketLines.total) * 2, 20)) : '—',
      
      takeBet: takeBet && marketLines.total,
      skipReason: takeBet ? null : (marketLines.total ? skipReason : 'no-market-line')
    }
  };
  
  // Market comparison (always show for transparency)
  const marketComparison = {
    odds: {
      model: { home: homeWinProb, away: 1 - homeWinProb },
      market: edgeInfo?.vigRemoved ? 
              { home: edgeInfo.marketProb, away: 1 - edgeInfo.marketProb } : 
              null,
      vigAmount: edgeInfo?.vigAmount || null
    },
    
    lines: {
      spread: { model: predictedSpread, market: marketLines.spread || null },
      total: { model: predictedTotal, market: marketLines.total || null }
    }
  };
  
  return {
    // ALWAYS show what the model predicts
    predictions: modelPredictions,
    
    // Show betting recommendations as overlay
    betting: bettingLayer,
    
    // Show market comparison for transparency  
    market: marketComparison,
    
    // Metadata
    meta: {
      takeBet,
      skipReason,
      gameVariance,
      netEPAAdvantage,
      modelVersion: 'clean_epa_v1.0_enhanced'
    }
  };
}

// Helper for UI display
export function getDisplayText(value, noBetValue = '—') {
  if (value === null || value === undefined || value === '—') return noBetValue;
  if (typeof value === 'number') return value.toString();
  return value;
}