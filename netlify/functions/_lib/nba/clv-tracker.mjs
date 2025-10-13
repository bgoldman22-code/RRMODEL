/**
 * CLV (Closing Line Value) Tracking System
 * 
 * Tracks:
 * 1. Open line vs close line (line movement)
 * 2. Open price vs close price (juice movement)
 * 3. CLV in basis points
 * 4. Win rate by CLV bucket
 * 5. ROI by CLV bucket
 */

import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * CLV Tracker
 * Records all bet snapshots with open/close data
 */
export class CLVTracker {
  constructor(snapshotDir = null) {
    this.snapshotDir = snapshotDir || join(process.cwd(), 'data', 'nba', 'snapshots');
    this.bets = [];
  }
  
  /**
   * Record a bet with open line/price
   */
  async recordBet(bet) {
    const record = {
      betId: bet.betId || `${bet.gameId}_${bet.marketType}_${Date.now()}`,
      gameId: bet.gameId,
      date: bet.date || new Date().toISOString().split('T')[0],
      time: new Date().toISOString(),
      
      // Game info
      homeTeam: bet.homeTeam,
      awayTeam: bet.awayTeam,
      
      // Market info
      marketType: bet.marketType, // spread, total, moneyline
      side: bet.side, // home, away, over, under
      
      // Open (when bet was placed)
      openLine: bet.openLine,
      openPrice: bet.openPrice,
      openOdds: bet.openOdds,
      openTime: new Date().toISOString(),
      
      // Model prediction
      modelPrediction: bet.modelPrediction,
      modelConfidence: bet.modelConfidence,
      modelEdge: bet.modelEdge,
      suggestedUnits: bet.suggestedUnits,
      
      // Close (will be filled later)
      closeLine: null,
      closePrice: null,
      closeOdds: null,
      closeTime: null,
      
      // CLV (will be calculated)
      clvLineBps: null,
      clvPriceBps: null,
      clvCategory: null,
      
      // Result (will be filled after game)
      actualResult: null,
      won: null,
      profit: null,
      
      // Status
      status: 'OPEN' // OPEN, CLOSED, GRADED
    };
    
    this.bets.push(record);
    await this.saveSnapshot();
    
    return record;
  }
  
  /**
   * Update bet with closing line/price
   */
  async updateClose(betId, closeData) {
    const bet = this.bets.find(b => b.betId === betId);
    
    if (!bet) {
      console.warn(`[CLV] Bet ${betId} not found`);
      return null;
    }
    
    bet.closeLine = closeData.closeLine;
    bet.closePrice = closeData.closePrice;
    bet.closeOdds = closeData.closeOdds;
    bet.closeTime = new Date().toISOString();
    bet.status = 'CLOSED';
    
    // Calculate CLV
    bet.clvLineBps = this.calculateLineCLV(bet);
    bet.clvPriceBps = this.calculatePriceCLV(bet);
    bet.clvCategory = this.categorizeCLV(bet.clvLineBps, bet.clvPriceBps);
    
    await this.saveSnapshot();
    
    console.log(`[CLV] Updated ${betId}: Line CLV=${bet.clvLineBps}bps, Price CLV=${bet.clvPriceBps}bps, Category=${bet.clvCategory}`);
    
    return bet;
  }
  
  /**
   * Grade bet with actual result
   */
  async gradeBet(betId, actualResult) {
    const bet = this.bets.find(b => b.betId === betId);
    
    if (!bet) {
      console.warn(`[CLV] Bet ${betId} not found`);
      return null;
    }
    
    bet.actualResult = actualResult;
    bet.won = this.didBetWin(bet, actualResult);
    bet.profit = this.calculateProfit(bet);
    bet.status = 'GRADED';
    
    await this.saveSnapshot();
    
    console.log(`[CLV] Graded ${betId}: ${bet.won ? 'WON' : 'LOST'}, Profit=${bet.profit}`);
    
    return bet;
  }
  
  /**
   * Calculate line movement CLV in basis points
   */
  calculateLineCLV(bet) {
    if (bet.openLine === null || bet.closeLine === null) return null;
    
    // For spreads/totals: positive BPs = we got better line
    // e.g., bet LAL -5.5, closed at -6.5 → we got +100bps value
    
    if (bet.marketType === 'spread') {
      if (bet.side === 'home') {
        // Negative spread moving more negative = better for home
        return (bet.openLine - bet.closeLine) * 100;
      } else {
        // Positive spread moving more positive = better for away
        return (bet.closeLine - bet.openLine) * 100;
      }
    }
    
    if (bet.marketType === 'total') {
      if (bet.side === 'over') {
        // Total moving up = worse for over
        return (bet.closeLine - bet.openLine) * -100;
      } else {
        // Total moving down = worse for under
        return (bet.openLine - bet.closeLine) * -100;
      }
    }
    
    return 0;
  }
  
  /**
   * Calculate price movement CLV in basis points
   */
  calculatePriceCLV(bet) {
    if (bet.openPrice === null || bet.closePrice === null) return null;
    
    // Convert American odds to decimal
    const openDecimal = this.americanToDecimal(bet.openPrice);
    const closeDecimal = this.americanToDecimal(bet.closePrice);
    
    // Higher decimal odds = better
    const improvement = (openDecimal - closeDecimal) / closeDecimal;
    
    return Math.round(improvement * 10000); // Convert to basis points
  }
  
  /**
   * Convert American odds to decimal
   */
  americanToDecimal(american) {
    if (american > 0) {
      return 1 + (american / 100);
    } else {
      return 1 + (100 / Math.abs(american));
    }
  }
  
  /**
   * Categorize CLV
   */
  categorizeCLV(lineBps, priceBps) {
    const total = (lineBps || 0) + (priceBps || 0);
    
    if (total >= 200) return 'EXCELLENT'; // 2%+ CLV
    if (total >= 100) return 'GOOD';      // 1-2% CLV
    if (total >= 0) return 'FAIR';        // 0-1% CLV
    if (total >= -100) return 'POOR';     // -1-0% CLV
    return 'VERY_POOR';                   // <-1% CLV
  }
  
  /**
   * Check if bet won
   */
  didBetWin(bet, result) {
    if (bet.marketType === 'spread') {
      const homeSpread = result.homeScore - result.awayScore;
      const homeCovers = homeSpread + bet.openLine > 0;
      return bet.side === 'home' ? homeCovers : !homeCovers;
    }
    
    if (bet.marketType === 'total') {
      const total = result.homeScore + result.awayScore;
      const overWins = total > bet.openLine;
      return bet.side === 'over' ? overWins : !overWins;
    }
    
    if (bet.marketType === 'moneyline') {
      const homeWins = result.homeScore > result.awayScore;
      return bet.side === 'home' ? homeWins : !homeWins;
    }
    
    return false;
  }
  
  /**
   * Calculate profit/loss
   */
  calculateProfit(bet) {
    if (!bet.won) return -bet.suggestedUnits;
    
    const odds = this.americanToDecimal(bet.openPrice);
    return bet.suggestedUnits * (odds - 1);
  }
  
  /**
   * Get CLV statistics
   */
  getCLVStats() {
    const graded = this.bets.filter(b => b.status === 'GRADED');
    
    if (graded.length === 0) return null;
    
    const byCategory = {};
    const categories = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'VERY_POOR'];
    
    for (const cat of categories) {
      const bets = graded.filter(b => b.clvCategory === cat);
      
      if (bets.length === 0) {
        byCategory[cat] = null;
        continue;
      }
      
      const wins = bets.filter(b => b.won).length;
      const totalProfit = bets.reduce((sum, b) => sum + b.profit, 0);
      const totalRisked = bets.reduce((sum, b) => sum + b.suggestedUnits, 0);
      
      byCategory[cat] = {
        count: bets.length,
        wins,
        winPct: (wins / bets.length * 100).toFixed(1),
        profit: totalProfit.toFixed(2),
        roi: ((totalProfit / totalRisked) * 100).toFixed(1),
        avgCLV: (bets.reduce((sum, b) => sum + (b.clvLineBps + b.clvPriceBps), 0) / bets.length).toFixed(0)
      };
    }
    
    return {
      totalBets: graded.length,
      byCategory,
      overall: {
        wins: graded.filter(b => b.won).length,
        winPct: (graded.filter(b => b.won).length / graded.length * 100).toFixed(1),
        profit: graded.reduce((sum, b) => sum + b.profit, 0).toFixed(2),
        roi: ((graded.reduce((sum, b) => sum + b.profit, 0) / graded.reduce((sum, b) => sum + b.suggestedUnits, 0)) * 100).toFixed(1),
        avgCLV: (graded.reduce((sum, b) => sum + (b.clvLineBps + b.clvPriceBps), 0) / graded.length).toFixed(0)
      }
    };
  }
  
  /**
   * Save snapshot to CSV
   */
  async saveSnapshot() {
    await fs.mkdir(this.snapshotDir, { recursive: true });
    
    const today = new Date().toISOString().split('T')[0];
    const csvPath = join(this.snapshotDir, `clv_${today}.csv`);
    
    // CSV header
    const headers = [
      'betId', 'gameId', 'date', 'time',
      'homeTeam', 'awayTeam',
      'marketType', 'side',
      'openLine', 'openPrice', 'openOdds',
      'closeLine', 'closePrice', 'closeOdds',
      'clvLineBps', 'clvPriceBps', 'clvCategory',
      'modelPrediction', 'modelConfidence', 'modelEdge',
      'suggestedUnits', 'actualResult', 'won', 'profit',
      'status'
    ].join(',');
    
    // CSV rows
    const rows = this.bets.map(bet => [
      bet.betId,
      bet.gameId,
      bet.date,
      bet.time,
      bet.homeTeam,
      bet.awayTeam,
      bet.marketType,
      bet.side,
      bet.openLine,
      bet.openPrice,
      bet.openOdds,
      bet.closeLine || '',
      bet.closePrice || '',
      bet.closeOdds || '',
      bet.clvLineBps || '',
      bet.clvPriceBps || '',
      bet.clvCategory || '',
      bet.modelPrediction,
      bet.modelConfidence,
      bet.modelEdge,
      bet.suggestedUnits,
      bet.actualResult || '',
      bet.won !== null ? bet.won : '',
      bet.profit !== null ? bet.profit : '',
      bet.status
    ].join(','));
    
    const csv = [headers, ...rows].join('\n');
    
    await fs.writeFile(csvPath, csv);
  }
  
  /**
   * Load existing snapshot
   */
  async loadSnapshot(date) {
    const csvPath = join(this.snapshotDir, `clv_${date}.csv`);
    
    try {
      const csv = await fs.readFile(csvPath, 'utf-8');
      const lines = csv.split('\n');
      
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        
        if (values.length < 25) continue;
        
        this.bets.push({
          betId: values[0],
          gameId: values[1],
          date: values[2],
          time: values[3],
          homeTeam: values[4],
          awayTeam: values[5],
          marketType: values[6],
          side: values[7],
          openLine: parseFloat(values[8]) || null,
          openPrice: parseInt(values[9]) || null,
          openOdds: parseFloat(values[10]) || null,
          closeLine: parseFloat(values[11]) || null,
          closePrice: parseInt(values[12]) || null,
          closeOdds: parseFloat(values[13]) || null,
          clvLineBps: parseFloat(values[14]) || null,
          clvPriceBps: parseFloat(values[15]) || null,
          clvCategory: values[16] || null,
          modelPrediction: parseFloat(values[17]) || null,
          modelConfidence: parseFloat(values[18]) || null,
          modelEdge: parseFloat(values[19]) || null,
          suggestedUnits: parseFloat(values[20]) || null,
          actualResult: values[21] || null,
          won: values[22] === 'true' ? true : values[22] === 'false' ? false : null,
          profit: parseFloat(values[23]) || null,
          status: values[24] || 'OPEN'
        });
      }
      
      console.log(`[CLV] Loaded ${this.bets.length} bets from ${date}`);
      
    } catch (error) {
      console.warn(`[CLV] Could not load snapshot for ${date}:`, error.message);
    }
  }
}

/**
 * USAGE EXAMPLE:
 * 
 * const tracker = new CLVTracker();
 * 
 * // When placing bet
 * const bet = await tracker.recordBet({
 *   gameId: 'game1',
 *   date: '2024-10-15',
 *   homeTeam: 'LAL',
 *   awayTeam: 'BOS',
 *   marketType: 'spread',
 *   side: 'home',
 *   openLine: -5.5,
 *   openPrice: -110,
 *   openOdds: 1.91,
 *   modelPrediction: -7.2,
 *   modelConfidence: 0.85,
 *   modelEdge: 3.5,
 *   suggestedUnits: 3
 * });
 * 
 * // Before game starts (closing lines)
 * await tracker.updateClose(bet.betId, {
 *   closeLine: -6.5,
 *   closePrice: -115,
 *   closeOdds: 1.87
 * });
 * // CLV: Got -5.5 vs close -6.5 = +100bps line value
 * 
 * // After game finishes
 * await tracker.gradeBet(bet.betId, {
 *   homeScore: 112,
 *   awayScore: 105
 * });
 * // LAL won by 7, covered -5.5 → BET WON
 * 
 * // View stats
 * const stats = tracker.getCLVStats();
 * console.log(stats);
 * // {
 * //   byCategory: {
 * //     EXCELLENT: { wins: 15, winPct: 60%, roi: 12% },
 * //     GOOD: { wins: 22, winPct: 55%, roi: 8% },
 * //     ...
 * //   }
 * // }
 */
