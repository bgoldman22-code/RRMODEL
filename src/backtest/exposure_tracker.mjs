/**
 * MLB HR Round Robin - Exposure Tracker
 * 
 * Portfolio analysis and exposure management
 * Generates heatmaps, enforces 70% cap, tracks risk concentration
 * 
 * GPT Enhancement: "Exposure-Aware Selection with heatmaps"
 */

/**
 * Exposure Tracker
 * Monitors player/game concentration across RR combinations
 */
class ExposureTracker {
  constructor() {
    this.config = {
      maxPlayerExposure: 0.70, // 70% cap
      maxGameExposure: 0.80, // 80% cap for games
      maxSameTeamExposure: 0.60 // 60% cap for same team
    };
  }

  /**
   * Calculate exposure for entire portfolio
   * @param {Array} pool - Player pool
   * @param {Array} validCombos - All valid RR combos
   * @param {Array} stakes - Stake allocation per combo
   */
  analyzeExposure(pool, validCombos, stakes) {
    const analysis = {
      playerExposure: this.calculatePlayerExposure(pool, validCombos, stakes),
      gameExposure: this.calculateGameExposure(pool, validCombos, stakes),
      teamExposure: this.calculateTeamExposure(pool, validCombos, stakes),
      correlationMatrix: this.buildCorrelationMatrix(pool, validCombos),
      riskMetrics: this.calculateRiskMetrics(pool, validCombos, stakes),
      violations: []
    };

    // Check for violations
    analysis.violations = this.checkViolations(analysis);
    
    return analysis;
  }

  /**
   * Calculate player-level exposure
   */
  calculatePlayerExposure(pool, validCombos, stakes) {
    const totalCombos = validCombos.length;
    const totalStake = stakes.reduce((a, b) => a + b, 0);
    
    const playerExposure = pool.map(player => {
      // Combo exposure (% of combos containing player)
      const combosWithPlayer = validCombos.filter(combo =>
        combo.some(p => p.playerId === player.playerId)
      );
      const comboExposure = combosWithPlayer.length / totalCombos;
      
      // Stake exposure (% of total stake on player)
      const stakeExposure = combosWithPlayer.reduce((sum, combo) => {
        const idx = validCombos.indexOf(combo);
        return sum + stakes[idx];
      }, 0) / totalStake;
      
      // Risk exposure (expected loss if player fails)
      const riskExposure = combosWithPlayer.reduce((sum, combo) => {
        const idx = validCombos.indexOf(combo);
        const comboStake = stakes[idx];
        const comboProbability = combo.reduce((prod, p) => prod * p.probability, 1);
        return sum + comboStake * comboProbability * (1 - player.probability);
      }, 0);
      
      return {
        playerId: player.playerId,
        playerName: player.name,
        team: player.team,
        gameId: player.gameId,
        probability: player.probability,
        comboCount: combosWithPlayer.length,
        comboExposure,
        stakeExposure,
        riskExposure,
        isOverExposed: comboExposure > this.config.maxPlayerExposure
      };
    });
    
    return playerExposure.sort((a, b) => b.comboExposure - a.comboExposure);
  }

  /**
   * Calculate game-level exposure
   */
  calculateGameExposure(pool, validCombos, stakes) {
    const gameMap = new Map();
    
    for (const player of pool) {
      if (!gameMap.has(player.gameId)) {
        gameMap.set(player.gameId, {
          gameId: player.gameId,
          teams: player.matchup || 'Unknown',
          players: []
        });
      }
      gameMap.get(player.gameId).players.push(player);
    }
    
    const totalCombos = validCombos.length;
    const totalStake = stakes.reduce((a, b) => a + b, 0);
    
    const gameExposure = [];
    
    for (const [gameId, gameData] of gameMap) {
      const combosWithGame = validCombos.filter(combo =>
        combo.some(p => p.gameId === gameId)
      );
      
      const comboExposure = combosWithGame.length / totalCombos;
      
      const stakeExposure = combosWithGame.reduce((sum, combo) => {
        const idx = validCombos.indexOf(combo);
        return sum + stakes[idx];
      }, 0) / totalStake;
      
      gameExposure.push({
        gameId,
        teams: gameData.teams,
        playerCount: gameData.players.length,
        players: gameData.players.map(p => p.name),
        comboCount: combosWithGame.length,
        comboExposure,
        stakeExposure,
        isOverExposed: comboExposure > this.config.maxGameExposure
      });
    }
    
    return gameExposure.sort((a, b) => b.comboExposure - a.comboExposure);
  }

  /**
   * Calculate team-level exposure
   */
  calculateTeamExposure(pool, validCombos, stakes) {
    const teamMap = new Map();
    
    for (const player of pool) {
      if (!teamMap.has(player.team)) {
        teamMap.set(player.team, []);
      }
      teamMap.get(player.team).push(player);
    }
    
    const totalCombos = validCombos.length;
    const totalStake = stakes.reduce((a, b) => a + b, 0);
    
    const teamExposure = [];
    
    for (const [team, players] of teamMap) {
      const combosWithTeam = validCombos.filter(combo =>
        combo.some(p => p.team === team)
      );
      
      const comboExposure = combosWithTeam.length / totalCombos;
      
      const stakeExposure = combosWithTeam.reduce((sum, combo) => {
        const idx = validCombos.indexOf(combo);
        return sum + stakes[idx];
      }, 0) / totalStake;
      
      teamExposure.push({
        team,
        playerCount: players.length,
        players: players.map(p => p.name),
        comboCount: combosWithTeam.length,
        comboExposure,
        stakeExposure,
        isOverExposed: comboExposure > this.config.maxSameTeamExposure
      });
    }
    
    return teamExposure.sort((a, b) => b.comboExposure - a.comboExposure);
  }

  /**
   * Build correlation matrix showing co-occurrence
   */
  buildCorrelationMatrix(pool, validCombos) {
    const matrix = [];
    
    for (let i = 0; i < pool.length; i++) {
      const row = [];
      
      for (let j = 0; j < pool.length; j++) {
        if (i === j) {
          row.push(1.0); // Self-correlation
        } else {
          // Count combos with both players
          const combosWithBoth = validCombos.filter(combo =>
            combo.some(p => p.playerId === pool[i].playerId) &&
            combo.some(p => p.playerId === pool[j].playerId)
          );
          
          const correlation = combosWithBoth.length / validCombos.length;
          row.push(correlation);
        }
      }
      
      matrix.push({
        playerId: pool[i].playerId,
        playerName: pool[i].name,
        correlations: row
      });
    }
    
    return matrix;
  }

  /**
   * Calculate portfolio risk metrics
   */
  calculateRiskMetrics(pool, validCombos, stakes) {
    const totalStake = stakes.reduce((a, b) => a + b, 0);
    
    // Expected value per combo
    const comboEVs = validCombos.map((combo, idx) => {
      const comboProbability = combo.reduce((prod, p) => prod * p.probability, 1);
      const stake = stakes[idx];
      
      // Assuming average odds (need real odds for production)
      const avgOdds = combo.length === 2 ? 12 : combo.length === 3 ? 80 : 500;
      const payout = stake * avgOdds;
      
      const ev = (comboProbability * payout) - stake;
      
      return {
        combo: combo.map(p => p.name),
        probability: comboProbability,
        stake,
        payout,
        ev,
        roi: ev / stake
      };
    });
    
    const totalEV = comboEVs.reduce((sum, c) => sum + c.ev, 0);
    const totalROI = totalEV / totalStake;
    
    // Variance calculation
    const variance = comboEVs.reduce((sum, c) => {
      return sum + Math.pow(c.ev - (totalEV / comboEVs.length), 2);
    }, 0) / comboEVs.length;
    
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = totalROI / stdDev;
    
    // Risk of ruin (simplified - probability of losing entire bankroll)
    const maxDrawdown = Math.min(...comboEVs.map(c => c.ev));
    const riskOfRuin = Math.exp(-2 * totalEV * totalStake / variance);
    
    return {
      totalStake,
      totalEV,
      totalROI,
      avgComboEV: totalEV / comboEVs.length,
      variance,
      stdDev,
      sharpeRatio,
      maxDrawdown,
      riskOfRuin,
      bestCombo: comboEVs.sort((a, b) => b.roi - a.roi)[0],
      worstCombo: comboEVs.sort((a, b) => a.roi - b.roi)[0]
    };
  }

  /**
   * Check for exposure violations
   */
  checkViolations(analysis) {
    const violations = [];
    
    // Player violations
    for (const player of analysis.playerExposure) {
      if (player.isOverExposed) {
        violations.push({
          type: 'player',
          severity: 'high',
          entity: player.playerName,
          exposure: player.comboExposure,
          limit: this.config.maxPlayerExposure,
          message: `${player.playerName} in ${(player.comboExposure * 100).toFixed(1)}% of combos (limit: ${this.config.maxPlayerExposure * 100}%)`
        });
      }
    }
    
    // Game violations
    for (const game of analysis.gameExposure) {
      if (game.isOverExposed) {
        violations.push({
          type: 'game',
          severity: 'medium',
          entity: game.teams,
          exposure: game.comboExposure,
          limit: this.config.maxGameExposure,
          message: `Game ${game.teams} in ${(game.comboExposure * 100).toFixed(1)}% of combos (limit: ${this.config.maxGameExposure * 100}%)`
        });
      }
    }
    
    // Team violations
    for (const team of analysis.teamExposure) {
      if (team.isOverExposed) {
        violations.push({
          type: 'team',
          severity: 'low',
          entity: team.team,
          exposure: team.comboExposure,
          limit: this.config.maxSameTeamExposure,
          message: `Team ${team.team} in ${(team.comboExposure * 100).toFixed(1)}% of combos (limit: ${this.config.maxSameTeamExposure * 100}%)`
        });
      }
    }
    
    return violations;
  }

  /**
   * Generate visual heatmap data
   */
  generateHeatmap(analysis) {
    const { playerExposure, correlationMatrix } = analysis;
    
    // Player exposure heatmap
    const exposureHeatmap = {
      type: 'exposure',
      title: 'Player Exposure Heatmap',
      data: playerExposure.map(p => ({
        player: p.playerName,
        comboExposure: p.comboExposure,
        stakeExposure: p.stakeExposure,
        riskExposure: p.riskExposure,
        color: this.getExposureColor(p.comboExposure)
      }))
    };
    
    // Correlation heatmap
    const correlationHeatmap = {
      type: 'correlation',
      title: 'Player Co-Occurrence Matrix',
      players: correlationMatrix.map(p => p.playerName),
      data: correlationMatrix.map(row => row.correlations)
    };
    
    return {
      exposureHeatmap,
      correlationHeatmap
    };
  }

  /**
   * Get color for exposure level
   */
  getExposureColor(exposure) {
    if (exposure > 0.70) return '#dc3545'; // Red - over limit
    if (exposure > 0.60) return '#fd7e14'; // Orange - warning
    if (exposure > 0.50) return '#ffc107'; // Yellow - caution
    if (exposure > 0.40) return '#20c997'; // Teal - healthy
    return '#28a745'; // Green - low exposure
  }

  /**
   * Generate exposure report
   */
  generateReport(analysis) {
    const { playerExposure, gameExposure, teamExposure, riskMetrics, violations } = analysis;
    
    const report = {
      summary: {
        totalPlayers: playerExposure.length,
        totalGames: gameExposure.length,
        totalTeams: teamExposure.length,
        violationCount: violations.length,
        highSeverity: violations.filter(v => v.severity === 'high').length,
        totalStake: riskMetrics.totalStake,
        expectedValue: riskMetrics.totalEV,
        roi: riskMetrics.totalROI
      },
      
      topExposures: {
        players: playerExposure.slice(0, 10),
        games: gameExposure.slice(0, 5),
        teams: teamExposure.slice(0, 5)
      },
      
      violations: violations.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      }),
      
      riskMetrics,
      
      recommendations: this.generateRecommendations(analysis)
    };
    
    return report;
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    
    // Check for over-exposed players
    const overExposed = analysis.playerExposure.filter(p => p.isOverExposed);
    if (overExposed.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'exposure',
        message: `${overExposed.length} player(s) exceed 70% exposure limit`,
        action: `Consider reducing: ${overExposed.map(p => p.playerName).join(', ')}`,
        impact: 'high'
      });
    }
    
    // Check for game concentration
    const topGame = analysis.gameExposure[0];
    if (topGame && topGame.comboExposure > 0.60) {
      recommendations.push({
        priority: 'medium',
        category: 'diversity',
        message: `High concentration in ${topGame.teams} (${(topGame.comboExposure * 100).toFixed(1)}%)`,
        action: 'Add players from other games for better diversity',
        impact: 'medium'
      });
    }
    
    // Check for team stacking
    const topTeam = analysis.teamExposure[0];
    if (topTeam && topTeam.playerCount > 3) {
      recommendations.push({
        priority: 'low',
        category: 'correlation',
        message: `${topTeam.playerCount} players from ${topTeam.team}`,
        action: 'High correlation risk if team underperforms',
        impact: 'low'
      });
    }
    
    // Check ROI
    if (analysis.riskMetrics.totalROI < 0) {
      recommendations.push({
        priority: 'critical',
        category: 'profitability',
        message: `Negative expected ROI: ${(analysis.riskMetrics.totalROI * 100).toFixed(2)}%`,
        action: 'Revise pool selection or reduce stakes',
        impact: 'critical'
      });
    }
    
    // Check Sharpe ratio
    if (analysis.riskMetrics.sharpeRatio < 0.5) {
      recommendations.push({
        priority: 'medium',
        category: 'risk',
        message: `Low risk-adjusted returns (Sharpe: ${analysis.riskMetrics.sharpeRatio.toFixed(2)})`,
        action: 'Consider more consistent selections or adjust stake allocation',
        impact: 'medium'
      });
    }
    
    return recommendations;
  }
}

export { ExposureTracker };
