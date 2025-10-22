/**
 * NHL Elite Model Training Pipeline
 * 
 * Orchestrates the complete training process:
 * 1. Fetch historical game data (3 seasons)
 * 2. Fit all parameters using MLE
 * 3. Backtest for validation
 * 4. Deploy learned parameters to production
 * 
 * Run this weekly to keep model up-to-date
 */

import { fetchHistoricalData } from './historical-data-fetcher.mjs';
import { fitAllParameters } from './fit-parameters.mjs';
import { runCompleteBacktest } from './backtest-engine.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runFullPipeline() {
  console.log('🚀 NHL ELITE MODEL TRAINING PIPELINE');
  console.log('='.repeat(80));
  console.log('This will take 1-2 hours depending on API rate limits...\n');
  
  const startTime = Date.now();
  
  try {
    // Step 1: Fetch historical data
    console.log('\n📥 STEP 1: Fetching historical game data...');
    console.log('-'.repeat(80));
    
    const dataPath = path.join(__dirname, '../../data/nhl/historical_game_data.json');
    
    let historicalData;
    if (fs.existsSync(dataPath)) {
      console.log('⚡ Historical data already exists. Skipping fetch.');
      console.log('   Delete data/nhl/historical_game_data.json to re-fetch.');
      historicalData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    } else {
      historicalData = await fetchHistoricalData();
    }
    
    console.log(`✅ Step 1 complete: ${historicalData.totalGames.toLocaleString()} games collected`);
    
    // Step 2: Fit parameters
    console.log('\n🧠 STEP 2: Fitting parameters using Maximum Likelihood Estimation...');
    console.log('-'.repeat(80));
    
    const parameters = await fitAllParameters();
    
    console.log('✅ Step 2 complete: All parameters fitted');
    
    // Step 3: Backtest
    console.log('\n🎯 STEP 3: Running backtest validation...');
    console.log('-'.repeat(80));
    
    const backtestResults = await runCompleteBacktest();
    
    console.log('✅ Step 3 complete: Backtest validation done');
    
    // Step 4: Generate summary report
    console.log('\n📊 STEP 4: Generating summary report...');
    console.log('-'.repeat(80));
    
    const report = {
      pipelineVersion: '1.0',
      runDate: new Date().toISOString(),
      runtime: `${Math.round((Date.now() - startTime) / 1000)}s`,
      
      dataCollection: {
        totalGames: historicalData.totalGames,
        uniquePlayers: historicalData.uniquePlayers,
        seasons: historicalData.seasons
      },
      
      parameterFitting: {
        homeAwayTeams: Object.keys(parameters.homeAwayEffects).length,
        venues: Object.keys(parameters.venueEffects).length,
        toiPowerLaw: parameters.toiRelationship.powerLaw,
        streakMultipliers: {
          hot: parameters.streakEffects.hotMultiplier,
          cold: parameters.streakEffects.coldMultiplier,
          vsCurrent: {
            hotAssumed: 1.15,
            coldAssumed: 0.85
          }
        },
        dispersion: parameters.dispersionParams,
        powerPlay: parameters.powerPlayBoost
      },
      
      backtestResults: {
        totalPredictions: backtestResults.results.totalPredictions,
        meanAbsoluteError: backtestResults.results.meanAbsoluteError,
        correlation: backtestResults.results.correlation,
        bias: backtestResults.results.bias,
        winRates: {
          overBets: backtestResults.results.overBetWinRate,
          underBets: backtestResults.results.underBetWinRate,
          highConfOver: backtestResults.results.highConfOverWinRate,
          highConfUnder: backtestResults.results.highConfUnderWinRate
        }
      },
      
      recommendations: generateRecommendations(backtestResults.results, parameters)
    };
    
    // Save report
    const reportPath = path.join(__dirname, '../../data/nhl/training_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('✅ Step 4 complete: Report generated');
    
    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('🎉 PIPELINE COMPLETE!');
    console.log('='.repeat(80));
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Training data: ${report.dataCollection.totalGames.toLocaleString()} games`);
    console.log(`   Backtest predictions: ${report.backtestResults.totalPredictions.toLocaleString()}`);
    console.log(`   Mean error: ${report.backtestResults.meanAbsoluteError.toFixed(3)} shots`);
    console.log(`   Correlation: ${report.backtestResults.correlation.toFixed(3)}`);
    console.log(`   OVER 2.5 win rate: ${(report.backtestResults.winRates.overBets * 100).toFixed(1)}%`);
    console.log(`   UNDER 2.5 win rate: ${(report.backtestResults.winRates.underBets * 100).toFixed(1)}%`);
    console.log(`   High conf OVER: ${(report.backtestResults.winRates.highConfOver * 100).toFixed(1)}%`);
    console.log(`   High conf UNDER: ${(report.backtestResults.winRates.highConfUnder * 100).toFixed(1)}%`);
    
    console.log(`\n📁 FILES GENERATED:`);
    console.log(`   ${dataPath}`);
    console.log(`   ${path.join(__dirname, '../../data/nhl/learned_parameters.json')}`);
    console.log(`   ${path.join(__dirname, '../../data/nhl/backtest_results.json')}`);
    console.log(`   ${reportPath}`);
    
    console.log(`\n⏱️  Total runtime: ${report.runtime}`);
    
    // Print recommendations
    if (report.recommendations.length > 0) {
      console.log(`\n💡 RECOMMENDATIONS:`);
      report.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }
    
    console.log('\n✅ Model is now using LEARNED PARAMETERS instead of assumptions!');
    console.log('   Update projection engine to load learned_parameters.json\n');
    
    return report;
    
  } catch (error) {
    console.error('\n❌ Pipeline failed:', error);
    throw error;
  }
}

/**
 * Generate recommendations based on backtest results
 */
function generateRecommendations(results, params) {
  const recs = [];
  
  // Check for bias
  if (Math.abs(results.bias) > 0.1) {
    recs.push(`Model has ${results.bias > 0 ? 'over' : 'under'}prediction bias of ${Math.abs(results.bias).toFixed(2)} shots - consider calibration`);
  }
  
  // Check correlation
  if (results.correlation < 0.5) {
    recs.push(`Low correlation (${results.correlation.toFixed(3)}) - model needs more predictive features`);
  } else if (results.correlation > 0.7) {
    recs.push(`Excellent correlation (${results.correlation.toFixed(3)}) - model is highly predictive!`);
  }
  
  // Check win rates
  if (results.overBetWinRate < 0.45) {
    recs.push(`OVER bet win rate is low (${(results.overBetWinRate * 100).toFixed(1)}%) - may be overpredicting`);
  }
  
  if (results.underBetWinRate < 0.45) {
    recs.push(`UNDER bet win rate is low (${(results.underBetWinRate * 100).toFixed(1)}%) - may be underpredicting`);
  }
  
  // Check high confidence
  if (results.highConfOverWinRate > 0.60) {
    recs.push(`High confidence OVER bets win ${(results.highConfOverWinRate * 100).toFixed(1)}% - STRONG EDGE!`);
  }
  
  if (results.highConfUnderWinRate > 0.60) {
    recs.push(`High confidence UNDER bets win ${(results.highConfUnderWinRate * 100).toFixed(1)}% - STRONG EDGE!`);
  }
  
  // Check streak multipliers vs learned
  const hotDiff = Math.abs(params.streakEffects.hotMultiplier - 1.15);
  const coldDiff = Math.abs(params.streakEffects.coldMultiplier - 0.85);
  
  if (hotDiff > 0.05) {
    recs.push(`Hot streak multiplier learned as ${params.streakEffects.hotMultiplier.toFixed(3)}x (was 1.15x assumed)`);
  }
  
  if (coldDiff > 0.05) {
    recs.push(`Cold streak multiplier learned as ${params.streakEffects.coldMultiplier.toFixed(3)}x (was 0.85x assumed)`);
  }
  
  return recs;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFullPipeline()
    .then(() => {
      console.log('\n✅ All done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    });
}

export { runFullPipeline };
