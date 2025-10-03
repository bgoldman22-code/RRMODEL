#!/usr/bin/env node
/**
 * NFL 2024 TRUE TIME-CONSTRAINED BACKTEST
 * 
 * Generates predictions week-by-week using ONLY data available at that time
 * This is a REAL backtest - no future knowledge leakage
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TrueNFLBacktest {
  constructor() {
    this.outputDir = path.join(__dirname, '..', 'backtest-results');
    this.actualResults = new Map();
    this.teamStats = new Map(); // Historical team performance
    this.weeklyPredictions = [];
  }

  /**
   * Parse actual results from CSV
   */
  parseActualResults(csvData) {
    console.log('📊 Parsing actual 2024 NFL results...');
    
    const lines = csvData.trim().split('\n');
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const parts = line.split(',');
      if (parts.length < 10) continue;
      
      const week = parseInt(parts[0]);
      const winner = parts[4].trim();
      const loser = parts[6].trim();
      const ptsW = parseInt(parts[8]);
      const ptsL = parseInt(parts[9]);
      const ydsW = parseInt(parts[10]);
      const ydsL = parseInt(parts[12]);
      
      if (!winner || !loser || isNaN(ptsW) || isNaN(ptsL)) continue;
      
      // Determine home/away
      let homeTeam, awayTeam, homeScore, awayScore, homeYds, awayYds;
      
      if (winner.includes('@')) {
        awayTeam = this.mapTeamName(winner.replace('@', '').trim());
        homeTeam = this.mapTeamName(loser);
        awayScore = ptsW;
        homeScore = ptsL;
        awayYds = ydsW;
        homeYds = ydsL;
      } else if (loser.includes('@')) {
        homeTeam = this.mapTeamName(winner);
        awayTeam = this.mapTeamName(loser.replace('@', '').trim());
        homeScore = ptsW;
        awayScore = ptsL;
        homeYds = ydsW;
        awayYds = ydsL;
      } else {
        homeTeam = this.mapTeamName(winner);
        awayTeam = this.mapTeamName(loser);
        homeScore = ptsW;
        awayScore = ptsL;
        homeYds = ydsW;
        awayYds = ydsL;
      }
      
      results.push({
        week,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        homeYds,
        awayYds,
        winner: homeScore > awayScore ? homeTeam : awayTeam
      });
      
      const key = `${week}_${homeTeam}_${awayTeam}`;
      this.actualResults.set(key, results[results.length - 1]);
    }
    
    console.log(`✅ Parsed ${results.length} actual game results`);
    return results;
  }

  mapTeamName(fullName) {
    const teamMap = {
      'Kansas City Chiefs': 'KC', 'Buffalo Bills': 'BUF', 'Baltimore Ravens': 'BAL',
      'San Francisco 49ers': 'SF', 'Detroit Lions': 'DET', 'Philadelphia Eagles': 'PHI',
      'Dallas Cowboys': 'DAL', 'Green Bay Packers': 'GB', 'Miami Dolphins': 'MIA',
      'Cincinnati Bengals': 'CIN', 'Jacksonville Jaguars': 'JAX', 'Houston Texans': 'HOU',
      'Los Angeles Chargers': 'LAC', 'Pittsburgh Steelers': 'PIT', 'Indianapolis Colts': 'IND',
      'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB', 'Minnesota Vikings': 'MIN',
      'Atlanta Falcons': 'ATL', 'New Orleans Saints': 'NO', 'Los Angeles Rams': 'LAR',
      'Cleveland Browns': 'CLE', 'Las Vegas Raiders': 'LV', 'New York Jets': 'NYJ',
      'Tennessee Titans': 'TEN', 'Chicago Bears': 'CHI', 'Washington Commanders': 'WAS',
      'Arizona Cardinals': 'ARI', 'New York Giants': 'NYG', 'Carolina Panthers': 'CAR',
      'New England Patriots': 'NE', 'Denver Broncos': 'DEN'
    };
    return teamMap[fullName] || fullName;
  }

  /**
   * Initialize team stats with preseason expectations
   */
  initializeTeamStats() {
    // Based on 2023 season and preseason expectations
    const preseasonPower = {
      'KC': 0.85, 'SF': 0.82, 'BAL': 0.80, 'BUF': 0.78, 'DET': 0.75, 'PHI': 0.73,
      'DAL': 0.70, 'MIA': 0.68, 'CIN': 0.66, 'JAX': 0.62, 'HOU': 0.60, 'GB': 0.58,
      'LAC': 0.56, 'NYJ': 0.54, 'PIT': 0.52, 'MIN': 0.50, 'SEA': 0.50, 'ATL': 0.48,
      'TB': 0.46, 'NO': 0.45, 'LAR': 0.44, 'IND': 0.42, 'CLE': 0.40, 'LV': 0.38,
      'WAS': 0.36, 'TEN': 0.35, 'ARI': 0.33, 'CHI': 0.30, 'NYG': 0.28, 'NE': 0.25,
      'CAR': 0.22, 'DEN': 0.20
    };

    for (const [team, power] of Object.entries(preseasonPower)) {
      this.teamStats.set(team, {
        power,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        yardsFor: 0,
        yardsAgainst: 0,
        games: 0
      });
    }
  }

  /**
   * Update team stats after a week's games
   */
  updateTeamStats(weekResults) {
    for (const game of weekResults) {
      // Update home team
      const homeStats = this.teamStats.get(game.homeTeam);
      if (homeStats) {
        homeStats.games++;
        homeStats.pointsFor += game.homeScore;
        homeStats.pointsAgainst += game.awayScore;
        homeStats.yardsFor += game.homeYds || 0;
        homeStats.yardsAgainst += game.awayYds || 0;
        if (game.homeScore > game.awayScore) {
          homeStats.wins++;
        } else {
          homeStats.losses++;
        }
        // Update power rating based on performance
        const expectedWin = homeStats.power > 0.5;
        const actualWon = game.homeScore > game.awayScore;
        if (actualWon && !expectedWin) homeStats.power = Math.min(0.95, homeStats.power + 0.02);
        if (!actualWon && expectedWin) homeStats.power = Math.max(0.05, homeStats.power - 0.02);
      }

      // Update away team
      const awayStats = this.teamStats.get(game.awayTeam);
      if (awayStats) {
        awayStats.games++;
        awayStats.pointsFor += game.awayScore;
        awayStats.pointsAgainst += game.homeScore;
        awayStats.yardsFor += game.awayYds || 0;
        awayStats.yardsAgainst += game.homeYds || 0;
        if (game.awayScore > game.homeScore) {
          awayStats.wins++;
        } else {
          awayStats.losses++;
        }
        const expectedWin = awayStats.power > 0.5;
        const actualWon = game.awayScore > game.homeScore;
        if (actualWon && !expectedWin) awayStats.power = Math.min(0.95, awayStats.power + 0.02);
        if (!actualWon && expectedWin) awayStats.power = Math.max(0.05, awayStats.power - 0.02);
      }
    }
  }

  /**
   * Generate prediction for a single game using ONLY historical data
   */
  predictGame(homeTeam, awayTeam, week) {
    const homeStats = this.teamStats.get(homeTeam) || { power: 0.5, games: 0 };
    const awayStats = this.teamStats.get(awayTeam) || { power: 0.5, games: 0 };

    // Home field advantage (approximately 3 points / ~0.03 power)
    const homeAdvantage = 0.03;
    
    // Calculate adjusted power ratings
    const homePower = homeStats.power + homeAdvantage;
    const awayPower = awayStats.power;

    // Predict winner
    const homeWinProb = homePower / (homePower + awayPower);
    const predictedWinner = homeWinProb > 0.5 ? homeTeam : awayTeam;
    
    // Calculate confidence (50-90% range)
    const rawConfidence = Math.abs(homeWinProb - 0.5) * 2; // 0 to 1
    const confidence = Math.round(50 + (rawConfidence * 40)); // 50 to 90

    // Calculate edge
    const edge = Math.abs(homePower - awayPower) * 100;

    // Bet recommendation (need 60%+ confidence and 5%+ edge)
    const betRecommendation = (confidence >= 60 && edge >= 5) ? 'BET' : 'NO BET';

    return {
      homeTeam,
      awayTeam,
      week,
      predictedWinner,
      confidence,
      edge: edge.toFixed(1),
      betRecommendation,
      homeWinProb: (homeWinProb * 100).toFixed(1),
      homePower: homePower.toFixed(3),
      awayPower: awayPower.toFixed(3)
    };
  }

  /**
   * Run backtest for all weeks
   */
  async runBacktest(allResults) {
    console.log('\n🏈 Starting TIME-CONSTRAINED backtest...\n');
    
    this.initializeTeamStats();
    
    // Group results by week
    const weeklyResults = {};
    for (const result of allResults) {
      if (!weeklyResults[result.week]) weeklyResults[result.week] = [];
      weeklyResults[result.week].push(result);
    }

    const weeks = Object.keys(weeklyResults).map(Number).sort((a, b) => a - b);
    
    let totalCorrect = 0;
    let totalGames = 0;
    let betCorrect = 0;
    let betTotal = 0;

    for (const week of weeks) {
      console.log(`\n📅 WEEK ${week}`);
      console.log(`   Using data from weeks 1-${week - 1} only`);
      
      const weekGames = weeklyResults[week];
      let weekCorrect = 0;
      let weekBetCorrect = 0;
      let weekBetTotal = 0;

      // Generate predictions for this week's games
      for (const game of weekGames) {
        const prediction = this.predictGame(game.homeTeam, game.awayTeam, week);
        const isCorrect = prediction.predictedWinner === game.winner;
        
        this.weeklyPredictions.push({
          ...prediction,
          actualWinner: game.winner,
          actualScore: `${game.homeScore}-${game.awayScore}`,
          correct: isCorrect
        });

        totalGames++;
        if (isCorrect) {
          totalCorrect++;
          weekCorrect++;
        }

        if (prediction.betRecommendation === 'BET') {
          betTotal++;
          weekBetTotal++;
          if (isCorrect) {
            betCorrect++;
            weekBetCorrect++;
          }
        }
      }

      const weekAcc = ((weekCorrect / weekGames.length) * 100).toFixed(1);
      const weekBetAcc = weekBetTotal > 0 ? ((weekBetCorrect / weekBetTotal) * 100).toFixed(1) : 'N/A';
      console.log(`   Overall: ${weekCorrect}/${weekGames.length} (${weekAcc}%)`);
      console.log(`   Bets: ${weekBetCorrect}/${weekBetTotal} (${weekBetAcc}%)`);

      // UPDATE team stats with this week's results
      this.updateTeamStats(weekGames);
    }

    // Final summary
    const overallAcc = ((totalCorrect / totalGames) * 100).toFixed(1);
    const betAcc = betTotal > 0 ? ((betCorrect / betTotal) * 100).toFixed(1) : '0';
    const roi = betTotal > 0 ? (((betCorrect * 0.91 - (betTotal - betCorrect)) / betTotal) * 100).toFixed(1) : '0';

    console.log('\n' + '═'.repeat(80));
    console.log('📊 FINAL TIME-CONSTRAINED BACKTEST RESULTS');
    console.log('═'.repeat(80));
    console.log(`Overall Accuracy: ${totalCorrect}/${totalGames} (${overallAcc}%)`);
    console.log(`Betting Record: ${betCorrect}-${betTotal - betCorrect} (${betAcc}%)`);
    console.log(`ROI (at -110): ${roi}%`);
    console.log(`Total Units: ${betTotal > 0 ? ((betCorrect * 0.91 - (betTotal - betCorrect))).toFixed(1) : '0'}`);
    console.log('═'.repeat(80));

    // Save results
    await this.saveResults();
  }

  async saveResults() {
    const csvHeader = 'week,homeTeam,awayTeam,predictedWinner,confidence,edge,betRecommendation,actualWinner,actualScore,correct';
    const rows = [csvHeader];
    
    for (const pred of this.weeklyPredictions) {
      rows.push([
        pred.week,
        pred.homeTeam,
        pred.awayTeam,
        pred.predictedWinner,
        pred.confidence,
        pred.edge,
        pred.betRecommendation,
        pred.actualWinner,
        pred.actualScore,
        pred.correct
      ].join(','));
    }

    const outPath = path.join(this.outputDir, 'nfl-2024-time-constrained-predictions.csv');
    await fs.writeFile(outPath, rows.join('\n'), 'utf8');
    console.log(`\n✅ Predictions saved to: ${outPath}`);
  }

  async run(csvData) {
    await fs.mkdir(this.outputDir, { recursive: true });
    const allResults = this.parseActualResults(csvData);
    await this.runBacktest(allResults);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const backtest = new TrueNFLBacktest();
  
  // Placeholder - will be replaced with actual data
  const csvData = `Week,Day,Date,Time,Winner/tie,,Loser/tie,,PtsW,PtsL,YdsW,TOW,YdsL,TOL
REPLACE_WITH_DATA`;

  backtest.run(csvData).catch(console.error);
}

export default TrueNFLBacktest;
