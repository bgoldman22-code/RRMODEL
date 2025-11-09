/**
 * MLB HR Round Robin - Closing Line Value (CLV) Tracker
 * 
 * Measures bet timing and line value
 * Compares snapshot odds → closing odds → execution odds
 * 
 * GPT Enhancement: "CLV Tracking and Measurement"
 */

/**
 * CLV Tracker
 * Tracks and measures closing line value across all bets
 */
class CLVTracker {
  constructor() {
    this.snapshots = [];
    this.executions = [];
  }

  /**
   * Record odds snapshot (when prediction made)
   * @param {String} date - Date of snapshot
   * @param {Array} players - Players with odds at snapshot time
   */
  recordSnapshot(date, players) {
    const snapshot = {
      timestamp: new Date(date),
      type: 'snapshot',
      players: players.map(p => ({
        playerId: p.playerId,
        playerName: p.name,
        gameId: p.gameId,
        probability: p.probability,
        odds: p.odds || null,
        impliedProbability: p.odds ? this.oddsToImpliedProbability(p.odds) : null
      }))
    };
    
    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Record closing odds (just before game start)
   * @param {String} date - Date of closing
   * @param {Array} players - Players with closing odds
   */
  recordClosing(date, players) {
    const closing = {
      timestamp: new Date(date),
      type: 'closing',
      players: players.map(p => ({
        playerId: p.playerId,
        playerName: p.name,
        gameId: p.gameId,
        odds: p.odds,
        impliedProbability: this.oddsToImpliedProbability(p.odds)
      }))
    };
    
    return closing;
  }

  /**
   * Record execution odds (when bet actually placed)
   * @param {String} date - Date of execution
   * @param {Array} players - Players with execution odds
   */
  recordExecution(date, players) {
    const execution = {
      timestamp: new Date(date),
      type: 'execution',
      players: players.map(p => ({
        playerId: p.playerId,
        playerName: p.name,
        gameId: p.gameId,
        odds: p.odds,
        impliedProbability: this.oddsToImpliedProbability(p.odds),
        stake: p.stake || 0
      }))
    };
    
    this.executions.push(execution);
    return execution;
  }

  /**
   * Calculate CLV for a player
   * @param {Object} snapshot - Snapshot odds
   * @param {Object} closing - Closing odds
   * @param {Object} execution - Execution odds
   */
  calculateCLV(snapshot, closing, execution) {
    if (!snapshot || !closing || !execution) {
      return null;
    }

    // CLV = (Execution Odds - Closing Odds) / Closing Odds
    const clvAbsolute = execution.odds - closing.odds;
    const clvPercent = clvAbsolute / closing.odds;
    
    // Implied probability comparison
    const snapshotImplied = snapshot.impliedProbability;
    const closingImplied = closing.impliedProbability;
    const executionImplied = execution.impliedProbability;
    
    // Line movement
    const lineMovement = {
      snapshotToClosing: closing.odds - snapshot.odds,
      snapshotToExecution: execution.odds - snapshot.odds,
      executionToClosing: execution.odds - closing.odds
    };
    
    // Value assessment
    const beatClosing = execution.odds > closing.odds;
    const value = beatClosing ? 'positive' : 'negative';
    
    return {
      playerId: execution.playerId,
      playerName: execution.playerName,
      
      // Odds comparison
      snapshotOdds: snapshot.odds,
      closingOdds: closing.odds,
      executionOdds: execution.odds,
      
      // Implied probabilities
      snapshotImplied,
      closingImplied,
      executionImplied,
      
      // CLV metrics
      clvAbsolute,
      clvPercent,
      value,
      beatClosing,
      
      // Line movement
      lineMovement,
      
      // Model comparison
      modelProbability: snapshot.probability,
      modelEdge: snapshot.probability - executionImplied,
      marketAgrees: Math.abs(snapshot.probability - executionImplied) < 0.02
    };
  }

  /**
   * Analyze CLV for entire slate
   * @param {Array} snapshots - Snapshot odds for all players
   * @param {Array} closings - Closing odds for all players
   * @param {Array} executions - Execution odds for all players
   */
  analyzeSlate(snapshots, closings, executions) {
    const playerCLVs = [];
    
    for (const execution of executions) {
      const snapshot = snapshots.find(s => s.playerId === execution.playerId);
      const closing = closings.find(c => c.playerId === execution.playerId);
      
      if (snapshot && closing) {
        const clv = this.calculateCLV(snapshot, closing, execution);
        if (clv) {
          playerCLVs.push(clv);
        }
      }
    }
    
    // Aggregate metrics
    const avgCLV = playerCLVs.reduce((sum, c) => sum + c.clvPercent, 0) / playerCLVs.length;
    const positiveCLVCount = playerCLVs.filter(c => c.beatClosing).length;
    const positiveCLVRate = positiveCLVCount / playerCLVs.length;
    
    const avgLineMovement = playerCLVs.reduce((sum, c) => 
      sum + c.lineMovement.snapshotToClosing, 0
    ) / playerCLVs.length;
    
    const modelAgreement = playerCLVs.filter(c => c.marketAgrees).length / playerCLVs.length;
    
    return {
      playerCLVs: playerCLVs.sort((a, b) => b.clvPercent - a.clvPercent),
      
      summary: {
        totalPlayers: playerCLVs.length,
        avgCLV,
        positiveCLVCount,
        positiveCLVRate,
        avgLineMovement,
        modelAgreement
      },
      
      best: playerCLVs[0],
      worst: playerCLVs[playerCLVs.length - 1],
      
      timing: this.analyzeTimingImpact(playerCLVs)
    };
  }

  /**
   * Analyze timing impact (when to bet for best value)
   */
  analyzeTimingImpact(playerCLVs) {
    const earlyBetters = playerCLVs.filter(c => 
      c.lineMovement.snapshotToExecution > 0
    );
    
    const lateBetters = playerCLVs.filter(c => 
      c.lineMovement.snapshotToExecution <= 0
    );
    
    const earlyAvgCLV = earlyBetters.length > 0
      ? earlyBetters.reduce((sum, c) => sum + c.clvPercent, 0) / earlyBetters.length
      : 0;
    
    const lateAvgCLV = lateBetters.length > 0
      ? lateBetters.reduce((sum, c) => sum + c.clvPercent, 0) / lateBetters.length
      : 0;
    
    return {
      earlyBetCount: earlyBetters.length,
      lateBetCount: lateBetters.length,
      earlyAvgCLV,
      lateAvgCLV,
      recommendation: earlyAvgCLV > lateAvgCLV ? 'early' : 'late'
    };
  }

  /**
   * Generate CLV report
   * @param {String} startDate - Start date
   * @param {String} endDate - End date
   */
  generateReport(startDate, endDate) {
    // Filter by date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const relevantExecutions = this.executions.filter(e => 
      e.timestamp >= start && e.timestamp <= end
    );
    
    if (relevantExecutions.length === 0) {
      return {
        error: 'No executions found in date range',
        startDate,
        endDate
      };
    }

    // Aggregate CLV metrics
    const allCLVs = [];
    
    for (const execution of relevantExecutions) {
      const snapshot = this.findClosestSnapshot(execution);
      const closing = this.findClosing(execution);
      
      if (snapshot && closing) {
        for (let i = 0; i < execution.players.length; i++) {
          const clv = this.calculateCLV(
            snapshot.players[i],
            closing.players[i],
            execution.players[i]
          );
          
          if (clv) {
            allCLVs.push(clv);
          }
        }
      }
    }
    
    // Summary statistics
    const avgCLV = allCLVs.reduce((sum, c) => sum + c.clvPercent, 0) / allCLVs.length;
    const medianCLV = this.median(allCLVs.map(c => c.clvPercent));
    const stdDevCLV = this.stdDev(allCLVs.map(c => c.clvPercent));
    
    const positiveCLVCount = allCLVs.filter(c => c.beatClosing).length;
    const positiveCLVRate = positiveCLVCount / allCLVs.length;
    
    // Quartile analysis
    const sortedCLVs = [...allCLVs].sort((a, b) => a.clvPercent - b.clvPercent);
    const q1 = sortedCLVs[Math.floor(sortedCLVs.length * 0.25)];
    const q2 = sortedCLVs[Math.floor(sortedCLVs.length * 0.50)];
    const q3 = sortedCLVs[Math.floor(sortedCLVs.length * 0.75)];
    
    // Daily breakdown
    const dailyBreakdown = this.calculateDailyBreakdown(allCLVs, relevantExecutions);
    
    return {
      period: { startDate, endDate },
      totalBets: allCLVs.length,
      
      summary: {
        avgCLV,
        medianCLV,
        stdDevCLV,
        positiveCLVCount,
        positiveCLVRate,
        quartiles: {
          q1: q1.clvPercent,
          q2: q2.clvPercent,
          q3: q3.clvPercent
        }
      },
      
      topPerformers: allCLVs.sort((a, b) => b.clvPercent - a.clvPercent).slice(0, 10),
      worstPerformers: allCLVs.sort((a, b) => a.clvPercent - b.clvPercent).slice(0, 10),
      
      dailyBreakdown,
      
      modelVsMarket: this.analyzeModelVsMarket(allCLVs),
      
      recommendations: this.generateCLVRecommendations(allCLVs)
    };
  }

  /**
   * Calculate daily CLV breakdown
   */
  calculateDailyBreakdown(allCLVs, executions) {
    const byDate = new Map();
    
    for (const execution of executions) {
      const dateKey = execution.timestamp.toISOString().split('T')[0];
      
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      
      // Find CLVs for this execution
      const executionCLVs = allCLVs.filter(c => 
        execution.players.some(p => p.playerId === c.playerId)
      );
      
      byDate.get(dateKey).push(...executionCLVs);
    }
    
    const dailyStats = [];
    
    for (const [date, clvs] of byDate) {
      if (clvs.length > 0) {
        const avgCLV = clvs.reduce((sum, c) => sum + c.clvPercent, 0) / clvs.length;
        const positiveRate = clvs.filter(c => c.beatClosing).length / clvs.length;
        
        dailyStats.push({
          date,
          betCount: clvs.length,
          avgCLV,
          positiveRate,
          best: clvs.sort((a, b) => b.clvPercent - a.clvPercent)[0],
          worst: clvs.sort((a, b) => a.clvPercent - b.clvPercent)[0]
        });
      }
    }
    
    return dailyStats.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /**
   * Analyze model predictions vs market
   */
  analyzeModelVsMarket(allCLVs) {
    const modelWins = allCLVs.filter(c => c.modelEdge > 0.02); // Model > Market by 2%+
    const marketWins = allCLVs.filter(c => c.modelEdge < -0.02); // Market > Model by 2%+
    const agreement = allCLVs.filter(c => Math.abs(c.modelEdge) <= 0.02); // Within 2%
    
    return {
      modelWinCount: modelWins.length,
      marketWinCount: marketWins.length,
      agreementCount: agreement.length,
      
      modelWinRate: modelWins.length / allCLVs.length,
      marketWinRate: marketWins.length / allCLVs.length,
      agreementRate: agreement.length / allCLVs.length,
      
      avgModelEdge: allCLVs.reduce((sum, c) => sum + c.modelEdge, 0) / allCLVs.length,
      
      bestModelEdges: modelWins.sort((a, b) => b.modelEdge - a.modelEdge).slice(0, 10),
      worstModelEdges: marketWins.sort((a, b) => a.modelEdge - b.modelEdge).slice(0, 10)
    };
  }

  /**
   * Generate recommendations based on CLV analysis
   */
  generateCLVRecommendations(allCLVs) {
    const recommendations = [];
    
    const avgCLV = allCLVs.reduce((sum, c) => sum + c.clvPercent, 0) / allCLVs.length;
    const positiveCLVRate = allCLVs.filter(c => c.beatClosing).length / allCLVs.length;
    
    // Overall CLV performance
    if (avgCLV < -0.02) {
      recommendations.push({
        priority: 'high',
        category: 'timing',
        message: `Negative average CLV: ${(avgCLV * 100).toFixed(2)}%`,
        action: 'Consider betting closer to game time or improving line shopping',
        impact: 'high'
      });
    } else if (avgCLV > 0.02) {
      recommendations.push({
        priority: 'positive',
        category: 'timing',
        message: `Strong positive CLV: ${(avgCLV * 100).toFixed(2)}%`,
        action: 'Maintain current betting timing strategy',
        impact: 'positive'
      });
    }
    
    // Positive CLV rate
    if (positiveCLVRate < 0.45) {
      recommendations.push({
        priority: 'medium',
        category: 'selection',
        message: `Low positive CLV rate: ${(positiveCLVRate * 100).toFixed(1)}%`,
        action: 'Review player selection criteria - may be chasing steam',
        impact: 'medium'
      });
    }
    
    // Model vs market
    const modelAgreement = allCLVs.filter(c => c.marketAgrees).length / allCLVs.length;
    if (modelAgreement < 0.30) {
      recommendations.push({
        priority: 'high',
        category: 'calibration',
        message: `Low model-market agreement: ${(modelAgreement * 100).toFixed(1)}%`,
        action: 'Model may need recalibration or market has better information',
        impact: 'high'
      });
    }
    
    return recommendations;
  }

  /**
   * Utility: Find closest snapshot for execution
   */
  findClosestSnapshot(execution) {
    let closest = null;
    let minDiff = Infinity;
    
    for (const snapshot of this.snapshots) {
      const diff = Math.abs(execution.timestamp - snapshot.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snapshot;
      }
    }
    
    return closest;
  }

  /**
   * Utility: Find closing for execution
   */
  findClosing(execution) {
    // Closing should be just before execution (within 2 hours)
    const twoHours = 2 * 60 * 60 * 1000;
    
    for (const snapshot of this.snapshots) {
      if (snapshot.type === 'closing') {
        const diff = execution.timestamp - snapshot.timestamp;
        if (diff >= 0 && diff <= twoHours) {
          return snapshot;
        }
      }
    }
    
    return null;
  }

  /**
   * Utility: Convert American odds to implied probability
   */
  oddsToImpliedProbability(americanOdds) {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }

  /**
   * Utility: Median
   */
  median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  /**
   * Utility: Standard deviation
   */
  stdDev(arr) {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }
}

export { CLVTracker };
