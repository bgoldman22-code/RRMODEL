#!/usr/bin/env node

/**
 * NBA ULTIMATE MODEL - Vegas Lines + Rest/Travel Integration
 * 
 * Combines:
 * 1. Advanced stats (Pace, OffRtg, DefRtg, etc.)
 * 2. Vegas line data (opening, closing, movement)
 * 3. Rest & travel factors (B2B, distance, timezone)
 * 
 * Target: <10 MAE for spreads
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateRestFactors, getRestDifferential } from '../netlify/functions/_lib/nba/rest-travel.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🚀  NBA ULTIMATE MODEL - Vegas + Rest/Travel               ║
║                                                               ║
║   Target: MAE <10 with contextual features                   ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Load data
console.log('📊 Loading data...');
const seasons = ['2022-23', '2023-24', '2024-25'];
const games = [];
const vegasLines = {};

for (const season of seasons) {
  // Load games
  const gamesFile = `games_${season.replace('-', '_')}_enhanced.json`;
  const gamesPath = path.join(__dirname, '..', 'data', 'nba', 'advanced', gamesFile);
  const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
  games.push(...gamesData);
  console.log(`  ${season}: ${gamesData.length} games`);
  
  // Load Vegas lines (if available)
  const oddsFile = `odds_${season.replace('-', '_')}.json`;
  const oddsPath = path.join(__dirname, '..', 'data', 'nba', 'odds', oddsFile);
  try {
    const oddsData = JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
    for (const odds of oddsData) {
      const key = `${odds.away_team}_${odds.home_team}_${odds.commence_time}`;
      vegasLines[key] = odds;
    }
    console.log(`    + ${oddsData.length} Vegas lines`);
  } catch (error) {
    console.log(`    ⚠️  No Vegas lines for ${season}`);
  }
}

console.log(`\n✅ Total: ${games.length} games, ${Object.keys(vegasLines).length} with Vegas data\n`);

/**
 * Build ultimate features with Vegas + Rest/Travel
 */
function buildUltimateFeatures(games, idx) {
  const game = games[idx];
  
  // Get team histories
  const homeGames = games.slice(0, idx).filter(g => 
    g.homeTeamId === game.homeTeamId || g.awayTeamId === game.homeTeamId
  );
  const awayGames = games.slice(0, idx).filter(g => 
    g.homeTeamId === game.awayTeamId || g.awayTeamId === game.awayTeamId
  );
  
  // Calculate advanced stats (L10)
  const calcStats = (teamGames, teamId) => {
    const recent = teamGames.slice(-10);
    if (recent.length === 0) {
      return { pace: 100, offRtg: 110, defRtg: 110, ppg: 110, winPct: 0.5 };
    }
    
    let pace = 0, offRtg = 0, defRtg = 0, ppg = 0, wins = 0;
    let count = 0;
    
    for (const g of recent) {
      const isHome = g.homeTeamId === teamId;
      const adv = isHome ? g.homeAdvanced : g.awayAdvanced;
      
      if (adv) {
        pace += adv.pace || 100;
        offRtg += adv.offRtg || 110;
        defRtg += adv.defRtg || 110;
        count++;
      }
      
      ppg += isHome ? g.homeScore : g.awayScore;
      if ((isHome && g.homeScore > g.awayScore) || (!isHome && g.awayScore > g.homeScore)) {
        wins++;
      }
    }
    
    if (count > 0) {
      pace /= count;
      offRtg /= count;
      defRtg /= count;
    }
    ppg /= recent.length;
    const winPct = wins / recent.length;
    const netRtg = offRtg - defRtg;
    
    return { pace, offRtg, defRtg, ppg, winPct, netRtg };
  };
  
  const home = calcStats(homeGames, game.homeTeamId);
  const away = calcStats(awayGames, game.awayTeamId);
  
  // Calculate rest/travel factors
  const homeRest = calculateRestFactors(games, game.homeTeamId, game.date);
  const awayRest = calculateRestFactors(games, game.awayTeamId, game.date);
  const restDiff = getRestDifferential(homeRest, awayRest);
  
  // Get Vegas lines (if available)
  // Note: We treat Vegas as OPTIONAL - model works without it
  // When available, Vegas captures ALL contextual factors (injuries, etc.)
  const vegasKey = `${game.awayTeam}_${game.homeTeam}_${game.date}`;
  const vegas = vegasLines[vegasKey];
  
  let vegasSpread = 0;
  let vegasTotal = 0;
  let lineMovement = 0;
  let totalMovement = 0;
  let hasVegas = false;
  
  if (vegas) {
    hasVegas = true;
    vegasSpread = vegas.consensus?.spread || 0;
    vegasTotal = vegas.consensus?.total || 0;
    
    if (vegas.opening && vegas.closing) {
      lineMovement = vegas.closing.spread - vegas.opening.spread;
      totalMovement = vegas.closing.total - vegas.opening.total;
    }
  }
  
  // Model vs Vegas differential (when available)
  // This captures what Vegas knows that we don't (injuries, etc.)
  const modelImpliedSpread = home.netRtg - away.netRtg + 3.5; // Rough spread estimate
  const modelVsVegas = hasVegas ? (modelImpliedSpread - vegasSpread) : 0;
  
  // Build feature vector (66 features!)
  return {
    // Advanced stats (12)
    h_pace: home.pace,
    h_offRtg: home.offRtg,
    h_defRtg: home.defRtg,
    h_netRtg: home.netRtg,
    h_ppg: home.ppg,
    h_winPct: home.winPct,
    
    a_pace: away.pace,
    a_offRtg: away.offRtg,
    a_defRtg: away.defRtg,
    a_netRtg: away.netRtg,
    a_ppg: away.ppg,
    a_winPct: away.winPct,
    
    // Matchup features (10)
    pace_diff: home.pace - away.pace,
    offRtg_diff: home.offRtg - away.offRtg,
    defRtg_diff: home.defRtg - away.defRtg,
    netRtg_diff: home.netRtg - away.netRtg,
    ppg_diff: home.ppg - away.ppg,
    winPct_diff: home.winPct - away.winPct,
    h_off_vs_a_def: home.offRtg - away.defRtg,
    a_off_vs_h_def: away.offRtg - home.defRtg,
    expected_pace: (home.pace + away.pace) / 2,
    home_adv: 3.5,
    
    // Rest/Travel features (15)
    h_days_rest: homeRest.daysRest,
    h_is_b2b: homeRest.isBackToBack ? 1 : 0,
    h_travel_dist: homeRest.travel.distance,
    h_timezone_change: homeRest.travel.timezoneChange,
    h_fatigue: homeRest.fatigueFactor,
    h_games_3d: homeRest.schedule.gamesLast3Days,
    h_games_7d: homeRest.schedule.gamesLast7Days,
    
    a_days_rest: awayRest.daysRest,
    a_is_b2b: awayRest.isBackToBack ? 1 : 0,
    a_travel_dist: awayRest.travel.distance,
    a_timezone_change: awayRest.travel.timezoneChange,
    a_fatigue: awayRest.fatigueFactor,
    a_games_3d: awayRest.schedule.gamesLast3Days,
    a_games_7d: awayRest.schedule.gamesLast7Days,
    
    fatigue_diff: restDiff.fatigueAdvantage,
    
    // Vegas features (9) - use 0 if not available
    // When missing, model learns from pure stats
    // When present, learns to calibrate against market
    vegas_spread: vegasSpread,
    vegas_total: vegasTotal,
    line_movement: lineMovement,
    total_movement: totalMovement,
    has_vegas: hasVegas ? 1 : 0,
    sharp_money: Math.abs(lineMovement) > 1 ? 1 : 0, // Steam move indicator
    total_steam: Math.abs(totalMovement) > 2 ? 1 : 0,
    vegas_home_implied: vegasSpread !== 0 ? -vegasSpread : 0,
    model_vs_vegas: modelVsVegas, // Key feature: difference = injury/context gap
    
    // Interaction features (20)
    netRtg_x_fatigue: home.netRtg * homeRest.fatigueFactor - away.netRtg * awayRest.fatigueFactor,
    pace_x_rest: (home.pace + away.pace) * (homeRest.daysRest + awayRest.daysRest) / 2,
    travel_x_b2b: (homeRest.travel.distance * (homeRest.isBackToBack ? 2 : 1)) - 
                  (awayRest.travel.distance * (awayRest.isBackToBack ? 2 : 1)),
    offense_quality: (home.offRtg + away.offRtg) / 2,
    defense_quality: (home.defRtg + away.defRtg) / 2,
    game_quality: (home.winPct + away.winPct) / 2,
    upset_potential: Math.abs(home.winPct - away.winPct),
    home_rested_adv: (homeRest.daysRest >= 2 ? 1 : 0) * home.netRtg / 10,
    away_tired_penalty: (awayRest.isBackToBack ? 1 : 0) * away.netRtg / 10,
    pace_fatigue_interaction: ((home.pace + away.pace) / 2) * Math.abs(restDiff.fatigueAdvantage),
    home_form: home.winPct * home.netRtg / 10,
    away_form: away.winPct * away.netRtg / 10,
    shooting_matchup: (home.offRtg / away.defRtg) - (away.offRtg / home.defRtg),
    tempo_advantage: home.pace > 105 && away.pace < 98 ? 1 : 0,
    grind_game: home.pace < 95 && away.pace < 95 ? 1 : 0,
    expected_possession_diff: Math.abs(home.pace - away.pace),
    rest_quality_interaction: restDiff.fatigueAdvantage * (home.netRtg - away.netRtg) / 10,
    travel_timezone_compound: (homeRest.travel.distance + awayRest.travel.distance) * 
                               (homeRest.travel.timezoneChange + awayRest.travel.timezoneChange),
    schedule_density_diff: homeRest.schedule.gamesLast7Days - awayRest.schedule.gamesLast7Days,
    fatigue_severity: Math.abs(homeRest.fatigueFactor) + Math.abs(awayRest.fatigueFactor)
  };
}

console.log('🔨 Building ultimate features...');

const X = [];
const y_spread = [];
const y_total = [];
let vegasCount = 0;

for (let i = 0; i < games.length; i++) {
  const game = games[i];
  
  const homeHistory = games.slice(0, i).filter(g => 
    g.homeTeamId === game.homeTeamId || g.awayTeamId === game.homeTeamId
  );
  const awayHistory = games.slice(0, i).filter(g => 
    g.homeTeamId === game.awayTeamId || g.awayTeamId === game.awayTeamId
  );
  
  if (homeHistory.length < 10 || awayHistory.length < 10) continue;
  
  const features = buildUltimateFeatures(games, i);
  
  X.push(features);
  y_spread.push(game.homeScore - game.awayScore);
  y_total.push(game.homeScore + game.awayScore);
  
  if (features.has_vegas) vegasCount++;
}

console.log(`✅ Built ${X.length} samples (${vegasCount} with Vegas data)`);
console.log(`   Features: ${Object.keys(X[0]).length}\n`);

// Normalize
const features = Object.keys(X[0]);
const means = {};
const stds = {};

features.forEach(feat => {
  const values = X.map(x => x[feat]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  
  means[feat] = mean;
  stds[feat] = Math.sqrt(variance) || 1;
});

const X_norm = X.map(x => {
  const norm = {};
  features.forEach(feat => {
    norm[feat] = (x[feat] - means[feat]) / stds[feat];
  });
  return norm;
});

// Split
const trainIdx = Math.floor(X.length * 0.7);
const valIdx = Math.floor(X.length * 0.85);

const X_train = X_norm.slice(0, trainIdx);
const y_train_spread = y_spread.slice(0, trainIdx);
const y_train_total = y_total.slice(0, trainIdx);

const X_val = X_norm.slice(trainIdx, valIdx);
const y_val_spread = y_spread.slice(trainIdx, valIdx);
const y_val_total = y_total.slice(trainIdx, valIdx);

const X_test = X_norm.slice(valIdx);
const y_test_spread = y_spread.slice(valIdx);
const y_test_total = y_total.slice(valIdx);

console.log(`📊 Split: Train=${X_train.length}, Val=${X_val.length}, Test=${X_test.length}\n`);

// Train with Ridge Regression (L2 regularization)
function trainRidgeRegression(X, y, alpha = 1.0, epochs = 1000, lr = 0.002) {
  const features = Object.keys(X[0]);
  const weights = {};
  features.forEach(feat => weights[feat] = 0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const predictions = X.map(x => 
      Object.keys(x).reduce((sum, feat) => sum + x[feat] * weights[feat], bias)
    );
    
    const errors = predictions.map((pred, i) => pred - y[i]);
    const mse = errors.reduce((sum, err) => sum + err * err, 0) / X.length;

    // Update weights with L2 regularization
    features.forEach(feat => {
      const gradient = errors.reduce((sum, err, i) => sum + err * X[i][feat], 0) / X.length;
      const l2_penalty = alpha * weights[feat];
      weights[feat] -= lr * (gradient + l2_penalty);
    });

    bias -= lr * errors.reduce((sum, err) => sum + err, 0) / X.length;

    if (epoch % 200 === 0) {
      const mae = errors.reduce((sum, err) => sum + Math.abs(err), 0) / X.length;
      console.log(`  Epoch ${epoch}: MSE=${mse.toFixed(2)}, MAE=${mae.toFixed(3)}`);
    }
  }

  return { weights, bias };
}

// Train Spread Model
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          SPREAD MODEL (Ridge with Vegas + Rest)             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const spreadModel = trainRidgeRegression(X_train, y_train_spread, 0.8, 1000, 0.002);

const spreadPreds = X_test.map(x => 
  Object.keys(x).reduce((sum, feat) => sum + x[feat] * spreadModel.weights[feat], spreadModel.bias)
);

const spreadMAE = spreadPreds.reduce((sum, pred, i) => 
  sum + Math.abs(pred - y_test_spread[i]), 0) / spreadPreds.length;

console.log(`\n📊 SPREAD TEST MAE: ${spreadMAE.toFixed(3)} points ${spreadMAE < 10 ? '🎯 UNDER 10!' : spreadMAE < 11 ? '✅ Under 11!' : ''}\n`);

// Train Total Model
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          TOTAL MODEL (Ridge with Vegas + Rest)              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const totalModel = trainRidgeRegression(X_train, y_train_total, 0.5, 1200, 0.005);

const totalPreds = X_test.map(x => 
  Object.keys(x).reduce((sum, feat) => sum + x[feat] * totalModel.weights[feat], totalModel.bias)
);

const totalMAE = totalPreds.reduce((sum, pred, i) => 
  sum + Math.abs(pred - y_test_total[i]), 0) / totalPreds.length;

console.log(`\n📊 TOTAL TEST MAE: ${totalMAE.toFixed(3)} points ${totalMAE < 13 ? '🎯 UNDER 13!' : ''}\n`);

// Save models
const modelsDir = path.join(__dirname, '..', 'netlify', 'functions', '_lib', 'nba', 'models', 'artifacts');
fs.mkdirSync(modelsDir, { recursive: true });

const spreadModelData = {
  weights: spreadModel.weights,
  bias: spreadModel.bias,
  means,
  stds,
  type: 'ridge_ultimate',
  features: features.length,
  performance: { mae: spreadMAE, testSamples: X_test.length }
};

const totalModelData = {
  weights: totalModel.weights,
  bias: totalModel.bias,
  means,
  stds,
  type: 'ridge_ultimate',
  features: features.length,
  performance: { mae: totalMAE, testSamples: X_test.length }
};

fs.writeFileSync(
  path.join(modelsDir, 'spread_model_ultimate.json'),
  JSON.stringify(spreadModelData, null, 2)
);

fs.writeFileSync(
  path.join(modelsDir, 'total_model_ultimate.json'),
  JSON.stringify(totalModelData, null, 2)
);

// Show top features
console.log('📊 TOP SPREAD PREDICTORS:');
const spreadFeatures = Object.entries(spreadModel.weights)
  .map(([feat, weight]) => ({ feat, weight: Math.abs(weight) }))
  .sort((a, b) => b.weight - a.weight)
  .slice(0, 15);

spreadFeatures.forEach(({ feat, weight }, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${feat.padEnd(30)} ${weight.toFixed(4)}`);
});

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ULTIMATE MODEL COMPLETE! 🚀                ║
╚═══════════════════════════════════════════════════════════════╝

  📊 FINAL RESULTS:
  
  Spread MAE: ${spreadMAE.toFixed(3)} points ${spreadMAE < 10 ? '🎯 UNDER 10 TARGET MET!' : spreadMAE < 11 ? '✅ Under 11!' : ''}
  Total MAE:  ${totalMAE.toFixed(3)} points ${totalMAE < 13 ? '🎯 UNDER 13 TARGET MET!' : ''}
  
  Improvement Timeline:
    Enhanced (36 features):        12.01 MAE
    Elite Ensemble (55 features):  11.61 MAE
    Ultimate (65 features):        ${spreadMAE.toFixed(2)} MAE
    
    Total improvement: ${((12.01 - spreadMAE) / 12.01 * 100).toFixed(1)}% better!
  
  💾 Models saved:
    - spread_model_ultimate.json (${features.length} features)
    - total_model_ultimate.json (${features.length} features)
  
  Features breakdown:
    - Advanced stats: 12
    - Matchup: 10
    - Rest/Travel: 15
    - Vegas lines: 9 (includes model vs Vegas gap)
    - Interactions: 20
    
  💡 Smart Approach:
    - Vegas lines are OPTIONAL (model works without them)
    - When present, Vegas = proxy for injuries + all context
    - model_vs_vegas feature = injury/motivation gap detector
    - No need for historical injury database!
`);
