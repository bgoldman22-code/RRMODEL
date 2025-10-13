/**
 * NBA Advanced Analytics - Pro Bettor Features
 * 
 * Elite analysis tools:
 * - Correlation matrix between features and outcomes
 * - Market inefficiency scanner
 * - Kelly criterion optimizer
 * - Bet ladder (progressive staking)
 * - Live odds tracker
 * - CLV (Closing Line Value) calculator
 */

/**
 * Calculate correlation matrix between features and outcomes
 */
export function calculateCorrelationMatrix(historicalData) {
  const features = Object.keys(historicalData[0].features);
  const matrix = {};
  
  console.log('[Analytics] Calculating correlation matrix for', features.length, 'features');
  
  // Calculate correlations for spread outcomes
  for (const feature of features) {
    const featureValues = historicalData.map(d => d.features[feature] || 0);
    const spreads = historicalData.map(d => d.actualSpread);
    
    const correlation = pearsonCorrelation(featureValues, spreads);
    
    matrix[feature] = {
      spread: correlation,
      abs: Math.abs(correlation),
      significance: Math.abs(correlation) > 0.3 ? 'HIGH' : 
                    Math.abs(correlation) > 0.15 ? 'MEDIUM' : 'LOW'
    };
  }
  
  // Sort by absolute correlation
  const sorted = Object.entries(matrix)
    .sort((a, b) => b[1].abs - a[1].abs)
    .slice(0, 30); // Top 30
  
  console.log('\n[Analytics] Top 30 Most Correlated Features:');
  sorted.forEach(([feature, stats], i) => {
    console.log(`  ${i + 1}. ${feature}: ${stats.spread.toFixed(3)} (${stats.significance})`);
  });
  
  return matrix;
}

/**
 * Pearson correlation coefficient
 */
function pearsonCorrelation(x, y) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Market Inefficiency Scanner
 * 
 * Identifies lines that are significantly off from model predictions
 */
export function scanMarketInefficiencies(predictions, threshold = 3) {
  console.log('[Analytics] Scanning for market inefficiencies...');
  
  const inefficiencies = [];
  
  for (const pred of predictions) {
    // Spread inefficiency
    if (pred.marketOdds?.spread && pred.edge?.spread) {
      if (Math.abs(pred.edge.spread.edge) >= threshold) {
        inefficiencies.push({
          game: pred.game,
          market: 'SPREAD',
          modelLine: pred.predictedSpread,
          marketLine: pred.marketOdds.spread,
          edge: pred.edge.spread.edge,
          edgePercent: pred.edge.spread.edgePercent,
          modelFavors: pred.edge.spread.modelFavors,
          confidence: pred.confidence,
          expectedValue: calculateEV(pred.homeWinProb / 100, -110), // Assuming -110 odds
          opportunity: categorizeOpportunity(pred.edge.spread.edgePercent, pred.confidence)
        });
      }
    }
    
    // Total inefficiency
    if (pred.marketOdds?.total && pred.edge?.total) {
      if (Math.abs(pred.edge.total.edge) >= threshold) {
        inefficiencies.push({
          game: pred.game,
          market: 'TOTAL',
          modelLine: pred.predictedTotal,
          marketLine: pred.marketOdds.total,
          edge: pred.edge.total.edge,
          edgePercent: pred.edge.total.edgePercent,
          modelFavors: pred.edge.total.modelFavors,
          confidence: pred.confidence,
          expectedValue: calculateEV(0.52, -110), // Estimated edge
          opportunity: categorizeOpportunity(pred.edge.total.edgePercent, pred.confidence)
        });
      }
    }
  }
  
  // Sort by opportunity quality
  inefficiencies.sort((a, b) => {
    const rankA = a.opportunity === 'ELITE' ? 3 : a.opportunity === 'STRONG' ? 2 : 1;
    const rankB = b.opportunity === 'ELITE' ? 3 : b.opportunity === 'STRONG' ? 2 : 1;
    return rankB - rankA;
  });
  
  console.log(`[Analytics] ✅ Found ${inefficiencies.length} market inefficiencies`);
  
  return inefficiencies;
}

/**
 * Categorize betting opportunity quality
 */
function categorizeOpportunity(edgePercent, confidence) {
  if (edgePercent > 10 && confidence > 70) return 'ELITE';
  if (edgePercent > 7 && confidence > 60) return 'STRONG';
  if (edgePercent > 5 && confidence > 55) return 'GOOD';
  if (edgePercent > 3 && confidence > 50) return 'MODERATE';
  return 'WEAK';
}

/**
 * Calculate Expected Value (EV)
 */
function calculateEV(winProb, odds) {
  // Convert American odds to decimal
  const decimalOdds = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
  
  const winAmount = decimalOdds - 1;
  const loseAmount = -1;
  
  const ev = (winProb * winAmount) + ((1 - winProb) * loseAmount);
  
  return {
    ev: ev * 100, // As percentage
    roi: ev * 100,
    evPerBet: ev
  };
}

/**
 * Kelly Criterion Optimizer
 * 
 * Calculates optimal bet sizing for a portfolio of bets
 */
export function optimizeKellyPortfolio(opportunities, bankroll, maxRisk = 0.25) {
  console.log('[Analytics] Optimizing Kelly portfolio...');
  
  const portfolio = [];
  let totalAllocation = 0;
  
  for (const opp of opportunities) {
    // Estimate win probability from edge
    const winProb = 0.5 + (opp.edgePercent / 100);
    
    // Get odds (assuming -110 if not specified)
    const odds = -110;
    const decimalOdds = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
    
    // Kelly formula
    const b = decimalOdds - 1;
    const p = winProb;
    const q = 1 - p;
    const kelly = (b * p - q) / b;
    
    // Apply fraction and cap
    const fractionalKelly = Math.max(0, Math.min(kelly * maxRisk, 0.05)); // Max 5% per bet
    
    if (fractionalKelly > 0.005) { // Only recommend if >0.5% of bankroll
      const allocation = fractionalKelly * 100;
      totalAllocation += allocation;
      
      portfolio.push({
        game: opp.game,
        market: opp.market,
        pick: opp.modelFavors,
        line: opp.marketLine,
        edge: opp.edge,
        winProb: (winProb * 100).toFixed(1),
        kelly: {
          full: (kelly * 100).toFixed(2),
          fractional: (fractionalKelly * 100).toFixed(2),
          dollars: Math.round(fractionalKelly * bankroll)
        },
        expectedValue: opp.expectedValue,
        opportunity: opp.opportunity
      });
    }
  }
  
  console.log(`[Analytics] ✅ Portfolio: ${portfolio.length} bets, ${totalAllocation.toFixed(2)}% allocation`);
  
  return {
    bets: portfolio,
    totalAllocation,
    diversification: portfolio.length,
    expectedROI: portfolio.reduce((sum, b) => sum + b.expectedValue.roi, 0) / portfolio.length
  };
}

/**
 * Bet Ladder - Progressive Staking System
 * 
 * Increases stakes as confidence and edge increase
 */
export function generateBetLadder(opportunities, bankroll, units = 5) {
  console.log('[Analytics] Generating bet ladder...');
  
  const unitSize = bankroll / 100; // 1 unit = 1% of bankroll
  const ladder = [];
  
  for (const opp of opportunities) {
    let unitStake;
    
    // Ladder logic based on opportunity quality
    switch (opp.opportunity) {
      case 'ELITE':
        unitStake = units; // 5 units
        break;
      case 'STRONG':
        unitStake = units * 0.8; // 4 units
        break;
      case 'GOOD':
        unitStake = units * 0.6; // 3 units
        break;
      case 'MODERATE':
        unitStake = units * 0.4; // 2 units
        break;
      default:
        unitStake = units * 0.2; // 1 unit
    }
    
    ladder.push({
      game: opp.game,
      market: opp.market,
      pick: opp.modelFavors,
      line: opp.marketLine,
      edge: opp.edge,
      confidence: opp.confidence,
      opportunity: opp.opportunity,
      units: unitStake,
      stake: Math.round(unitStake * unitSize),
      toWin: Math.round(unitStake * unitSize * 0.91), // Assuming -110
      rating: '⭐'.repeat(Math.ceil(unitStake))
    });
  }
  
  // Sort by units (highest first)
  ladder.sort((a, b) => b.units - a.units);
  
  const totalStake = ladder.reduce((sum, b) => sum + b.stake, 0);
  const totalUnits = ladder.reduce((sum, b) => sum + b.units, 0);
  
  console.log(`[Analytics] ✅ Ladder: ${ladder.length} bets, ${totalUnits.toFixed(1)} units ($${totalStake})`);
  
  return {
    bets: ladder,
    totalStake,
    totalUnits,
    bankrollRisk: (totalStake / bankroll) * 100
  };
}

/**
 * Closing Line Value (CLV) Calculator
 * 
 * Measures how much better you got the line vs closing line
 */
export function calculateCLV(betLine, closingLine, result) {
  const lineDiff = closingLine - betLine;
  
  // Positive CLV = you got a better line than closing
  const clv = result === 'win' ? lineDiff : -lineDiff;
  
  // Convert to percentage
  const clvPercent = (lineDiff / Math.abs(closingLine)) * 100;
  
  return {
    clv,
    clvPercent,
    quality: clvPercent > 3 ? 'EXCELLENT' :
             clvPercent > 1 ? 'GOOD' :
             clvPercent > -1 ? 'FAIR' :
             'POOR'
  };
}

/**
 * Live Odds Tracker - Monitors line movement
 */
export class LiveOddsTracker {
  constructor() {
    this.history = [];
    this.alerts = [];
  }
  
  /**
   * Track new odds snapshot
   */
  track(gameId, odds, timestamp) {
    this.history.push({
      gameId,
      odds,
      timestamp: timestamp || new Date().toISOString()
    });
    
    // Keep only last 100 snapshots
    if (this.history.length > 100) {
      this.history.shift();
    }
    
    // Detect significant moves
    this.detectLineMovement(gameId, odds);
  }
  
  /**
   * Detect significant line movement
   */
  detectLineMovement(gameId, currentOdds) {
    const gameHistory = this.history.filter(h => h.gameId === gameId);
    
    if (gameHistory.length < 2) return;
    
    const previous = gameHistory[gameHistory.length - 2].odds;
    
    // Check spread movement
    if (currentOdds.spread && previous.spread) {
      const spreadMove = Math.abs(currentOdds.spread - previous.spread);
      
      if (spreadMove >= 1.5) {
        this.alerts.push({
          gameId,
          type: 'SPREAD_MOVE',
          from: previous.spread,
          to: currentOdds.spread,
          movement: spreadMove,
          direction: currentOdds.spread > previous.spread ? 'UP' : 'DOWN',
          timestamp: new Date().toISOString(),
          significance: spreadMove >= 3 ? 'MAJOR' : 'MODERATE'
        });
      }
    }
    
    // Check total movement
    if (currentOdds.total && previous.total) {
      const totalMove = Math.abs(currentOdds.total - previous.total);
      
      if (totalMove >= 2) {
        this.alerts.push({
          gameId,
          type: 'TOTAL_MOVE',
          from: previous.total,
          to: currentOdds.total,
          movement: totalMove,
          direction: currentOdds.total > previous.total ? 'UP' : 'DOWN',
          timestamp: new Date().toISOString(),
          significance: totalMove >= 4 ? 'MAJOR' : 'MODERATE'
        });
      }
    }
  }
  
  /**
   * Get all alerts for a game
   */
  getAlerts(gameId) {
    return this.alerts.filter(a => a.gameId === gameId);
  }
  
  /**
   * Get line movement summary
   */
  getMovementSummary(gameId) {
    const gameHistory = this.history.filter(h => h.gameId === gameId);
    
    if (gameHistory.length < 2) {
      return { noData: true };
    }
    
    const first = gameHistory[0].odds;
    const last = gameHistory[gameHistory.length - 1].odds;
    
    return {
      spread: {
        open: first.spread,
        current: last.spread,
        movement: last.spread - first.spread,
        snapshots: gameHistory.length
      },
      total: {
        open: first.total,
        current: last.total,
        movement: last.total - first.total,
        snapshots: gameHistory.length
      },
      alerts: this.getAlerts(gameId)
    };
  }
}

/**
 * Bankroll Dashboard - Track performance
 */
export class BankrollDashboard {
  constructor(initialBankroll) {
    this.initialBankroll = initialBankroll;
    this.currentBankroll = initialBankroll;
    this.bets = [];
    this.results = [];
  }
  
  /**
   * Place a bet
   */
  placeBet(bet) {
    this.bets.push({
      ...bet,
      timestamp: new Date().toISOString(),
      status: 'PENDING'
    });
    
    this.currentBankroll -= bet.stake;
  }
  
  /**
   * Settle a bet
   */
  settleBet(betId, result, payout) {
    const bet = this.bets.find(b => b.id === betId);
    
    if (!bet) return;
    
    bet.status = result;
    bet.payout = payout;
    bet.profit = payout - bet.stake;
    
    this.currentBankroll += payout;
    
    this.results.push({
      bet,
      result,
      profit: bet.profit,
      roi: (bet.profit / bet.stake) * 100,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Get performance stats
   */
  getStats() {
    const settled = this.results.filter(r => r.result === 'WIN' || r.result === 'LOSS');
    
    if (settled.length === 0) {
      return { noData: true };
    }
    
    const wins = settled.filter(r => r.result === 'WIN').length;
    const losses = settled.length - wins;
    const winRate = (wins / settled.length) * 100;
    
    const totalProfit = settled.reduce((sum, r) => sum + r.profit, 0);
    const totalStaked = settled.reduce((sum, r) => sum + r.bet.stake, 0);
    const roi = (totalProfit / totalStaked) * 100;
    
    return {
      initialBankroll: this.initialBankroll,
      currentBankroll: this.currentBankroll,
      profit: this.currentBankroll - this.initialBankroll,
      profitPercent: ((this.currentBankroll - this.initialBankroll) / this.initialBankroll) * 100,
      totalBets: settled.length,
      wins,
      losses,
      winRate,
      roi,
      averageStake: totalStaked / settled.length,
      averageProfit: totalProfit / settled.length
    };
  }
}

export default {
  calculateCorrelationMatrix,
  scanMarketInefficiencies,
  optimizeKellyPortfolio,
  generateBetLadder,
  calculateCLV,
  LiveOddsTracker,
  BankrollDashboard
};
