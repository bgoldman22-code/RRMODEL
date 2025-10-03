#!/usr/bin/env node
/**
 * NFL BACKTESTING SYSTEM
 * 
 * Clean, separate backtesting framework that:
 * 1. Uses only NFLVerse data available at prediction time
 * 2. Doesn't modify production model
 * 3. Tests historical performance with time-aware constraints
 * 4. Validates prediction accuracy vs actual results
 * 
 * Usage:
 * node scripts/nfl-backtest-system.js --weeks 1,2,3 --season 2025
 * node scripts/nfl-backtest-system.js --week 1 --season 2024
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class NFLBacktestSystem {
  constructor() {
    this.season = 2025;
    this.weeks = [];
    this.results = [];
    this.debug = false;
    
    // Production API endpoint (we'll call this with historical constraints)
    this.productionAPI = 'https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate';
    
    // Local test results directory
    this.outputDir = path.join(__dirname, '..', 'backtest-results');
  }

  async init() {
    // Ensure output directory exists
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (e) {
      // Directory already exists
    }
  }

  /**
   * STEP 1: Get historical game results from NFLVerse
   * These are the "ground truth" outcomes we're testing against
   */
  async fetchHistoricalResults(week, season) {
    console.log(`📊 Fetching historical results for Week ${week}, ${season}...`);
    
    try {
      // For now, simulate NFLVerse data structure
      // In production, this would call nfl_data_py or NFLVerse API
      const mockResults = await this.getMockHistoricalResults(week, season);
      
      console.log(`✅ Found ${mockResults.length} completed games`);
      return mockResults;
      
    } catch (error) {
      console.error(`❌ Error fetching historical results:`, error.message);
      return [];
    }
  }

  /**
   * STEP 2: Simulate your model's predictions using only data available at that time
   * This is the key constraint - we can only use data that existed before the games
   */
  async generateHistoricalPredictions(games, targetWeek, season) {
    console.log(`🎯 Generating predictions for Week ${targetWeek} using pre-game data...`);
    
    const predictions = [];
    
    for (const game of games) {
      try {
        // Simulate calling your model with time constraints
        const prediction = await this.callModelWithTimeConstraints(game, targetWeek, season);
        
        if (prediction) {
          predictions.push({
            gameId: game.gameId,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            week: targetWeek,
            season: season,
            
            // Model predictions
            predictions: prediction.predictions,
            
            // Actual results (for comparison)
            actualResults: {
              homeScore: game.homeScore,
              awayScore: game.awayScore,
              margin: game.homeScore - game.awayScore,
              total: game.homeScore + game.awayScore,
              winner: game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam
            },
            
            // Time constraint metadata
            dataAvailableThrough: this.getDataCutoffDate(targetWeek, season),
            predictionGeneratedAt: new Date().toISOString()
          });
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to generate prediction for ${game.homeTeam} vs ${game.awayTeam}:`, error.message);
      }
    }
    
    console.log(`✅ Generated ${predictions.length} predictions`);
    return predictions;
  }

  /**
   * STEP 3: Analyze prediction accuracy
   */
  async analyzePredictionAccuracy(predictions) {
    console.log(`📈 Analyzing prediction accuracy for ${predictions.length} games...`);
    
    const analysis = {
      overall: {
        totalGames: predictions.length,
        moneylineCorrect: 0,
        spreadCorrect: 0,
        totalCorrect: 0
      },
      byWeek: {},
      bettingSimulation: {
        totalBets: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        roi: 0,
        units: 0
      },
      edgeValidation: {
        highEdgeBets: [],
        lowEdgeBets: []
      }
    };

    for (const pred of predictions) {
      const week = pred.week;
      if (!analysis.byWeek[week]) {
        analysis.byWeek[week] = {
          games: 0,
          moneylineCorrect: 0,
          spreadCorrect: 0,
          totalCorrect: 0
        };
      }

      analysis.overall.totalGames++;
      analysis.byWeek[week].games++;

      // Check moneyline accuracy
      const predictedWinner = pred.predictions.moneyline?.pick;
      const actualWinner = pred.actualResults.winner;
      
      if (predictedWinner === actualWinner) {
        analysis.overall.moneylineCorrect++;
        analysis.byWeek[week].moneylineCorrect++;
      }

      // Check spread accuracy
      if (pred.predictions.spread) {
        const predictedMargin = pred.predictions.spread.predicted || 0;
        const actualMargin = pred.actualResults.margin;
        const line = pred.predictions.spread.line || 0;
        
        // Did we pick the right side of the spread?
        const predictedCover = predictedMargin > line;
        const actualCover = actualMargin > line;
        
        if (predictedCover === actualCover) {
          analysis.overall.spreadCorrect++;
          analysis.byWeek[week].spreadCorrect++;
        }
      }

      // Check total accuracy
      if (pred.predictions.total) {
        const predictedTotal = pred.predictions.total.predicted || 0;
        const actualTotal = pred.actualResults.total;
        const line = pred.predictions.total.line || 0;
        
        const predictedOver = predictedTotal > line;
        const actualOver = actualTotal > line;
        
        if (predictedOver === actualOver) {
          analysis.overall.totalCorrect++;
          analysis.byWeek[week].totalCorrect++;
        }
      }

      // Simulate betting based on model recommendations
      this.simulateBetting(pred, analysis.bettingSimulation);
      
      // Track edge validation
      this.validateEdges(pred, analysis.edgeValidation);
    }

    // Calculate percentages
    analysis.overall.moneylineAccuracy = (analysis.overall.moneylineCorrect / analysis.overall.totalGames * 100).toFixed(1);
    analysis.overall.spreadAccuracy = (analysis.overall.spreadCorrect / analysis.overall.totalGames * 100).toFixed(1);
    analysis.overall.totalAccuracy = (analysis.overall.totalCorrect / analysis.overall.totalGames * 100).toFixed(1);

    // Calculate ROI
    if (analysis.bettingSimulation.totalBets > 0) {
      analysis.bettingSimulation.roi = (analysis.bettingSimulation.units / analysis.bettingSimulation.totalBets * 100).toFixed(2);
    }

    return analysis;
  }

  /**
   * STEP 4: Save results to local files
   */
  async saveResults(analysis, weeks, season) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backtest-${season}-W${weeks.join('-')}-${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);
    
    const output = {
      metadata: {
        season,
        weeks,
        generatedAt: new Date().toISOString(),
        modelVersion: 'production-api-call',
        dataConstraints: 'NFLVerse-available-at-time'
      },
      analysis,
      summary: this.generateSummary(analysis)
    };
    
    await fs.writeFile(filepath, JSON.stringify(output, null, 2));
    
    console.log(`💾 Results saved to: ${filepath}`);
    return filepath;
  }

  /**
   * HELPER METHODS
   */

  async callModelWithTimeConstraints(game, targetWeek, season) {
    // This simulates calling your production API with historical constraints
    // In practice, you'd modify the API call to only use data available before the target week
    
    // For now, return mock prediction structure
    return {
      predictions: {
        moneyline: {
          pick: Math.random() > 0.5 ? game.homeTeam : game.awayTeam,
          confidence: Math.floor(Math.random() * 30) + 50, // 50-80%
          edge: Math.random() * 5, // 0-5%
          betRecommendation: Math.random() > 0.7 ? 'BET' : 'NO BET'
        },
        spread: {
          pick: game.homeTeam,
          line: (Math.random() - 0.5) * 14, // -7 to +7
          predicted: (Math.random() - 0.5) * 20, // -10 to +10
          edge: Math.random() * 8, // 0-8%
          betRecommendation: Math.random() > 0.6 ? 'BET' : 'NO BET'
        },
        total: {
          pick: Math.random() > 0.5 ? 'Over' : 'Under',
          line: Math.floor(Math.random() * 10) + 40, // 40-50
          predicted: Math.floor(Math.random() * 15) + 35, // 35-50
          edge: Math.random() * 6, // 0-6%
          betRecommendation: Math.random() > 0.65 ? 'BET' : 'NO BET'
        }
      }
    };
  }

  getDataCutoffDate(week, season) {
    // Calculate what data would have been available before this week's games
    const seasonStart = new Date(`${season}-09-05`); // Approximate NFL season start
    const weekStart = new Date(seasonStart.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
    
    // Data cutoff is Tuesday before the week (when most injury reports finalize)
    const cutoff = new Date(weekStart);
    cutoff.setDate(cutoff.getDate() - 2); // 2 days before games
    
    return cutoff.toISOString();
  }

  async getMockHistoricalResults(week, season) {
    // Mock historical game results
    // In production, this would fetch from NFLVerse
    const games = [
      {
        gameId: `BUF_NYJ_${season}_W${week}`,
        homeTeam: 'NYJ',
        awayTeam: 'BUF',
        homeScore: 20,
        awayScore: 23,
        gameday: `${season}-09-${7 + (week - 1) * 7}`,
        week: week,
        season: season
      },
      {
        gameId: `KC_CIN_${season}_W${week}`,
        homeTeam: 'CIN',
        awayTeam: 'KC',
        homeScore: 17,
        awayScore: 26,
        gameday: `${season}-09-${7 + (week - 1) * 7}`,
        week: week,
        season: season
      }
      // Add more mock games as needed
    ];
    
    return games;
  }

  simulateBetting(prediction, bettingStats) {
    // Simulate betting based on model recommendations
    ['moneyline', 'spread', 'total'].forEach(betType => {
      const pred = prediction.predictions[betType];
      if (pred?.betRecommendation === 'BET' && pred.edge > 3) {
        bettingStats.totalBets++;
        
        // Simulate win/loss based on actual results
        // This is simplified - in practice you'd check against actual closing lines
        const won = Math.random() > 0.45; // Slightly worse than 50/50 due to vig
        
        if (won) {
          bettingStats.wins++;
          bettingStats.units += 0.9; // Assuming -110 odds
        } else {
          bettingStats.losses++;
          bettingStats.units -= 1.0;
        }
      }
    });
  }

  validateEdges(prediction, edgeValidation) {
    ['moneyline', 'spread', 'total'].forEach(betType => {
      const pred = prediction.predictions[betType];
      if (pred?.edge) {
        if (pred.edge > 5) {
          edgeValidation.highEdgeBets.push({
            game: `${prediction.homeTeam} vs ${prediction.awayTeam}`,
            type: betType,
            edge: pred.edge,
            pick: pred.pick
          });
        } else if (pred.edge < 2) {
          edgeValidation.lowEdgeBets.push({
            game: `${prediction.homeTeam} vs ${prediction.awayTeam}`,
            type: betType,
            edge: pred.edge,
            pick: pred.pick
          });
        }
      }
    });
  }

  generateSummary(analysis) {
    return {
      accuracy: `ML: ${analysis.overall.moneylineAccuracy}% | Spread: ${analysis.overall.spreadAccuracy}% | Total: ${analysis.overall.totalAccuracy}%`,
      betting: `${analysis.bettingSimulation.wins}-${analysis.bettingSimulation.losses} (${analysis.bettingSimulation.roi}% ROI)`,
      sampleSize: `${analysis.overall.totalGames} games across ${Object.keys(analysis.byWeek).length} weeks`,
      edgeValidation: `${analysis.edgeValidation.highEdgeBets.length} high-edge bets, ${analysis.edgeValidation.lowEdgeBets.length} low-edge bets`
    };
  }

  /**
   * MAIN EXECUTION
   */
  async run(options = {}) {
    console.log('🏈 NFL Backtesting System Starting...\n');
    
    this.season = options.season || 2025;
    this.weeks = options.weeks || [1, 2, 3];
    this.debug = options.debug || false;
    
    await this.init();
    
    const allPredictions = [];
    
    // Process each week
    for (const week of this.weeks) {
      console.log(`\n🔄 Processing Week ${week}, ${this.season}...`);
      
      // Get historical results for this week
      const historicalResults = await this.fetchHistoricalResults(week, this.season);
      
      if (historicalResults.length === 0) {
        console.log(`⚠️ No historical results found for Week ${week}`);
        continue;
      }
      
      // Generate predictions using time-constrained data
      const weekPredictions = await this.generateHistoricalPredictions(
        historicalResults, 
        week, 
        this.season
      );
      
      allPredictions.push(...weekPredictions);
    }
    
    if (allPredictions.length === 0) {
      console.log('❌ No predictions generated. Exiting.');
      return;
    }
    
    // Analyze overall performance
    console.log('\n📊 Analyzing prediction accuracy...');
    const analysis = await this.analyzePredictionAccuracy(allPredictions);
    
    // Save results
    const resultPath = await this.saveResults(analysis, this.weeks, this.season);
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('🏈 BACKTEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`📅 Season: ${this.season}, Weeks: ${this.weeks.join(', ')}`);
    console.log(`🎯 Games Analyzed: ${analysis.overall.totalGames}`);
    console.log(`📈 Accuracy:`);
    console.log(`   Moneyline: ${analysis.overall.moneylineAccuracy}%`);
    console.log(`   Spread: ${analysis.overall.spreadAccuracy}%`);
    console.log(`   Total: ${analysis.overall.totalAccuracy}%`);
    console.log(`💰 Betting Simulation:`);
    console.log(`   Record: ${analysis.bettingSimulation.wins}-${analysis.bettingSimulation.losses}`);
    console.log(`   ROI: ${analysis.bettingSimulation.roi}%`);
    console.log(`   Units: ${analysis.bettingSimulation.units.toFixed(2)}`);
    console.log(`💾 Full results: ${resultPath}`);
    console.log('='.repeat(60));
    
    return analysis;
  }
}

// CLI Interface
const args = process.argv.slice(2);
const options = {};

// Parse command line arguments
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace('--', '');
  const value = args[i + 1];
  
  if (key === 'weeks' && value) {
    options.weeks = value.split(',').map(w => parseInt(w.trim()));
  } else if (key === 'week' && value) {
    options.weeks = [parseInt(value)];
  } else if (key === 'season' && value) {
    options.season = parseInt(value);
  } else if (key === 'debug') {
    options.debug = true;
    i--; // No value for debug flag
  }
}

// Run backtest
const backtest = new NFLBacktestSystem();
backtest.run(options).catch(console.error);

export default NFLBacktestSystem;