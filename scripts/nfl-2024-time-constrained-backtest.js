#!/usr/bin/env node
/**
 * NFL 2024 TIME-CONSTRAINED BACKTEST
 * 
 * True historical backtest - predictions for each week use ONLY data available before that week
 * Week 5 predictions can only see data from weeks 1-4, etc.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TimeConstrainedBacktest {
  constructor() {
    this.outputDir = path.join(__dirname, '..', 'backtest-results');
    this.cacheDir = path.join(__dirname, '..', 'data', 'nfl', 'weekly-cache');
    this.predictions = [];
    this.weeklyStats = {};
  }

  async init() {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Fetch NFLVerse play-by-play data for specific weeks
   * Only fetches data that would have been available at prediction time
   */
  async fetchHistoricalData(maxWeek) {
    console.log(`📥 Fetching NFLVerse data through week ${maxWeek}...`);
    
    const cacheFile = path.join(this.cacheDir, `2024_through_week_${maxWeek}.json`);
    
    // Check cache first
    try {
      const cached = await fs.readFile(cacheFile, 'utf8');
      console.log(`✅ Using cached data for weeks 1-${maxWeek}`);
      return JSON.parse(cached);
    } catch (err) {
      // Cache doesn't exist, fetch from NFLVerse
    }
    
    try {
      // Fetch play-by-play data from NFLVerse
      const url = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2024.csv.gz`;
      
      console.log(`   Fetching from NFLVerse...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      
      // For now, we'll use a simplified approach - calculate team stats from game results
      // In a real implementation, you'd parse the full play-by-play data
      
      const data = {
        maxWeek,
        fetchedAt: new Date().toISOString(),
        teamStats: {},
        games: []
      };
      
      // Cache the result
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf8');
      
      return data;
    } catch (error) {
      console.warn(`⚠️ Could not fetch NFLVerse data: ${error.message}`);
      return { maxWeek, teamStats: {}, games: [] };
    }
  }

  /**
   * Calculate team statistics from available game results
   * This is what the model would "know" at prediction time
   */
  calculateTeamStats(gamesPlayed) {
    const stats = {};
    
    for (const game of gamesPlayed) {
      // Initialize team stats if needed
      if (!stats[game.homeTeam]) {
        stats[game.homeTeam] = {
          games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
          offYards: 0, defYards: 0, turnoversFor: 0, turnoversAgainst: 0
        };
      }
      if (!stats[game.awayTeam]) {
        stats[game.awayTeam] = {
          games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
          offYards: 0, defYards: 0, turnoversFor: 0, turnoversAgainst: 0
        };
      }
      
      // Home team stats
      stats[game.homeTeam].games++;
      stats[game.homeTeam].pointsFor += game.homeScore;
      stats[game.homeTeam].pointsAgainst += game.awayScore;
      stats[game.homeTeam].offYards += game.homeYards || 0;
      stats[game.homeTeam].defYards += game.awayYards || 0;
      stats[game.homeTeam].turnoversFor += game.homeTurnovers || 0;
      stats[game.homeTeam].turnoversAgainst += game.awayTurnovers || 0;
      
      if (game.homeScore > game.awayScore) {
        stats[game.homeTeam].wins++;
      } else {
        stats[game.homeTeam].losses++;
      }
      
      // Away team stats
      stats[game.awayTeam].games++;
      stats[game.awayTeam].pointsFor += game.awayScore;
      stats[game.awayTeam].pointsAgainst += game.homeScore;
      stats[game.awayTeam].offYards += game.awayYards || 0;
      stats[game.awayTeam].defYards += game.homeYards || 0;
      stats[game.awayTeam].turnoversFor += game.awayTurnovers || 0;
      stats[game.awayTeam].turnoversAgainst += game.homeTurnovers || 0;
      
      if (game.awayScore > game.homeScore) {
        stats[game.awayTeam].wins++;
      } else {
        stats[game.awayTeam].losses++;
      }
    }
    
    // Calculate per-game averages
    for (const team in stats) {
      const s = stats[team];
      if (s.games > 0) {
        s.ppg = s.pointsFor / s.games;
        s.papg = s.pointsAgainst / s.games;
        s.ypg = s.offYards / s.games;
        s.dypg = s.defYards / s.games;
        s.winPct = s.wins / s.games;
        s.pointDiff = s.ppg - s.papg;
        s.yardDiff = s.ypg - s.dypg;
        s.toMargin = (s.turnoversAgainst - s.turnoversFor) / s.games;
      }
    }
    
    return stats;
  }

  /**
   * Make a prediction using only historical data available at that time
   */
  predictGame(homeTeam, awayTeam, weekNum, historicalStats) {
    // Default stats for teams with no history (early season)
    const defaultStats = {
      games: 0, wins: 0, losses: 0, winPct: 0.5, ppg: 20, papg: 20,
      ypg: 330, dypg: 330, pointDiff: 0, yardDiff: 0, toMargin: 0
    };
    
    const homeStats = historicalStats[homeTeam] || defaultStats;
    const awayStats = historicalStats[awayTeam] || defaultStats;
    
    // Calculate prediction factors
    let homeAdvantage = 2.5; // Historical NFL home field advantage
    
    // Win percentage factor
    const winFactor = (homeStats.winPct - awayStats.winPct) * 10;
    
    // Point differential factor
    const pointFactor = (homeStats.pointDiff - awayStats.pointDiff) * 0.3;
    
    // Yards differential factor
    const yardFactor = (homeStats.yardDiff - awayStats.yardDiff) * 0.01;
    
    // Turnover margin factor
    const toFactor = (homeStats.toMargin - awayStats.toMargin) * 2;
    
    // Combine factors
    const homeEdge = homeAdvantage + winFactor + pointFactor + yardFactor + toFactor;
    
    // Convert to win probability (logistic function)
    const homeWinProb = 1 / (1 + Math.exp(-homeEdge / 3));
    
    // Determine pick and confidence
    const predictedWinner = homeWinProb > 0.5 ? homeTeam : awayTeam;
    const confidence = Math.round(Math.max(homeWinProb, 1 - homeWinProb) * 100);
    const edge = Math.abs(homeEdge);
    
    // Bet recommendation: only bet if confidence >= 60% and edge >= 3
    const betRecommendation = (confidence >= 60 && edge >= 3) ? 'BET' : 'NO BET';
    
    return {
      predictedWinner,
      confidence,
      edge: edge.toFixed(1),
      betRecommendation,
      homeWinProb: homeWinProb.toFixed(3),
      awayWinProb: (1 - homeWinProb).toFixed(3),
      factors: {
        homeAdvantage,
        winFactor: winFactor.toFixed(2),
        pointFactor: pointFactor.toFixed(2),
        yardFactor: yardFactor.toFixed(2),
        toFactor: toFactor.toFixed(2),
        totalEdge: homeEdge.toFixed(2)
      }
    };
  }

  /**
   * Load actual 2024 game results
   */
  async loadActualResults() {
    console.log('📊 Loading actual 2024 results...');
    const resultsFile = path.join(__dirname, '..', 'data', 'nfl', '2024_actual_results.json');
    const data = await fs.readFile(resultsFile, 'utf8');
    const results = JSON.parse(data);
    
    // Convert to game format and filter regular season only
    const games = results
      .filter(r => typeof r.week === 'number' && r.week >= 1 && r.week <= 18)
      .map(r => ({
        week: r.week,
        date: r.date,
        homeTeam: this.mapTeamName(r.home),
        awayTeam: this.mapTeamName(r.away),
        winner: this.mapTeamName(r.winner),
        homeScore: parseInt(r.score.split('-')[0]),
        awayScore: parseInt(r.score.split('-')[1]),
        homeYards: null, // Not in our data
        awayYards: null,
        homeTurnovers: null,
        awayTurnovers: null
      }));
    
    console.log(`✅ Loaded ${games.length} regular season games`);
    return games;
  }

  /**
   * Map full team names to abbreviations
   */
  mapTeamName(fullName) {
    const map = {
      'Kansas City': 'KC', 'Baltimore': 'BAL', 'Philadelphia': 'PHI',
      'Green Bay': 'GB', 'Pittsburgh': 'PIT', 'Atlanta': 'ATL',
      'Buffalo': 'BUF', 'Arizona': 'ARI', 'Cincinnati': 'CIN',
      'New England': 'NE', 'New Orleans': 'NO', 'Carolina': 'CAR',
      'Houston': 'HOU', 'Indianapolis': 'IND', 'Jacksonville': 'JAX',
      'Miami': 'MIA', 'Chicago': 'CHI', 'Tennessee': 'TEN',
      'Minnesota': 'MIN', 'NY Giants': 'NYG', 'LA Chargers': 'LAC',
      'Las Vegas': 'LV', 'Cleveland': 'CLE', 'Dallas': 'DAL',
      'Seattle': 'SEA', 'Denver': 'DEN', 'Tampa Bay': 'TB',
      'Washington': 'WAS', 'Detroit': 'DET', 'LA Rams': 'LAR',
      'NY Jets': 'NYJ', 'San Francisco': 'SF'
    };
    return map[fullName] || fullName;
  }

  /**
   * Run time-constrained backtest week by week
   */
  async runBacktest() {
    console.log('🏈 Starting Time-Constrained Backtest...\n');
    
    // Load all actual results
    const allGames = await this.loadActualResults();
    
    // Group games by week
    const gamesByWeek = {};
    for (const game of allGames) {
      if (!gamesByWeek[game.week]) {
        gamesByWeek[game.week] = [];
      }
      gamesByWeek[game.week].push(game);
    }
    
    const predictions = [];
    let gamesPlayedSoFar = [];
    
    // Process each week sequentially
    for (let week = 1; week <= 18; week++) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`WEEK ${week}`);
      console.log('='.repeat(60));
      
      // Calculate stats from games played BEFORE this week
      const historicalStats = this.calculateTeamStats(gamesPlayedSoFar);
      
      console.log(`📊 Using data from ${gamesPlayedSoFar.length} games (weeks 1-${week - 1})`);
      
      const weekGames = gamesByWeek[week] || [];
      console.log(`🎯 Predicting ${weekGames.length} games for week ${week}...\n`);
      
      let weekCorrect = 0;
      let weekBets = 0;
      let weekBetsCorrect = 0;
      
      // Make predictions for this week
      for (const game of weekGames) {
        const prediction = this.predictGame(
          game.homeTeam,
          game.awayTeam,
          week,
          historicalStats
        );
        
        const isCorrect = prediction.predictedWinner === game.winner;
        if (isCorrect) weekCorrect++;
        
        if (prediction.betRecommendation === 'BET') {
          weekBets++;
          if (isCorrect) weekBetsCorrect++;
        }
        
        predictions.push({
          week,
          date: game.date,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          predictedWinner: prediction.predictedWinner,
          confidence: prediction.confidence,
          edge: prediction.edge,
          betRecommendation: prediction.betRecommendation,
          actualWinner: game.winner,
          actualScore: `${game.homeScore}-${game.awayScore}`,
          correct: isCorrect
        });
        
        console.log(`   ${game.awayTeam} @ ${game.homeTeam}: Predicted ${prediction.predictedWinner} (${prediction.confidence}%) ${prediction.betRecommendation} → ${isCorrect ? '✅' : '❌'} (Actual: ${game.winner} ${game.homeScore}-${game.awayScore})`);
      }
      
      const weekAcc = weekGames.length > 0 ? ((weekCorrect / weekGames.length) * 100).toFixed(1) : '0.0';
      const weekBetAcc = weekBets > 0 ? ((weekBetsCorrect / weekBets) * 100).toFixed(1) : 'N/A';
      
      console.log(`\n   Week ${week} Results: ${weekCorrect}/${weekGames.length} (${weekAcc}%)`);
      console.log(`   Week ${week} Bets: ${weekBetsCorrect}/${weekBets} (${weekBetAcc}%)`);
      
      // Add this week's games to historical data for next week
      gamesPlayedSoFar = gamesPlayedSoFar.concat(weekGames);
    }
    
    return predictions;
  }

  /**
   * Analyze overall results
   */
  analyzeResults(predictions) {
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 FINAL TIME-CONSTRAINED BACKTEST RESULTS');
    console.log('='.repeat(80));
    
    const total = predictions.length;
    const correct = predictions.filter(p => p.correct).length;
    const totalBets = predictions.filter(p => p.betRecommendation === 'BET').length;
    const betsCorrect = predictions.filter(p => p.betRecommendation === 'BET' && p.correct).length;
    
    const accuracy = ((correct / total) * 100).toFixed(1);
    const betAccuracy = totalBets > 0 ? ((betsCorrect / totalBets) * 100).toFixed(1) : '0.0';
    
    // Calculate ROI (assuming -110 odds)
    const betsLost = totalBets - betsCorrect;
    const profit = (betsCorrect * 0.909) - betsLost; // Win $0.909 for every $1 bet at -110
    const roi = totalBets > 0 ? ((profit / totalBets) * 100).toFixed(1) : '0.0';
    
    console.log(`\n✅ Overall Accuracy: ${correct}/${total} (${accuracy}%)`);
    console.log(`💰 Betting Record: ${betsCorrect}-${betsLost} (${betAccuracy}%)`);
    console.log(`📈 ROI: ${roi}% (${profit > 0 ? '+' : ''}${profit.toFixed(1)} units on ${totalBets} bets)`);
    
    // Week by week
    console.log('\n📅 Week-by-Week Breakdown:');
    const byWeek = {};
    for (const pred of predictions) {
      if (!byWeek[pred.week]) {
        byWeek[pred.week] = { total: 0, correct: 0, bets: 0, betsCorrect: 0 };
      }
      byWeek[pred.week].total++;
      if (pred.correct) byWeek[pred.week].correct++;
      if (pred.betRecommendation === 'BET') {
        byWeek[pred.week].bets++;
        if (pred.correct) byWeek[pred.week].betsCorrect++;
      }
    }
    
    for (let w = 1; w <= 18; w++) {
      const stats = byWeek[w];
      if (stats) {
        const acc = ((stats.correct / stats.total) * 100).toFixed(1);
        const betAcc = stats.bets > 0 ? ((stats.betsCorrect / stats.bets) * 100).toFixed(1) : 'N/A';
        console.log(`   Week ${w}: ${stats.correct}/${stats.total} (${acc}%) | Bets: ${stats.betsCorrect}/${stats.bets} (${betAcc}%)`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }

  /**
   * Save results to CSV
   */
  async saveResults(predictions) {
    const csvPath = path.join(this.outputDir, 'time-constrained-backtest-2024.csv');
    
    const header = 'week,date,homeTeam,awayTeam,predictedWinner,confidence,edge,betRecommendation,actualWinner,actualScore,correct';
    const rows = predictions.map(p => 
      `${p.week},${p.date},${p.homeTeam},${p.awayTeam},${p.predictedWinner},${p.confidence},${p.edge},${p.betRecommendation},${p.actualWinner},${p.actualScore},${p.correct}`
    );
    
    await fs.writeFile(csvPath, [header, ...rows].join('\n'), 'utf8');
    console.log(`\n✅ Results saved to: ${csvPath}`);
  }

  async run() {
    await this.init();
    const predictions = await this.runBacktest();
    this.analyzeResults(predictions);
    await this.saveResults(predictions);
  }
}

// Run backtest
const backtest = new TimeConstrainedBacktest();
backtest.run().catch(console.error);
