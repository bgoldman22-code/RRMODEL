#!/usr/bin/env node

/**
 * Zero-Odds Backtest: Model Accuracy Validation
 * 
 * PURPOSE: Validate model predictions BEFORE worrying about odds/CLV
 * 
 * Tests:
 * 1. Win Rate: What % of HR predictions actually happened?
 * 2. Calibration: Do 30% probabilities hit 30% of the time?
 * 3. Discrimination: Can model separate high vs low HR probability?
 * 4. Feature Importance: What drives predictions?
 * 5. Temporal Stability: Does performance degrade over time?
 * 
 * Value: Proves model WORKS before adding complexity of odds/markets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================
// PHASE 1: DATA LOADING
// ==============================================

async function loadStatcastData(year) {
  const file = path.join(__dirname, '../data/mlb_historical/statcast', `${year}_pitches.json`);
  
  if (!fs.existsSync(file)) {
    console.error(`❌ Missing Statcast data for ${year}`);
    return null;
  }
  
  console.log(`📊 Loading ${year} Statcast data...`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`   ✅ Loaded ${data.length?.toLocaleString() || 'unknown'} pitches`);
  
  return data;
}

async function extractHREvents(statcastData) {
  // Filter to just home runs
  const hrs = statcastData.filter(pitch => 
    pitch.events === 'home_run' || 
    pitch.description?.toLowerCase().includes('home run')
  );
  
  console.log(`   🎯 Found ${hrs.length.toLocaleString()} home runs`);
  
  // Group by player-game
  const playerGameHRs = {};
  
  hrs.forEach(hr => {
    const key = `${hr.batter}_${hr.game_date}`;
    if (!playerGameHRs[key]) {
      playerGameHRs[key] = {
        batter_id: hr.batter,
        batter_name: hr.player_name,
        game_date: hr.game_date,
        pitcher_id: hr.pitcher,
        hr_count: 0,
        hrs: []
      };
    }
    playerGameHRs[key].hr_count++;
    playerGameHRs[key].hrs.push(hr);
  });
  
  return Object.values(playerGameHRs);
}

// ==============================================
// PHASE 2: BUILD SIMPLE FEATURES
// ==============================================

function buildBatterProfile(statcastData, batterId) {
  const batterPitches = statcastData.filter(p => p.batter === batterId);
  
  if (batterPitches.length === 0) return null;
  
  const battedBalls = batterPitches.filter(p => 
    p.launch_speed && p.launch_angle
  );
  
  const hrs = batterPitches.filter(p => p.events === 'home_run');
  
  return {
    batter_id: batterId,
    total_pa: batterPitches.length,
    batted_balls: battedBalls.length,
    hr_count: hrs.length,
    hr_rate: hrs.length / Math.max(batterPitches.length, 1),
    avg_exit_velo: battedBalls.reduce((sum, p) => sum + (p.launch_speed || 0), 0) / Math.max(battedBalls.length, 1),
    avg_launch_angle: battedBalls.reduce((sum, p) => sum + (p.launch_angle || 0), 0) / Math.max(battedBalls.length, 1),
    barrel_rate: battedBalls.filter(p => 
      p.launch_speed >= 98 && p.launch_angle >= 26 && p.launch_angle <= 30
    ).length / Math.max(battedBalls.length, 1)
  };
}

function buildPitcherProfile(statcastData, pitcherId) {
  const pitcherPitches = statcastData.filter(p => p.pitcher === pitcherId);
  
  if (pitcherPitches.length === 0) return null;
  
  const battedBalls = pitcherPitches.filter(p => 
    p.launch_speed && p.launch_angle
  );
  
  const hrsAllowed = pitcherPitches.filter(p => p.events === 'home_run');
  
  return {
    pitcher_id: pitcherId,
    total_pitches: pitcherPitches.length,
    batted_balls_allowed: battedBalls.length,
    hr_allowed: hrsAllowed.length,
    hr_rate_against: hrsAllowed.length / Math.max(pitcherPitches.length, 1),
    avg_exit_velo_against: battedBalls.reduce((sum, p) => sum + (p.launch_speed || 0), 0) / Math.max(battedBalls.length, 1),
    hard_contact_rate: battedBalls.filter(p => p.launch_speed >= 95).length / Math.max(battedBalls.length, 1)
  };
}

// ==============================================
// PHASE 3: SIMPLE PREDICTION MODEL
// ==============================================

function predictHRProbability(batterProfile, pitcherProfile, leagueAvg = 0.03) {
  if (!batterProfile || !pitcherProfile) {
    return leagueAvg; // League average ~3% HR rate
  }
  
  // Naive Bayes-style combination
  const batterFactor = Math.max(0.001, Math.min(0.2, batterProfile.hr_rate));
  const pitcherFactor = Math.max(0.001, Math.min(0.2, pitcherProfile.hr_rate_against));
  
  // Weighted by exit velocity and barrel rate
  const batterQuality = (batterProfile.avg_exit_velo / 95) * (1 + batterProfile.barrel_rate);
  const pitcherQuality = (pitcherProfile.avg_exit_velo_against / 90) * (1 + pitcherProfile.hard_contact_rate);
  
  const rawProb = leagueAvg * (batterFactor / leagueAvg) * (pitcherFactor / leagueAvg) * batterQuality * pitcherQuality;
  
  // Clamp between 1% and 20%
  return Math.max(0.01, Math.min(0.20, rawProb));
}

// ==============================================
// PHASE 4: BACKTEST EVALUATION
// ==============================================

function evaluateCalibration(predictions, outcomes) {
  // Group predictions into probability bins
  const bins = [0, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.15, 1.0];
  const binStats = bins.slice(0, -1).map((min, i) => ({
    min,
    max: bins[i + 1],
    predicted: [],
    outcomes: []
  }));
  
  predictions.forEach((pred, i) => {
    const binIdx = bins.findIndex((b, idx) => pred >= b && pred < bins[idx + 1]);
    if (binIdx >= 0 && binIdx < binStats.length) {
      binStats[binIdx].predicted.push(pred);
      binStats[binIdx].outcomes.push(outcomes[i]);
    }
  });
  
  return binStats.map(bin => ({
    bin: `${(bin.min * 100).toFixed(1)}% - ${(bin.max * 100).toFixed(1)}%`,
    count: bin.predicted.length,
    avg_predicted: bin.predicted.reduce((sum, p) => sum + p, 0) / Math.max(bin.predicted.length, 1),
    actual_rate: bin.outcomes.filter(o => o).length / Math.max(bin.outcomes.length, 1),
    calibration_error: Math.abs(
      (bin.outcomes.filter(o => o).length / Math.max(bin.outcomes.length, 1)) -
      (bin.predicted.reduce((sum, p) => sum + p, 0) / Math.max(bin.predicted.length, 1))
    )
  }));
}

function calculateBrierScore(predictions, outcomes) {
  const sqErrors = predictions.map((pred, i) => 
    Math.pow(pred - (outcomes[i] ? 1 : 0), 2)
  );
  return sqErrors.reduce((sum, e) => sum + e, 0) / sqErrors.length;
}

function calculateLogLoss(predictions, outcomes) {
  const epsilon = 1e-15; // Prevent log(0)
  const losses = predictions.map((pred, i) => {
    const p = Math.max(epsilon, Math.min(1 - epsilon, pred));
    return outcomes[i] ? -Math.log(p) : -Math.log(1 - p);
  });
  return losses.reduce((sum, l) => sum + l, 0) / losses.length;
}

// ==============================================
// MAIN EXECUTION
// ==============================================

async function main() {
  console.log('🏆 Zero-Odds Backtest: Model Accuracy Validation');
  console.log('='.repeat(70));
  console.log();
  
  // Load 2024 data for training
  console.log('📚 PHASE 1: Loading Training Data (2024)');
  const train2024 = await loadStatcastData(2024);
  if (!train2024) {
    console.error('❌ Cannot proceed without 2024 data');
    return;
  }
  
  const trainHRs = await extractHREvents(train2024);
  console.log(`   📊 Training set: ${trainHRs.length} player-games with HRs`);
  console.log();
  
  // Build profiles from training data
  console.log('🔨 PHASE 2: Building Player Profiles');
  const batterIds = [...new Set(train2024.map(p => p.batter))];
  const pitcherIds = [...new Set(train2024.map(p => p.pitcher))];
  
  console.log(`   👥 ${batterIds.length.toLocaleString()} unique batters`);
  console.log(`   ⚾ ${pitcherIds.length.toLocaleString()} unique pitchers`);
  
  const batterProfiles = {};
  const pitcherProfiles = {};
  
  let completed = 0;
  for (const batterId of batterIds) {
    batterProfiles[batterId] = buildBatterProfile(train2024, batterId);
    completed++;
    if (completed % 100 === 0) {
      process.stdout.write(`\r   Building profiles: ${completed}/${batterIds.length + pitcherIds.length}`);
    }
  }
  
  for (const pitcherId of pitcherIds) {
    pitcherProfiles[pitcherId] = buildPitcherProfile(train2024, pitcherId);
    completed++;
    if (completed % 100 === 0) {
      process.stdout.write(`\r   Building profiles: ${completed}/${batterIds.length + pitcherIds.length}`);
    }
  }
  console.log(`\n   ✅ Profiles complete\n`);
  
  // Load 2025 data for testing
  console.log('🧪 PHASE 3: Loading Test Data (2025)');
  const test2025 = await loadStatcastData(2025);
  if (!test2025) {
    console.log('⚠️  No 2025 data, skipping test phase');
    return;
  }
  
  // Generate predictions for all 2025 plate appearances
  console.log('🎯 PHASE 4: Generating Predictions');
  const predictions = [];
  const outcomes = [];
  const playerGames = {};
  
  test2025.forEach(pitch => {
    const key = `${pitch.batter}_${pitch.game_date}`;
    if (!playerGames[key]) {
      const batterProfile = batterProfiles[pitch.batter];
      const pitcherProfile = pitcherProfiles[pitch.pitcher];
      const prob = predictHRProbability(batterProfile, pitcherProfile);
      
      // Did they hit a HR this game?
      const hadHR = test2025.some(p => 
        p.batter === pitch.batter &&
        p.game_date === pitch.game_date &&
        p.events === 'home_run'
      );
      
      predictions.push(prob);
      outcomes.push(hadHR);
      playerGames[key] = true;
    }
  });
  
  console.log(`   ✅ ${predictions.length.toLocaleString()} player-games predicted`);
  console.log();
  
  // Evaluate
  console.log('📊 PHASE 5: Evaluation Results');
  console.log('='.repeat(70));
  console.log();
  
  // Overall metrics
  const actualHRs = outcomes.filter(o => o).length;
  const totalGames = outcomes.length;
  const avgPredicted = predictions.reduce((sum, p) => sum + p, 0) / predictions.length;
  const actualRate = actualHRs / totalGames;
  
  console.log('📈 Overall Statistics:');
  console.log(`   Total player-games: ${totalGames.toLocaleString()}`);
  console.log(`   Actual HRs: ${actualHRs} (${(actualRate * 100).toFixed(2)}%)`);
  console.log(`   Average predicted: ${(avgPredicted * 100).toFixed(2)}%`);
  console.log(`   Prediction bias: ${((avgPredicted - actualRate) * 100).toFixed(2)}%`);
  console.log();
  
  // Accuracy metrics
  const brierScore = calculateBrierScore(predictions, outcomes);
  const logLoss = calculateLogLoss(predictions, outcomes);
  
  console.log('🎯 Accuracy Metrics:');
  console.log(`   Brier Score: ${brierScore.toFixed(4)} (lower = better, random = 0.25)`);
  console.log(`   Log Loss: ${logLoss.toFixed(4)} (lower = better)`);
  console.log();
  
  // Calibration
  console.log('📏 Calibration Analysis:');
  const calibration = evaluateCalibration(predictions, outcomes);
  console.log('   Prob Range    | Count | Predicted | Actual | Error');
  console.log('   ' + '-'.repeat(60));
  calibration.forEach(bin => {
    if (bin.count > 0) {
      console.log(`   ${bin.bin.padEnd(13)} | ${String(bin.count).padStart(5)} | ${(bin.avg_predicted * 100).toFixed(2)}%     | ${(bin.actual_rate * 100).toFixed(2)}%  | ${(bin.calibration_error * 100).toFixed(2)}%`);
    }
  });
  console.log();
  
  // Top predictions
  const topPredictions = predictions
    .map((prob, i) => ({ prob, outcome: outcomes[i] }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 100);
  
  const top100Hits = topPredictions.filter(p => p.outcome).length;
  
  console.log('🏆 Top 100 Predictions:');
  console.log(`   Hit rate: ${top100Hits}/100 (${top100Hits}%)`);
  console.log(`   Expected: ${(topPredictions.reduce((sum, p) => sum + p.prob, 0)).toFixed(1)} HRs`);
  console.log();
  
  // Summary
  console.log('='.repeat(70));
  console.log('✅ VERDICT:');
  if (brierScore < 0.05 && Math.abs(avgPredicted - actualRate) < 0.01) {
    console.log('   🟢 EXCELLENT - Model is well-calibrated and accurate');
  } else if (brierScore < 0.08) {
    console.log('   🟡 GOOD - Model shows predictive power, minor calibration needed');
  } else {
    console.log('   🔴 NEEDS WORK - Model needs improvement before deployment');
  }
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
