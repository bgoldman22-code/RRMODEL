/**
 * Simple NBA Predictor - Uses Trained Linear Models
 * 
 * Loads the trained spread/total models and makes predictions
 * based on recent team performance (L10 box score stats)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load trained models (cached at module level)
let modelsCache = null;

export async function loadModels() {
  if (modelsCache) return modelsCache;
  
  try {
    const artifactsDir = path.join(__dirname, 'models', 'artifacts');
    
    const [spreadModelData, totalModelData] = await Promise.all([
      fs.readFile(path.join(artifactsDir, 'spread_model_simple.json'), 'utf8'),
      fs.readFile(path.join(artifactsDir, 'total_model_simple.json'), 'utf8')
    ]);
    
    modelsCache = {
      spread: JSON.parse(spreadModelData),
      total: JSON.parse(totalModelData)
    };
    
    console.log('[Predict] ✅ Models loaded successfully');
    return modelsCache;
  } catch (error) {
    console.error('[Predict] ❌ Error loading models:', error);
    throw new Error('Failed to load trained models');
  }
}

/**
 * Calculate L10 averages for a team from recent games
 */
export function calculateL10Stats(recentGames, teamId) {
  if (!recentGames || recentGames.length === 0) {
    // Return league averages as fallback
    return {
      fgPct: 0.465,
      fg3Pct: 0.365,
      ftPct: 0.780,
      rebounds: 43.5,
      assists: 25.2,
      turnovers: 13.8
    };
  }
  
  const stats = {
    fgPct: 0,
    fg3Pct: 0,
    ftPct: 0,
    rebounds: 0,
    assists: 0,
    turnovers: 0
  };
  
  let count = 0;
  
  // Take last 10 games
  for (const game of recentGames.slice(-10)) {
    const isHome = game.homeTeamId === teamId || game.homeTeam === teamId;
    const teamStats = isHome ? game.homeStats : game.awayStats;
    
    if (teamStats) {
      stats.fgPct += teamStats.fgPct || 0;
      stats.fg3Pct += teamStats.fg3Pct || 0;
      stats.ftPct += teamStats.ftPct || 0;
      stats.rebounds += teamStats.rebounds || 0;
      stats.assists += teamStats.assists || 0;
      stats.turnovers += teamStats.turnovers || 0;
      count++;
    }
  }
  
  // Average
  if (count > 0) {
    Object.keys(stats).forEach(key => {
      stats[key] /= count;
    });
  }
  
  return stats;
}

/**
 * Build feature vector for prediction
 */
export function buildFeatures(homeStats, awayStats) {
  return {
    home_l10_fgPct: homeStats.fgPct,
    home_l10_fg3Pct: homeStats.fg3Pct,
    home_l10_ftPct: homeStats.ftPct,
    home_l10_rebounds: homeStats.rebounds,
    home_l10_assists: homeStats.assists,
    home_l10_turnovers: homeStats.turnovers,
    
    away_l10_fgPct: awayStats.fgPct,
    away_l10_fg3Pct: awayStats.fg3Pct,
    away_l10_ftPct: awayStats.ftPct,
    away_l10_rebounds: awayStats.rebounds,
    away_l10_assists: awayStats.assists,
    away_l10_turnovers: awayStats.turnovers,
    
    fgPct_diff: homeStats.fgPct - awayStats.fgPct,
    fg3Pct_diff: homeStats.fg3Pct - awayStats.fg3Pct,
    rebounds_diff: homeStats.rebounds - awayStats.rebounds,
    assists_diff: homeStats.assists - awayStats.assists,
    turnovers_diff: homeStats.turnovers - awayStats.turnovers,
    
    home_court: 1
  };
}

/**
 * Make prediction with linear model
 */
export function predictLinear(model, features) {
  const { weights, bias, means, stds } = model;
  
  // Normalize features
  const normalized = {};
  Object.keys(weights).forEach(key => {
    const value = features[key] || 0;
    normalized[key] = (value - means[key]) / stds[key];
  });
  
  // Predict
  let prediction = bias;
  Object.keys(weights).forEach(key => {
    prediction += weights[key] * normalized[key];
  });
  
  return prediction;
}

/**
 * Calculate confidence based on feature quality and historical accuracy
 */
export function calculateConfidence(features, spread, total) {
  let confidence = 50; // Base confidence
  
  // Increase confidence for clear differentials
  const fgPctDiff = Math.abs(features.fgPct_diff);
  const reboundsDiff = Math.abs(features.rebounds_diff);
  const assistsDiff = Math.abs(features.assists_diff);
  
  if (fgPctDiff > 0.03) confidence += 10; // >3% FG% difference
  if (reboundsDiff > 3) confidence += 5; // >3 rebounds difference
  if (assistsDiff > 2) confidence += 5; // >2 assists difference
  
  // Decrease confidence for extreme predictions
  if (Math.abs(spread) > 15) confidence -= 10;
  if (total < 200 || total > 250) confidence -= 10;
  
  return Math.max(30, Math.min(90, confidence));
}

/**
 * Generate prediction for a single game
 */
export async function predictGame(homeTeamId, awayTeamId, homeRecentGames, awayRecentGames) {
  const models = await loadModels();
  
  // Calculate L10 stats
  const homeStats = calculateL10Stats(homeRecentGames, homeTeamId);
  const awayStats = calculateL10Stats(awayRecentGames, awayTeamId);
  
  // Build features
  const features = buildFeatures(homeStats, awayStats);
  
  // Make predictions
  const spreadPred = predictLinear(models.spread, features);
  const totalPred = predictLinear(models.total, features);
  
  // Calculate confidence
  const confidence = calculateConfidence(features, spreadPred, totalPred);
  
  // Calculate win probability from spread
  const winProb = 1 / (1 + Math.exp(-spreadPred / 10));
  
  return {
    spread: {
      prediction: parseFloat(spreadPred.toFixed(1)),
      favorite: spreadPred > 0 ? 'home' : 'away',
      line: parseFloat(Math.abs(spreadPred).toFixed(1))
    },
    total: {
      prediction: parseFloat(totalPred.toFixed(1)),
      over: totalPred > 220,
      under: totalPred < 220
    },
    winProbability: {
      home: parseFloat((winProb * 100).toFixed(1)),
      away: parseFloat(((1 - winProb) * 100).toFixed(1))
    },
    confidence: Math.round(confidence),
    features: {
      homeL10Stats: {
        fgPct: homeStats.fgPct.toFixed(3),
        rebounds: homeStats.rebounds.toFixed(1),
        assists: homeStats.assists.toFixed(1)
      },
      awayL10Stats: {
        fgPct: awayStats.fgPct.toFixed(3),
        rebounds: awayStats.rebounds.toFixed(1),
        assists: awayStats.assists.toFixed(1)
      },
      differentials: {
        fgPct: features.fgPct_diff.toFixed(3),
        rebounds: features.rebounds_diff.toFixed(1),
        assists: features.assists_diff.toFixed(1)
      }
    }
  };
}

/**
 * Batch predict multiple games
 */
export async function predictGames(games) {
  const models = await loadModels();
  const predictions = [];
  
  for (const game of games) {
    try {
      const prediction = await predictGame(
        game.homeTeamId,
        game.awayTeamId,
        game.homeRecentGames,
        game.awayRecentGames
      );
      
      predictions.push({
        gameId: game.gameId,
        ...prediction
      });
    } catch (error) {
      console.error(`[Predict] Error predicting game ${game.gameId}:`, error);
      predictions.push({
        gameId: game.gameId,
        error: error.message
      });
    }
  }
  
  return predictions;
}
