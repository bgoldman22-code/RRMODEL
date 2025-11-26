// netlify/functions/nfl-predictions-generate/index.mjs
// v13 LOGIC + v8 WORKING ODDS: Enhanced EPA System with Sophisticated Fixes - DEPLOYED
// v4.1 PRODUCTION SAFEGUARDS: GPT-recommended safety rails integrated

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics, getCurrentWeek, getCurrentWeights, diagnoseMetricsData } from '../_lib/blobs-nfl.js';
import { calculateMatchups, calculateExpectedPlays, calculateMatchupScore } from '../_lib/matchups.js';
import { updateInjuryDurations, initializeInjuryDurationTracking } from '../_lib/injury-duration-tracker.js';
// Canonical Availability v5: Single source of truth for player availability
import { 
  buildCanonicalAvailability, 
  applyPositionCaps,
  applyReserveEntry,           // Gap A: IR as first-class source
  applyTeamGlobalCaps,          // Gap B: Team caps + interaction bumps
  SOURCE_PRIORITY               // For debugging
} from '../_lib/canonical-availability-v5.mjs';
// Kelly Hybrid Staking: Explicit staking system with exposure guards
import { recommendUnits, checkExposureLimits } from '../_lib/kelly-hybrid-staking.mjs';
// ENHANCED: Comprehensive EPA database (300+ players) + Return Boost System
import { getPlayerEPA, calculateQualityBackupMultiplier, REPLACEMENT_LEVEL_EPA } from '../_lib/comprehensive-player-epa.js';
import { getAllReturnBoosts, savePriorWeekSnapshot } from '../_lib/return-boost-system.js';
// Elite Injury System: Safeguards and sanity checks
import eliteInj from '../_lib/elite-injury-penalty-calculator.mjs';
const { checkMarketSanity } = eliteInj;
// IR + Baseline Integration: 32-team baseline contributors
import { BASELINE_CONTRIBUTORS_2025 } from '../_lib/baseline-contributors-2025.mjs';
// CSV Snapshot System: Lock picks at kickoff for honest CLV tracking
import { writePicksSnapshot } from '../_lib/csv-snapshot.mjs';

// BOOK ALLOWLIST: Centralized sportsbook filtering
import {
  canonicalBookName,
  isBookAllowed,
  filterToAllowedBooks,
  auditBooks,
  getDisplayBook,
  ALLOWED_BOOKS,
  PRIORITY_BOOK_ORDER
} from '../_lib/odds-constants.mjs';

// ========================================
// MODULE-LEVEL CACHES WITH TTL
// ========================================
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const moduleCache = {
  schedule: { data: null, loadedAt: null, promise: null },
  advancedMetrics: { data: null, loadedAt: null },
  injuries: { data: null, loadedAt: null },
  depthCharts: new Map() // Map<weekNumber, {data, loadedAt}>
};

/**
 * Check if cached data is still valid (within TTL)
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry || !cacheEntry.loadedAt) return false;
  return (Date.now() - cacheEntry.loadedAt) < CACHE_TTL_MS;
}

/**
 * Get schedule data from cache or load it (static import alternative)
 */
async function getScheduleFull() {
  // Return existing valid cache
  if (moduleCache.schedule.data && isCacheValid(moduleCache.schedule)) {
    console.log('📦 Using cached schedule');
    return moduleCache.schedule.data;
  }
  
  // If already loading, wait for that promise
  if (moduleCache.schedule.promise) {
    console.log('⏳ Waiting for in-flight schedule load');
    return moduleCache.schedule.promise;
  }
  
  // Load schedule
  console.log('🔄 Loading schedule from file');
  const loadPromise = (async () => {
    try {
      const scheduleModule = await import('../../../netlify/data/nfl/2025/schedule.full.json', {
        assert: { type: 'json' }
      });
      const data = scheduleModule.default;
      moduleCache.schedule.data = data;
      moduleCache.schedule.loadedAt = Date.now();
      moduleCache.schedule.promise = null;
      return data;
    } catch (error) {
      moduleCache.schedule.promise = null;
      throw error;
    }
  })();
  
  moduleCache.schedule.promise = loadPromise;
  return loadPromise;
}

/**
 * Load depth charts for multiple weeks at once (pre-loading optimization)
 */
async function loadDepthChartsForWeeks(weeks, season = 2025) {
  const results = new Map();
  console.log(`📊 Pre-loading depth charts for weeks: ${weeks.join(', ')}`);
  
  const { loadDepthChart } = await import('../_lib/depth-chart-change-detector.js');
  
  for (const week of weeks) {
    try {
      // Check cache first
      const cacheKey = `${season}_${week}`;
      const cached = moduleCache.depthCharts.get(cacheKey);
      
      if (cached && isCacheValid(cached)) {
        console.log(`  ✅ Week ${week}: Using cached depth chart`);
        results.set(week, cached.data);
        continue;
      }
      
      // Load from file
      const depthChart = loadDepthChart(week, season);
      if (depthChart) {
        // Cache it
        moduleCache.depthCharts.set(cacheKey, {
          data: depthChart,
          loadedAt: Date.now()
        });
        results.set(week, depthChart);
        console.log(`  ✅ Week ${week}: Loaded and cached depth chart`);
      } else {
        console.warn(`  ⚠️ Week ${week}: No depth chart available`);
        results.set(week, null);
      }
    } catch (error) {
      console.warn(`  ❌ Week ${week}: Failed to load depth chart:`, error.message);
      results.set(week, null);
    }
  }
  
  return results;
}

/**
 * Process games with concurrency limit to avoid overwhelming the function
 */
async function processGamesWithConcurrencyLimit(items, limit, processFn) {
  const results = [];
  const executing = [];
  
  for (const [index, item] of items.entries()) {
    const promise = (async () => {
      try {
        return await processFn(item, index);
      } catch (error) {
        console.error(`Error processing item ${index}:`, error);
        throw error;
      }
    })();
    
    results.push(promise);
    executing.push(promise);
    
    if (executing.length >= limit) {
      // Wait for at least one to complete before continuing
      await Promise.race(executing);
      // Remove completed promises from executing array
      const settled = executing.filter(p => {
        let done = false;
        p.then(() => { done = true; }).catch(() => { done = true; });
        return !done;
      });
      executing.length = 0;
      executing.push(...settled);
    }
  }
  
  return Promise.all(results);
}

// LINE MOVEMENT: Gates and sizing modifiers
import { applyPreBetGates, applyLineMovementSizingModifiers } from '../_lib/sizing-gates.mjs';

// v4.1 PRODUCTION SAFEGUARDS: Import new safety systems
import { 
  loadCalibrationMapping, 
  applyCalibratedProbability, 
  applyMarketAnchoring, 
  applyProductionSafetyLimits,
  PRODUCTION_LIMITS 
} from '../_lib/calibration-v4.mjs';

import { 
  applyDepthChartSafeguards, 
  validateDepthChartConsistency,
  DEPTH_SAFEGUARDS 
} from '../_lib/depth-chart-safeguards-v4.mjs';

import { 
  filterSituationalEPA, 
  calculateSituationalBaseline,
  detectDataQualityIssues,
  SITUATIONAL_THRESHOLDS 
} from '../_lib/situational-epa-filters-v4.mjs';

// ========================================
// DEPTH CHART & INJURY PROCESSING UTILITIES
// ========================================

/**
 * Position-specific usage thresholds for starter detection
 * Standardized to use TEAM SHARE (not position share within WR room, etc.)
 * 
 * Usage field meanings:
 * - RB: Snap share (team offensive snaps) - 50%+ = workhorse/RB1
 * - WR: Team target share (% of team's total targets) - 22%+ = WR1/WR2
 * - TE: Team target share (% of team's total targets) - 15%+ = TE1
 */
const USAGE_THRESHOLDS = {
  RB: { type: 'snapShare', min: 0.50 },      // 50%+ snap share = RB1/workhorse
  WR: { type: 'teamTargetShare', min: 0.22 }, // 22%+ team target share = WR1/WR2
  TE: { type: 'teamTargetShare', min: 0.15 }  // 15%+ team target share = TE1
};

/**
 * Check if player qualifies as high-usage starter based on EPA database
 * @param {Object} playerData - From comprehensive-player-epa.js
 * @param {string} pos - Position (RB, WR, TE)
 * @returns {boolean} True if player meets usage threshold for position
 */
function isHighUsageStarter(playerData, pos) {
  if (!playerData) return false;
  
  const threshold = USAGE_THRESHOLDS[pos] || { type: 'snapShare', min: 0.50 };
  
  // Get the correct usage field based on position type
  const usageValue = threshold.type === 'teamTargetShare' 
    ? (playerData.teamTargetShare ?? playerData.usage)
    : (playerData.snapShare ?? playerData.usage);
  
  return (usageValue ?? 0) >= threshold.min;
}

/**
 * Convert injury status to probability of playing (graded, not binary)
 * Position-specific because QB is binary position, skill positions have snap counts
 * @param {string} pos - Position (QB, RB, WR, TE)
 * @param {string} status - Injury status (out, doubtful, questionable, active)
 * @returns {number} Probability of playing (0.0 to 0.95)
 */
function statusToProbPlay(pos, status) {
  const s = (status || '').toLowerCase();
  
  if (s === 'out' || s === 'o') return 0.0;
  
  if (s === 'doubtful' || s === 'd') {
    // QB is binary (either plays full or doesn't play)
    // Skill positions can play limited snaps
    return pos === 'QB' ? 0.10 : 0.20;
  }
  
  if (s === 'questionable' || s === 'q') {
    return pos === 'QB' ? 0.60 : 0.70;
  }
  
  // Active but recently injured
  return 0.95;
}

/**
 * Expected snap count scale for limited returns
 * Used to scale EPA calculations when player is active but on pitch count
 * @param {string} pos - Position
 * @param {string} status - Injury status
 * @returns {number} Snap scale multiplier (0.5 to 1.0)
 */
function expectedSnapScale(pos, status) {
  const s = (status || '').toLowerCase();
  
  if (s === 'questionable' || s === 'q') {
    // QB plays full or doesn't play (binary position)
    // Skill positions often limited to ~70% snaps
    return pos === 'QB' ? 1.0 : 0.7;
  }
  
  if (s === 'doubtful' || s === 'd') {
    return pos === 'QB' ? 1.0 : 0.5;
  }
  
  return 1.0; // Full snaps
}

/**
 * Build filtered depth chart excluding injured players
 * Automatically recomposes roles: if WR1+WR2 out, WR3 becomes new WR1
 * @param {string} teamCode - Team abbreviation
 * @param {string} pos - Position
 * @param {Object} depthChart - Weekly depth chart
 * @param {Array} injuryList - Injury report for this position
 * @returns {Array} Filtered depth list where [0]=new starter after injuries
 */
function filteredDepthList(teamCode, pos, depthChart, injuryList) {
  // Build set of injured players (probPlay < 0.5)
  const injured = new Set();
  for (const injury of (injuryList || [])) {
    const status = injury.status || injury.injury_status;
    const probPlay = statusToProbPlay(pos, status);
    
    if (probPlay < 0.5) {
      injured.add(injury.name);
    }
  }
  
  // Filter depth chart to exclude injured
  const fullDepth = depthChart?.[teamCode]?.[pos] || [];
  const filtered = fullDepth.filter(player => player && !injured.has(player));
  
  // Filtered list automatically recomposes roles:
  // If WR depth = [Jefferson, Addison, Nailor] and Jefferson out:
  // Filtered = [Addison, Nailor] where Addison is now WR1 (index 0)
  
  return filtered;
}

/**
 * Pick replacement player from filtered depth list
 * @param {string} teamCode - Team
 * @param {string} pos - Position
 * @param {string} injuredName - Player who is injured
 * @param {Object} depthChart - Weekly depth chart
 * @param {Array} injuryList - Injury report
 * @returns {string|null} Replacement player name or null if none available
 */
function pickReplacement(teamCode, pos, injuredName, depthChart, injuryList) {
  const filtered = filteredDepthList(teamCode, pos, depthChart, injuryList);
  
  // First healthy non-injured candidate
  return filtered.find(player => player !== injuredName) || null;
}

// v4.1 PRODUCTION SAFEGUARDS: Helper function for EPA filtering
function applySituationalEPAFilters(homeMetrics, awayMetrics, game) {
  const results = { home: null, away: null };
  
  if (homeMetrics?.epa_data) {
    const homeFiltered = filterSituationalEPA(homeMetrics.epa_data);
    results.home = {
      filteredData: homeFiltered.filteredData,
      filterStats: homeFiltered.filterStats,
      dataQualityIssues: detectDataQualityIssues(homeMetrics.epa_data)
    };
    console.log(`📈 Home EPA filtering: ${homeFiltered.filterStats.filterRate.toFixed(1)}% filtered`);
  }
  
  if (awayMetrics?.epa_data) {
    const awayFiltered = filterSituationalEPA(awayMetrics.epa_data);
    results.away = {
      filteredData: awayFiltered.filteredData,
      filterStats: awayFiltered.filterStats,
      dataQualityIssues: detectDataQualityIssues(awayMetrics.epa_data)
    };
    console.log(`📈 Away EPA filtering: ${awayFiltered.filterStats.filterRate.toFixed(1)}% filtered`);
  }
  
  return results;
}

// PHASE 1: Enhanced EPA Features - Simplified Calibration Fix
function applyCalibrationFix(confidencePercentage, recentResults = []) {
  // Convert percentage to probability foWr internal calculations
  const rawProb = confidencePercentage / 100.0;
  
  // Platt scaling on last 8 weeks only (if sufficient data available)
  if (recentResults.length >= 20) {
    const calibratedProb = plattCalibration(rawProb, recentResults.slice(-20));
    return Math.round(calibratedProb * 100);
  }
  
  // Light conservative adjustment for very high confidence (>80%) only
  if (confidencePercentage > 80) {
    const conservativeAdjustment = (confidencePercentage - 80) * 0.05;
    return Math.round(Math.max(40, Math.min(95, confidencePercentage - conservativeAdjustment)));
  }
  
  // Return raw confidence with reasonable bounds (preserve signal separation)
  return Math.round(Math.max(25, Math.min(95, confidencePercentage)));
}

// Platt calibration helper for probability recalibration
function plattCalibration(probability, historicalResults) {
  // Simplified Platt scaling - compares predicted vs actual outcomes
  if (!historicalResults || historicalResults.length < 10) return probability;
  
  const avgActual = historicalResults.reduce((sum, r) => sum + (r.correct ? 1 : 0), 0) / historicalResults.length;
  const avgPredicted = historicalResults.reduce((sum, r) => sum + r.confidence, 0) / historicalResults.length;
  
  // If there's systematic bias, apply calibration factor
  if (avgPredicted > 0.5 && Math.abs(avgPredicted - avgActual) > 0.03) {
    const calibrationFactor = avgActual / avgPredicted;
    const calibrated = probability * calibrationFactor;
    return Math.max(0.25, Math.min(0.95, calibrated)); // Looser bounds to preserve signal
  }
  
  return probability;
}

// PHASE 2: Enhanced EPA Features - No-Bet Logic  
function shouldSkipBet(prediction, gameContext = {}, marketOdds = null) {
  if (!marketOdds || !prediction) return { skip: false, reason: null };
  
  // Use proper true edge calculation with vig removal
  const modelProb = prediction.homeWinProb || (prediction > 0.5 ? prediction : 1 - prediction);
  const trueEdgeData = calculateTrueEdge(modelProb, marketOdds);
  const trueEdge = trueEdgeData.edge;
  
  // Enhanced no-bet conditions based on proper edge calculation
  if (trueEdge < 0.02) { // Minimum 2% true edge (vig-removed)
    return { skip: true, reason: "edge<2%" };
  }
  
  if (gameContext.marginTooClose && trueEdge < 0.03) {
    return { skip: true, reason: "margin<3pts+lowedge" };
  }
  
  if (gameContext.highVariance && trueEdge < 0.035) {
    return { skip: true, reason: "high_variance+lowedge" };
  }
  
  return { skip: false, reason: null, trueEdgeData: trueEdgeData };
}

// Moneyline bet skip logic 
function shouldSkipMoneylineBet(mlPick, gameContext = {}, marketOdds = null, confidence = null, edge = null, winProbability = null, opponentQBEPA = null) {
  // NEW RULE: Require confidence ≥ 65% and implied edge ≥ 5%
  if (confidence !== null && confidence < 65) {
    return { skip: true, reason: `confidence_${confidence.toFixed(1)}%<65%` };
  }
  
  if (marketOdds !== null && winProbability !== null) {
    const american = marketOdds;
    const breakeven = american > 0 
      ? 1 / (1 + american / 100)  
      : Math.abs(american) / (Math.abs(american) + 100);
    
    // EV check: model probability vs breakeven
    const modelP = winProbability / 100;
    const evPercent = modelP - breakeven;
    
    // NEW RULE: Require minimum 5% implied edge
    if (evPercent < 0.05) {
      return { skip: true, reason: `edge_${(evPercent * 100).toFixed(1)}%<5%` };
    }
    
    // NEW RULE: Heavy favorites (worse than -300) need extra criteria
    if (american <= -300) {
      // Need either 6%+ edge OR opponent QB EPA ≤ league avg
      const leagueAvgQBEPA = 0.0; // Approximate league average EPA per play
      const hasExtraEdge = evPercent >= 0.06;
      const hasPoorOpponentQB = opponentQBEPA !== null && opponentQBEPA <= leagueAvgQBEPA;
      
      if (!hasExtraEdge && !hasPoorOpponentQB) {
        return { skip: true, reason: `heavy_fav_${american}_needs_edge≥6%_or_poor_opp_QB` };
      }
    }
    
    return { skip: false, reason: `conf_${confidence.toFixed(0)}%_edge_${(evPercent * 100).toFixed(1)}%` };
  }
  
  // Skip extreme dogs unless edge ≥ 5%
  if (winProbability !== null && winProbability < 35 && (edge === null || Math.abs(edge) < 5.0)) {
    return { skip: true, reason: `extreme_dog_${winProbability}%_insufficient_edge` };
  }
  
  // Fallback: legacy edge gate for missing odds
  if (edge !== null && Math.abs(edge) >= 2.0) {
    return { skip: false, reason: `edge_${Math.abs(edge).toFixed(1)}%` };
  }
  
  // Default block
  const reason = `no_valid_ev_check_conf_${winProbability}%`;
  return { skip: true, reason: reason };
}

// Total bet skip logic 
function shouldSkipTotalBet(totalPick, totalDiff, gameContext = {}, marketOdds = null, confidence = null, edge = null) {
  // PRIMARY RULE: Bet if model total vs line differs by ≥ 3 points
  const pointDiff = Math.abs(totalDiff);
  
  if (pointDiff < 3.0) {
    return { skip: true, reason: `total_diff_${pointDiff.toFixed(1)}pts<3.0pts` };
  }
  
  // Scale confidence by point differential:
  // 3-4 pts → 56-59%, 4-6 pts → 60-63%, 6+ pts → 64%+
  let scaledConfidence;
  if (pointDiff >= 6.0) {
    scaledConfidence = Math.min(64 + (pointDiff - 6.0) * 2, 72);
  } else if (pointDiff >= 4.0) {
    scaledConfidence = 60 + ((pointDiff - 4.0) / 2.0) * 3; // 60-63%
  } else {
    scaledConfidence = 56 + ((pointDiff - 3.0) / 1.0) * 3; // 56-59%
  }
  
  return { skip: false, reason: `total_diff_${pointDiff.toFixed(1)}pts_conf_${Math.round(scaledConfidence)}%` };
}

// Push detection logic for spread bets
function shouldSkipSpreadBet(spreadPick, marginDiff, gameContext = {}, marketOdds = null, confidence = null, edge = null, spreadLine = null) {
  // Push predictions should always be no-bet
  if (spreadPick === 'push' || Math.abs(marginDiff) < 0.5) {
    return { skip: true, reason: "push_prediction" };
  }
  
  const pointDiff = Math.abs(marginDiff);
  const absSpread = Math.abs(spreadLine || 0);
  
  // NEW RULE: Small spreads need more edge
  // If spread < 3 points, require at least 3 points of edge
  if (absSpread < 3 && pointDiff < 3) {
    return { skip: true, reason: `small_spread_${absSpread.toFixed(1)}_needs_edge≥3.0pts_got_${pointDiff.toFixed(1)}pts` };
  }
  
  // PRIMARY RULE: Bet if model margin vs line differs by ≥ 2.5 points
  if (pointDiff < 2.5) {
    return { skip: true, reason: `margin_diff_${pointDiff.toFixed(1)}pts<2.5pts` };
  }
  
  // Scale confidence by point differential:
  // 2.5-4.0 pts → 58-61%, 4.0-6.0 pts → 62-65%, 6.0+ pts → 66%+
  let scaledConfidence;
  if (pointDiff >= 6.0) {
    scaledConfidence = Math.min(66 + (pointDiff - 6.0) * 2, 75);
  } else if (pointDiff >= 4.0) {
    scaledConfidence = 62 + ((pointDiff - 4.0) / 2.0) * 3; // 62-65%
  } else {
    scaledConfidence = 58 + ((pointDiff - 2.5) / 1.5) * 3; // 58-61%
  }
  
  return { skip: false, reason: `spread_diff_${pointDiff.toFixed(1)}pts_conf_${Math.round(scaledConfidence)}%` };
}

// PHASE 3: Enhanced EPA Features - Public Bias Detection
function detectPublicBias(teamCode, marketLine, modelLine) {
  // Popular teams that often get inflated lines
  const publicTeams = ['DAL', 'GB', 'PIT', 'NE', 'KC', 'SF'];
  
  if (publicTeams.includes(teamCode)) {
    const lineInflation = Math.abs(marketLine || 0) - Math.abs(modelLine || 0);
    if (lineInflation > 1.5) {
      return 0.95; // Reduce confidence by 5% for public team bias
    }
  }
  
  return 1.0; // No adjustment needed
}

// PHASE 4: Enhanced EPA Features - Variance Modeling
function calculateEnhancedVariance(homeTeam, awayTeam) {
  // Sophisticated variance modeling for proper tail calibration
  // Base margin variance in points (not probability)
  const baseVariance = 6.0; // Conservative NFL baseline
  
  // 1. Explosive play differential creates fat tails (more 10+ and 17+ results)
  const homeExplosive = homeTeam?.situational?.explosive_rate || homeTeam?.explosive_diff || 0.15;
  const awayExplosive = awayTeam?.situational?.explosive_rate || awayTeam?.explosive_diff || 0.15;
  const explosiveDiff = Math.abs(homeExplosive - awayExplosive);
  const explosiveVariance = 8.0 * Math.min(explosiveDiff, 1.0); // Cap at reasonable level
  
  // 2. Pressure differential widens outcome distribution  
  const homePressure = homeTeam?.pressure?.pressure_diff || 0;
  const awayPressure = awayTeam?.pressure?.pressure_diff || 0;
  const pressureDiff = Math.abs(homePressure - awayPressure) / 10.0; // Normalize
  const pressureVariance = 4.0 * Math.min(pressureDiff, 1.0);
  
  // 3. QB uncertainty increases variance (backup/limited status)
  // TODO: Add QB status detection from injury reports
  const qbUncertainty = 0; // Placeholder - would come from injury data
  
  // 4. Heavy run games have lower variance (more predictable outcomes)
  const homeRunRate = homeTeam?.run_rate || 0.4;
  const awayRunRate = awayTeam?.run_rate || 0.4;
  const avgRunRate = (homeRunRate + awayRunRate) / 2;
  const runReduction = Math.max(0, (avgRunRate - 0.35) * 2.0);
  
  // 5. High turnover volatility increases variance
  const homeTurnover = homeTeam?.turnovers?.turnover_diff || 0;
  const awayTurnover = awayTeam?.turnovers?.turnover_diff || 0;
  const toVolatility = Math.abs(homeTurnover - awayTurnover);
  const turnoverVariance = toVolatility * 0.5;
  
  // Total variance (points-based, not probability)
  const totalVariance = Math.max(
    4.0, // Minimum variance floor
    baseVariance + explosiveVariance + pressureVariance + qbUncertainty + turnoverVariance - runReduction
  );
  
  return {
    total: totalVariance,
    breakdown: {
      base: baseVariance,
      explosive: explosiveVariance,
      pressure: pressureVariance,
      qb: qbUncertainty,
      turnover: turnoverVariance,
      runReduction: runReduction
    },
    // Key insight: Use this variance for P(cover) and tail probabilities, not to add noise to point estimate
    isHighVariance: totalVariance > 10.0
  };
}

// v13 LOGIC: Fixed weights and multipliers
const BASE_WEIGHTS = {
  pressure_diff: 0.22, explosive_diff: 0.20, turnover_diff: 0.12, eds: 0.08,
  rz_td: 0.15, third_down: 0.10, penalty_diff: 0.05, fourth_down_agg: 0.06, top_eff: 0.02
};

const ADVANCED_WEIGHTS = {
  form: 0.12, consistency: 0.02, tempo: 0.02, formations: 0.02, script_adaptation: 0.01,
  current_season_momentum: 0.03
};

const SPECIAL_TEAMS_WEIGHTS = {
  field_goal_net: 0.025, punt_net: 0.015, return_advantage: 0.008, coverage_efficiency: 0.002
};

// v13 LOGIC: Reduced aggressive multipliers
const SCORING_MULTIPLIERS = {
  CORE_EPA: 24,        // v13: Reduced from 30
  TIER_BASE: 8,        // v13: Reduced from 10  
  ADVANCED_BASE: 6,    // v13: Kept same
  MATCHUP_BASE: 3.2,
  SPECIAL_TEAMS_BASE: 3
};

const ROSTER_CONTINUITY_FACTORS = {
  qb_change: 0.3, coach_change: 0.2, coordinator_change: 0.15, major_trades: 0.1, draft_impact: 0.05
};

// v8 WORKING ODDS: Team name mapping that works
const TEAM_NAME_MAPPING = {
  'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens',
  'BUF': 'Buffalo Bills', 'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
  'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns', 'DAL': 'Dallas Cowboys',
  'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
  'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars',
  'KC': 'Kansas City Chiefs', 'LV': 'Las Vegas Raiders', 'LAC': 'Los Angeles Chargers',
  'LAR': 'Los Angeles Rams', 'MIA': 'Miami Dolphins', 'MIN': 'Minnesota Vikings',
  'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
  'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers',
  'SF': 'San Francisco 49ers', 'SEA': 'Seattle Seahawks', 'TB': 'Tampa Bay Buccaneers',
  'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders'
};

// Helper to get team abbreviation from full name (for schedule parsing)
function getTeamAbbreviation(fullName) {
  if (!fullName) return '';
  
  // If it's already an abbreviation, return it
  if (Object.keys(TEAM_NAME_MAPPING).includes(fullName)) return fullName;
  
  // Find abbreviation by full name
  for (const [abbr, name] of Object.entries(TEAM_NAME_MAPPING)) {
    if (name === fullName) return abbr;
  }
  
  // Fallback for common variations
  const nameMap = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
    // Handle LA abbreviation issues
    "LA": "LAR", "LAR": "LAR", "LAC": "LAC"
  };
  
  return nameMap[fullName] || fullName;
}

const DIVISIONAL_CONTEXT = {
  'AFC_EAST': ['BUF', 'MIA', 'NE', 'NYJ'], 'AFC_NORTH': ['BAL', 'CIN', 'CLE', 'PIT'], 
  'AFC_SOUTH': ['HOU', 'IND', 'JAX', 'TEN'], 'AFC_WEST': ['DEN', 'KC', 'LV', 'LAC'],
  'NFC_EAST': ['DAL', 'NYG', 'PHI', 'WAS'], 'NFC_NORTH': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC_SOUTH': ['ATL', 'CAR', 'NO', 'TB'], 'NFC_WEST': ['ARI', 'LAR', 'SF', 'SEA']
};

function getDivision(teamCode) {
  for (const [division, teams] of Object.entries(DIVISIONAL_CONTEXT)) {
    if (teams.includes(teamCode)) return division;
  }
  return null;
}

function isDivisionalGame(homeTeam, awayTeam) {
  const homeDivision = getDivision(homeTeam);
  const awayDivision = getDivision(awayTeam);
  return homeDivision === awayDivision;
}

// v13 LOGIC: Utility functions with NaN protection
function z(val, mean = 0, std = 1) { 
  if (isNaN(val) || isNaN(mean) || isNaN(std) || std <= 0) return 0;
  return (val - mean) / std; 
}

// v13 LOGIC: Clip z-scores to prevent extreme outliers
function clippedZ(val, mean = 0, std = 1) {
  const rawZ = z(val, mean, std);
  return Math.max(-2.5, Math.min(2.5, rawZ)); // Clip to ±2.5
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function americanToImplied(american) {
  const odds = Number(american);
  if (!odds || isNaN(odds)) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

// Calculate true edge with proper vig removal - critical missing piece
function calculateTrueEdge(modelProb, marketOdds) {
  if (!marketOdds || !marketOdds.ml_home || !marketOdds.ml_away) {
    return { edge: 0, hasMinimumEdge: false, vigFreeProb: 0.5 };
  }
  
  // Convert American odds to implied probabilities
  const homeImplied = americanToImplied(marketOdds.ml_home);
  const awayImplied = americanToImplied(marketOdds.ml_away);
  
  if (!homeImplied || !awayImplied) {
    return { edge: 0, hasMinimumEdge: false, vigFreeProb: 0.5 };
  }
  
  // Remove vig (overround) - this is the key fix
  const totalImplied = homeImplied + awayImplied;
  const vigFreeHome = homeImplied / totalImplied;  // True vig-removed market probability
  const vigFreeAway = awayImplied / totalImplied;
  
  // True edge = |calibrated_model_prob - vig_free_market_prob|
  const trueEdge = Math.abs(modelProb - vigFreeHome);
  
  return {
    edge: trueEdge,
    hasMinimumEdge: trueEdge >= 0.02, // 2% minimum edge threshold
    vigFreeProb: vigFreeHome,
    vigFreeAwayProb: vigFreeAway,
    vigAmount: totalImplied - 1.0, // How much vig was removed
    marketImplied: { home: homeImplied, away: awayImplied }
  };
}

// v13 LOGIC: Deterministic special teams generation (no Math.random)
function generateSpecialTeamsFromBasics(teamCode, teamMetrics, league) {
  const offEPA = teamMetrics?.core?.off_epa || 0;
  const defEPA = teamMetrics?.core?.def_epa || 0;
  const teamQuality = (offEPA - defEPA) / 2;
  const stQualityFactor = teamQuality * 0.4;
  
  // v13 LOGIC: Deterministic variation based on team code hash instead of Math.random()
  const teamHash = teamCode.split('').reduce((hash, char) => hash + char.charCodeAt(0), 0);
  const deterministicVariation = ((teamHash % 100) / 100 - 0.5) * 0.1; // -0.05 to +0.05
  
  const finalSTFactor = stQualityFactor + deterministicVariation;
  
  return {
    fg_accuracy_combined: clamp(0.84 + finalSTFactor, 0.70, 0.95),
    fg_attempts_per_game: clamp(2.1 + (teamQuality * 0.3), 1.5, 3.2),
    punt_net_average: clamp(42.0 + (finalSTFactor * 4), 36.0, 48.0),
    punt_coverage_efficiency: clamp(0.80 + finalSTFactor, 0.65, 0.92),
    kick_return_average: clamp(22.0 + (finalSTFactor * 2), 18.0, 26.0),
    punt_return_average: clamp(8.5 + (finalSTFactor * 1.5), 6.0, 12.0),
    kick_coverage_efficiency: clamp(0.80 + finalSTFactor, 0.65, 0.92),
    _estimated: true
  };
}

function calculateSpecialTeamsMetrics(teamMetrics, opponentMetrics, league) {
  const teamST = teamMetrics?.special_teams || {};
  const oppST = opponentMetrics?.special_teams || {};
  const leagueST = league?.special_teams || {};
  
  const fgAccuracy = teamST.fg_accuracy_combined ?? leagueST.avg_fg_accuracy ?? 0.84;
  const fgAttempts = teamST.fg_attempts_per_game ?? leagueST.avg_fg_attempts ?? 2.1;
  const oppFGDefense = oppST.fg_defense_rating ?? leagueST.avg_fg_defense ?? 0.84;
  const fgNetValue = (fgAccuracy - oppFGDefense) * fgAttempts * 3;
  
  const puntNetAvg = teamST.punt_net_average ?? leagueST.avg_punt_net ?? 42.0;
  const puntCoverage = teamST.punt_coverage_efficiency ?? leagueST.avg_coverage ?? 0.80;
  const puntFieldPosition = (puntNetAvg - 42.0) / 20;
  const puntCoverageValue = (puntCoverage - 0.80) * 5;
  const puntNetValue = puntFieldPosition + puntCoverageValue;
  
  const kickReturnAvg = teamST.kick_return_average ?? leagueST.avg_kick_return ?? 22.0;
  const puntReturnAvg = teamST.punt_return_average ?? leagueST.avg_punt_return ?? 8.5;
  const oppKickCoverage = oppST.kick_coverage_efficiency ?? leagueST.avg_kick_coverage ?? 0.80;
  const oppPuntCoverageEff = oppST.punt_coverage_efficiency ?? leagueST.avg_punt_coverage ?? 0.80;
  
  const kickReturnAdv = (kickReturnAvg - 22.0) * (1 - oppKickCoverage) * 0.1;
  const puntReturnAdv = (puntReturnAvg - 8.5) * (1 - oppPuntCoverageEff) * 0.15;
  const returnNetValue = kickReturnAdv + puntReturnAdv;
  
  const teamKickCoverage = teamST.kick_coverage_efficiency ?? leagueST.avg_kick_coverage ?? 0.80;
  const teamPuntCoverageEff = teamST.punt_coverage_efficiency ?? leagueST.avg_punt_coverage ?? 0.80;
  const oppKickReturn = oppST.kick_return_average ?? leagueST.avg_kick_return ?? 22.0;
  const oppPuntReturn = oppST.punt_return_average ?? leagueST.avg_punt_return ?? 8.5;
  
  const kickCoverageAdv = (teamKickCoverage - 0.80) * oppKickReturn * 0.05;
  const puntCoverageAdv = (teamPuntCoverageEff - 0.80) * oppPuntReturn * 0.08;
  const coverageNetValue = kickCoverageAdv + puntCoverageAdv;
  
  const totalSTValue = fgNetValue + puntNetValue + returnNetValue + coverageNetValue;
  const weatherFactor = teamMetrics?.game_conditions?.is_dome ? 1.0 : 0.95;
  const weatherAdjustedST = totalSTValue * weatherFactor;
  
  return {
    field_goal_net: fgNetValue, punt_net: puntNetValue, return_advantage: returnNetValue,
    coverage_efficiency: coverageNetValue, total_st_value: weatherAdjustedST, weather_factor: weatherFactor,
    components: {
      fg_accuracy: fgAccuracy, fg_attempts: fgAttempts, punt_net_avg: puntNetAvg,
      kick_return_avg: kickReturnAvg, punt_return_avg: puntReturnAvg,
      kick_coverage: teamKickCoverage, punt_coverage: teamPuntCoverageEff
    }
  };
}

function calculateRosterContinuity(teamMetrics, teamCode) {
  const rosterData = teamMetrics?.roster_continuity || {};
  let continuityScore = 1.0;
  
  if (rosterData.qb_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.qb_change;
  if (rosterData.coach_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.coach_change;
  if (rosterData.coordinator_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.coordinator_change;
  if (rosterData.major_trades) continuityScore -= ROSTER_CONTINUITY_FACTORS.major_trades * rosterData.major_trades;
  if (rosterData.draft_impact) continuityScore -= ROSTER_CONTINUITY_FACTORS.draft_impact;
  
  return clamp(continuityScore, 0.3, 1.0);
}

function calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics) {
  let baseCurrentWeight;
  if (currentWeek <= 3) baseCurrentWeight = 0.80;
  else if (currentWeek <= 6) baseCurrentWeight = 0.85;
  else if (currentWeek <= 12) baseCurrentWeight = 0.88;
  else baseCurrentWeight = 0.90;
  
  const homeContinuity = calculateRosterContinuity(homeMetrics, 'HOME');
  const awayContinuity = calculateRosterContinuity(awayMetrics, 'AWAY');
  const avgContinuity = (homeContinuity + awayContinuity) / 2;
  const continuityAdjustment = (1 - avgContinuity) * 0.15;
  const adjustedCurrentWeight = clamp(baseCurrentWeight + continuityAdjustment, 0.7, 0.95);
  
  return {
    season_2025: adjustedCurrentWeight,
    season_2024: (1 - adjustedCurrentWeight) * 0.7,
    season_2023: (1 - adjustedCurrentWeight) * 0.3,
    recent_4_weeks: currentWeek <= 4 ? 0.15 : 0.10
  };
}

function calculateEvidenceStrength(teamMetrics, currentWeek) {
  const processMetrics = {
    pressure_consistency: Math.abs(teamMetrics?.pressure?.pressure_diff || 0),
    explosive_consistency: Math.abs(teamMetrics?.situational?.explosive_diff || 0),
    pace_consistency: teamMetrics?.tempo?.pace_consistency || 0.5
  };
  
  const outcomeVariance = teamMetrics?.consistency?.variance || 0.5;
  const sampleFactor = Math.min(currentWeek / 6, 1);
  const processStrength = (processMetrics.pressure_consistency + processMetrics.explosive_consistency) / 2;
  const reliabilityFactor = 1 - outcomeVariance;
  const evidenceStrength = (processStrength * 0.4 + reliabilityFactor * 0.3 + sampleFactor * 0.3);
  
  return clamp(evidenceStrength, 0.2, 1.0);
}

function applyBayesianUpdating(historicalScore, currentScore, evidenceStrength, currentWeight) {
  const prior = historicalScore;
  const evidence = currentScore;
  const updateStrength = evidenceStrength * currentWeight * 1.2;
  return prior + (evidence - prior) * updateStrength;
}

function calculateCurrentSeasonMomentum(teamMetrics, currentWeek) {
  if (currentWeek <= 2) return 0;
  const recentForm = teamMetrics?.form?.off || 0;
  const seasonPerformance = teamMetrics?.core?.off_epa || 0;
  const momentum = Math.max(-0.1, Math.min(0.1, recentForm * 2));
  return momentum;
}

// v13 LOGIC: Main team scoring function with all fixes
function scoreTeamFromFeatures(teamData, league, contextWeights, matchupTerms = null, isHome = false, currentWeek = 3, opponentData = null, teamCode = null) {
  if (!teamData || !league) {
    return { score: 0, confidence: 0.5, evidenceStrength: 0.25, specialTeams: null };
  }

  // v13 LOGIC: Safe proxy for league means/stds
  const means = new Proxy(league.means || {}, { get: (t, k) => (k in t ? t[k] : 0) });
  const stds = new Proxy(league.stds || {}, { get: (t, k) => (k in t ? t[k] : 1) });

  const hasHistoricalData = teamData._metadata?.hasHistoricalData || false;
  const sit = teamData?.situational || {};
  const press = teamData?.pressure || {};
  const to = teamData?.turnovers || {};
  const coach = teamData?.coaching || {};
  const disc = teamData?.discipline || {};
  const tempo = teamData?.tempo || {};
  const core = teamData?.core || {};
  const script = teamData?.script || {};
  const formations = teamData?.formations || {};

  // v13 LOGIC: Use clippedZ to prevent extreme outliers
  const zPress = clippedZ(press.pressure_diff ?? 0, means.pressure_diff, stds.pressure_diff);
  const zExpl = clippedZ(sit.explosive_diff ?? 0, means.explosive_diff, stds.explosive_diff);
  const zTOdiff = clippedZ(to.turnover_diff ?? 0, means.turnover_diff, stds.turnover_diff);
  const zEDS = clippedZ(sit.eds ?? 0, means.eds, stds.eds);
  const zRZ = clippedZ(sit.rz_td_off ?? 0, means.rz_td_off, stds.rz_td_off);
  const zThird = clippedZ(sit.third_down_off ?? 0, means.third_down_off, stds.third_down_off);
  const z4th = clippedZ(coach.fourth_down_agg ?? 0, means.fourth_down_agg, stds.fourth_down_agg);
  const zPen = clippedZ(disc.penalty_diff ?? 0, means.penalty_diff, stds.penalty_diff);
  const zTOP = clippedZ(tempo.top_eff ?? 0, means.top_eff, stds.top_eff);

  const offEPA = core.off_adj_epa ?? core.off_epa ?? 0;
  const defEPA = -(core.def_adj_epa ?? core.def_epa ?? 0);
  const coreScore = (offEPA + defEPA) * SCORING_MULTIPLIERS.CORE_EPA;

  const consistency = teamData?.consistency?.off ?? 0.5;
  const form = teamData?.form?.off ?? 0;
  
  // GPT SANITY GUARD: Clip weekly EPA form deltas to prevent overreaction to single hot games
  // Max ±0.05 weekly change (prevents +0.15 spike from weak opponent from adding 4+ points)
  const clippedForm = clamp(form, -0.05, 0.05);
  
  const enhancedForm = hasHistoricalData && contextWeights?.recent_4_weeks > 0 ? 
    clippedForm * (1 + contextWeights.recent_4_weeks * 2.5) : clippedForm;

  const currentMomentum = calculateCurrentSeasonMomentum(teamData, currentWeek);
  const paceAdj = clamp((tempo.pace ?? 30) / 30 - 1, -0.5, 0.5);
  const motionAdv = (formations.motion_rate ?? 0.4) - 0.4;
  const scriptAdapt = script.trailing_epa ?? 0;
  const evidenceStrength = calculateEvidenceStrength(teamData, currentWeek);

  const tierScore = 
    (BASE_WEIGHTS.pressure_diff * zPress * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.explosive_diff * zExpl * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.turnover_diff * zTOdiff * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.eds * zEDS * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.rz_td * zRZ * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.third_down * zThird * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.fourth_down_agg * z4th * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.penalty_diff * zPen * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.top_eff * zTOP * SCORING_MULTIPLIERS.TIER_BASE);

  const advancedScore = 
    (ADVANCED_WEIGHTS.consistency * (consistency - 0.5) * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.form * enhancedForm * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.current_season_momentum * currentMomentum * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.tempo * paceAdj * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.formations * motionAdv * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.script_adaptation * scriptAdapt * SCORING_MULTIPLIERS.ADVANCED_BASE);

  const matchupScore = calculateMatchupScore(matchupTerms) * SCORING_MULTIPLIERS.MATCHUP_BASE;

  // v13 LOGIC: Special teams integration
  let specialTeamsScore = 0;
  let specialTeamsMetrics = null;
  
  if (opponentData && teamCode) {
    const teamST = teamData.special_teams || generateSpecialTeamsFromBasics(teamCode, teamData, league);
    const oppST = opponentData.special_teams || generateSpecialTeamsFromBasics('OPP', opponentData, league);
    
    const tempTeamMetrics = { ...teamData, special_teams: teamST };
    const tempOppMetrics = { ...opponentData, special_teams: oppST };
    
    specialTeamsMetrics = calculateSpecialTeamsMetrics(tempTeamMetrics, tempOppMetrics, league);
    specialTeamsScore = 
      (SPECIAL_TEAMS_WEIGHTS.field_goal_net * specialTeamsMetrics.field_goal_net * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE) +
      (SPECIAL_TEAMS_WEIGHTS.punt_net * specialTeamsMetrics.punt_net * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE) +
      (SPECIAL_TEAMS_WEIGHTS.return_advantage * specialTeamsMetrics.return_advantage * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE) +
      (SPECIAL_TEAMS_WEIGHTS.coverage_efficiency * specialTeamsMetrics.coverage_efficiency * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE);
  }

  const currentSeasonScore = coreScore + tierScore + advancedScore + matchupScore + specialTeamsScore;
  const historicalScore = currentSeasonScore * 0.85;
  const finalScore = applyBayesianUpdating(historicalScore, currentSeasonScore, evidenceStrength, contextWeights.season_2025);
  
  const baseConfidence = 0.5;
  const evidenceBoost = evidenceStrength * 0.25;
  const sampleBoost = Math.min(currentWeek / 8, 0.15);
  const stConfidenceBoost = specialTeamsMetrics ? 0.02 : 0;
  const finalConfidence = clamp(baseConfidence + evidenceBoost + sampleBoost + stConfidenceBoost, 0.35, 0.85);

  return { score: finalScore, confidence: finalConfidence, evidenceStrength: evidenceStrength, specialTeams: specialTeamsMetrics };
}

// ELITE PRO MODEL: Replacement Value Theory for Injury Adjustments
// Based on (Player_EPA - Replacement_EPA) * Usage_Rate * Context_Multipliers

const PLAYER_EPA_DATABASE = {
  // 2024-2025 season EPA per play data (starter vs backup differentials)
  RB: {
    // Format: [Starter_EPA_per_play, Typical_Backup_EPA_per_play, Usage_Share_When_Healthy]
    'James Conner': [0.18, -0.05, 0.65], // Conner vs Benson/Demercado
    'Christian McCaffrey': [0.28, -0.02, 0.72],
    'Saquon Barkley': [0.22, 0.08, 0.68],
    'Josh Jacobs': [0.15, -0.08, 0.62],
    'Derrick Henry': [0.21, 0.02, 0.58],
    'Bijan Robinson': [0.19, 0.05, 0.64],
    // Add more as needed
  },
  WR: {
    'Tyreek Hill': [0.25, 0.08, 0.28],
    'Davante Adams': [0.23, 0.06, 0.26],
    'Cooper Kupp': [0.24, 0.09, 0.25],
    'Marvin Harrison Jr.': [0.16, 0.04, 0.22], // Rookie projection
    // Add more as needed
  },
  TE: {
    'Travis Kelce': [0.20, 0.02, 0.18],
    'Mark Andrews': [0.18, 0.01, 0.16],
    'George Kittle': [0.19, 0.03, 0.15],
    // Add more as needed
  },
  QB: {
    'Josh Allen': [0.31, 0.08, 1.0],
    'Patrick Mahomes II': [0.29, 0.12, 1.0],
    'Lamar Jackson': [0.28, 0.06, 1.0],
    'Kyler Murray': [0.24, 0.05, 1.0],
    'Jayden Daniels': [0.26, 0.04, 1.0], // Strong rookie season, big dropoff to Mariota
    // Add more as needed
  }
};

const TEAM_SCHEME_DEPENDENCY = {
  // How much each team's offense depends on specific positions (0.5 = average, 1.0 = extremely dependent)
  'ARI': { RB: 0.75, WR: 0.85, TE: 0.6, QB: 0.9 }, // Run-heavy, Kyler-dependent
  'SEA': { RB: 0.8, WR: 0.7, TE: 0.5, QB: 0.85 },
  'KC': { RB: 0.5, WR: 0.6, TE: 0.9, QB: 1.0 }, // Mahomes + Kelce system
  'SF': { RB: 0.95, WR: 0.65, TE: 0.8, QB: 0.7 }, // CMC-dependent
  'PHI': { RB: 0.85, WR: 0.7, TE: 0.6, QB: 0.9 }, // Saquon + Hurts
  'WAS': { RB: 0.6, WR: 0.75, TE: 0.6, QB: 0.95 }, // Jayden Daniels rookie system dependent
  // Add more teams as needed - default to 0.7 across positions
};

const MATCHUP_CONTEXT_MULTIPLIERS = {
  // How replacement players perform vs specific defensive strengths
  vs_run_defense: {
    'elite': 0.8,    // Replacement RBs struggle more vs elite run D
    'good': 0.9,
    'average': 1.0,
    'poor': 1.1      // Replacement RBs might not struggle as much vs poor run D
  },
  vs_pass_defense: {
    'elite': 0.85,   // Backup WRs/TEs struggle more vs elite pass D  
    'good': 0.9,
    'average': 1.0,
    'poor': 1.05
  }
};

function calculateReplacementValue(playerName, position, teamCode, opponentCode, injuries) {
  // Get player EPA data
  const playerData = PLAYER_EPA_DATABASE[position]?.[playerName];
  if (!playerData) {
    // Unknown player - use position averages
    console.warn(`No EPA data for ${playerName} (${position}), using defaults`);
    return calculateDefaultInjuryImpact(position, teamCode);
  }

  const [starterEPA, replacementEPA, usageShare] = playerData;
  
  // Base replacement value calculation (negative because losing good player hurts)
  const baseImpact = -(starterEPA - replacementEPA) * usageShare;
  
  // Apply team scheme dependency
  const teamScheme = TEAM_SCHEME_DEPENDENCY[teamCode] || { RB: 0.7, WR: 0.7, TE: 0.7, QB: 0.8 };
  const schemeDependency = teamScheme[position] || 0.7;
  const schemeAdjustedImpact = baseImpact * schemeDependency;
  
  // Apply matchup context (simplified - would need opponent defensive rankings)
  const matchupMultiplier = getMatchupMultiplier(position, opponentCode);
  const contextAdjustedImpact = schemeAdjustedImpact * matchupMultiplier;
  
  // Convert EPA per play to expected points per game (assuming ~65 relevant plays)
  const expectedGameImpact = contextAdjustedImpact * 65;
  
  return {
    baseImpact,
    schemeAdjustedImpact,
    contextAdjustedImpact,
    expectedGameImpact,
    confidence: playerData ? 0.85 : 0.6 // Higher confidence with real data
  };
}

function getMatchupMultiplier(position, opponentCode) {
  // Simplified matchup context - in reality would pull defensive rankings
  const defaultMultipliers = {
    'SEA': { RB: 0.9, WR: 1.05, TE: 1.0 }, // Good run D, vulnerable pass D
    'SF': { RB: 0.85, WR: 0.9, TE: 0.9 },   // Elite defense overall
    'KC': { RB: 1.05, WR: 1.0, TE: 1.0 },   // Average defense
    'ARI': { RB: 1.1, WR: 1.05, TE: 1.05 }, // Poor defense
    // Add more as needed
  };
  
  return defaultMultipliers[opponentCode]?.[position] || 1.0;
}

function calculateDefaultInjuryImpact(position, teamCode) {
  // Fallback for unknown players - conservative estimates
  const defaultImpacts = {
    RB: -1.8,  // Average RB1 vs RB2 impact
    WR: -2.2,  // Average WR1 vs WR2 impact  
    TE: -1.1,  // Average TE1 vs TE2 impact
    QB: -4.5   // Average QB1 vs QB2 impact
  };
  
  const teamScheme = TEAM_SCHEME_DEPENDENCY[teamCode] || { RB: 0.7, WR: 0.7, TE: 0.7, QB: 0.8 };
  const baseImpact = defaultImpacts[position] || -1.0;
  const schemeDependency = teamScheme[position] || 0.7;
  
  return {
    baseImpact,
    schemeAdjustedImpact: baseImpact * schemeDependency,
    contextAdjustedImpact: baseImpact * schemeDependency,
    expectedGameImpact: baseImpact * schemeDependency,
    confidence: 0.6
  };
}

async function applyInjuryAdjustments(scoreData, teamCode, injuries, weekNumber = 1, preloadedDepthCharts = null) {
  const teamInjuries = injuries.teams?.[teamCode] || {};

  // FALLBACK NORMALIZATION: If legacy fields (qb_name, *_injuries) are absent but a raw
  // BallDontLie-style injuries array exists, derive the expected structure on the fly.
  if (!teamInjuries.qb_name && Array.isArray(teamInjuries.injuries)) {
    try {
      const trackedStatuses = new Set(['out','doubtful','questionable']);
      const rb_injuries = [];
      const wr_injuries = [];
      const te_injuries = [];
      let qbPicked = false;
      for (const inj of teamInjuries.injuries) {
        const pos = (inj.position || '').toUpperCase();
        const status = (inj.status || '').toLowerCase();
        if (!trackedStatuses.has(status)) continue;
        if (pos === 'QB' && !qbPicked) {
          teamInjuries.qb_name = inj.playerName;
          teamInjuries.qb_status = status;
          qbPicked = true;
        } else if (pos === 'RB') {
          rb_injuries.push({ name: inj.playerName, status, depth: 1 });
        } else if (pos === 'WR') {
          wr_injuries.push({ name: inj.playerName, status, depth: 1 });
        } else if (pos === 'TE') {
          te_injuries.push({ name: inj.playerName, status, depth: 1 });
        }
      }
      if (rb_injuries.length) teamInjuries.rb_injuries = rb_injuries;
      if (wr_injuries.length) teamInjuries.wr_injuries = wr_injuries;
      if (te_injuries.length) teamInjuries.te_injuries = te_injuries;
      if (qbPicked || rb_injuries.length || wr_injuries.length || te_injuries.length) {
        console.log(`🧩 Derived legacy injury fields for ${teamCode} (on-the-fly)`);
      }
    } catch (e) {
      console.warn(`⚠️ Failed fallback normalization for ${teamCode}: ${e.message}`);
    }
  }
  let totalDelta = 0;
  const injuryAnalysis = {
    adjustments: [],
    totalImpact: 0,
    confidence: 1.0
  };
  
  // ==================================================
  // CANONICAL AVAILABILITY V5 INTEGRATION
  // ==================================================
  console.log(`📋 Building canonical availability for ${teamCode}, Week ${weekNumber}...`);
  
  const now = Date.now();
  const allPlayers = [];
  
  // PHASE 1: Load current depth chart for replacement identification
  let currentDepthChart = null;
  try {
    // Use preloaded depth charts if available (performance optimization)
    if (preloadedDepthCharts && preloadedDepthCharts.has(weekNumber)) {
      currentDepthChart = preloadedDepthCharts.get(weekNumber);
      console.log(`✅ Using preloaded depth chart for Week ${weekNumber}`);
    } else {
      // Fallback to dynamic loading if preloaded not available
      const { loadDepthChart } = await import('../_lib/depth-chart-change-detector.js');
      currentDepthChart = loadDepthChart(weekNumber, 2025);
      if (currentDepthChart) {
        console.log(`✅ Loaded depth chart for Week ${weekNumber} (fallback)`);
      } else {
        console.warn(`⚠️ No depth chart available for Week ${weekNumber}, using generic backup values`);
      }
    }
  } catch (error) {
    console.warn(`⚠️ Failed to load depth chart:`, error.message);
  }
  
  // Helper: normalize incoming injury status strings to canonical lowercase keys
  const normalizeStatus = (s) => {
    if (!s) return 'active';
    const lower = String(s).toLowerCase();
    // Map common variants
    const map = {
      // Core statuses
      questionable: 'questionable', q: 'questionable',
      doubtful: 'doubtful', d: 'doubtful', dout: 'doubtful',
      out: 'out', inactive: 'out',
      prob: 'active', probable: 'active', active: 'active',
      // Practice report aliases → treat as questionable unless clearly full/rest
      dnp: 'questionable', 'did not practice': 'questionable',
      lp: 'questionable', limited: 'questionable', 'limited practice': 'questionable',
      fp: 'active', full: 'active', 'full practice': 'active',
      rest: 'active'
    };
    return map[lower] || lower; // allow 'out', 'doubtful', 'questionable', 'active'
  };
  
  // Process QB
  if (teamInjuries.qb_name && teamInjuries.qb_status) {
    const qbStatus = normalizeStatus(teamInjuries.qb_status);
    
    // Use pickReplacement() to find healthy QB from filtered depth chart
    const replacementQB = pickReplacement(teamCode, 'QB', teamInjuries.qb_name, currentDepthChart, [{ name: teamInjuries.qb_name, status: qbStatus }]);
    
    if (replacementQB) {
      console.log(`  QB replacement: ${teamInjuries.qb_name} (${qbStatus}) → ${replacementQB}`);
    } else {
      console.warn(`  ⚠️ No replacement QB found for ${teamInjuries.qb_name}`);
    }
    
    // Calculate graded probPlay and snap scale
    const probPlay = statusToProbPlay('QB', qbStatus);
    const snapScale = expectedSnapScale('QB', qbStatus);
    
    console.log(`  📊 QB availability: probPlay=${probPlay.toFixed(2)}, snapScale=${snapScale.toFixed(2)}`);
    
    const qbSources = [{
      type: 'INJURY_REPORT',
      status: qbStatus,          // CRITICAL: canonical mergeSource expects 'status'
      reason: 'injury',
      isStarter: true,            // FIX: Always treat injured QB as starter (ignore depth chart)
      depthOrder: 1,              // FIX: Force depth order 1 (injury report overrides depth chart)
      depthPosition: 1,
      replacementPlayerName: replacementQB,  // Healthy QB from filtered depth chart
      probPlay: probPlay,         // Graded probability (0.0-0.95) instead of binary
      snapScale: snapScale,       // Snap count scaling for limited returns
      timestamp: now
    }];
    
    const qbAvail = buildCanonicalAvailability(
      `${teamCode}_QB_${teamInjuries.qb_name}`,
      teamInjuries.qb_name,
      teamCode,
      'QB',
      weekNumber,
      qbSources,
      now
    );
    
    const qbImpact = await qbAvail.calculateImpact();
    if (Math.abs(qbImpact.spreadImpact) > 0.01) {
      allPlayers.push({
        name: teamInjuries.qb_name,
        position: 'QB',
        status: teamInjuries.qb_status,
        impact: qbImpact.spreadImpact,
        confidence: qbImpact.confidence,
        availability: qbAvail
      });
      totalDelta += qbImpact.spreadImpact;
    }
  }
  
  // Load ESPN IR data for baseline contributor check
  let espnIRData = null;
  let isPlayerOnIR = null; // Declare in outer scope
  
  try {
    const espnModule = await import('../_lib/espn-ir-tracker.mjs');
    isPlayerOnIR = espnModule.isPlayerOnIR; // Assign to outer scope
    espnIRData = await espnModule.fetchESPN_IR_Players();
    if (espnIRData.totalIR > 0) {
      console.log(`📋 Loaded ${espnIRData.totalIR} IR players for baseline validation`);
    }
  } catch (err) {
    console.warn(`⚠️ ESPN IR data unavailable for baseline check: ${err.message}`);
  }
  
  // Gap A Fix: Build reserve index for IR/PUP/NFI/SUSP (priority 95)
  const reserveIndex = new Map();
  if (espnIRData?.irPlayers) {
    Object.entries(espnIRData.irPlayers).forEach(([team, players]) => {
      players.forEach(p => {
        // Use name only as key (cross-team matching)
        const key = p.name.trim();
        reserveIndex.set(key, {
          status: 'IR',  // ESPN primarily tracks IR
          expectedReturnWeek: null,  // ESPN doesn't provide
          expectedReturnDate: null,
          source: 'ESPN_IR',
          team: team
        });
      });
    });
    console.log(`📋 Gap A: Built reserve index with ${reserveIndex.size} IR players`);
  }

  // Process skill positions (RB, WR, TE)
  const skillPositions = ['RB', 'WR', 'TE'];
  for (const position of skillPositions) {
    const positionInjuries = teamInjuries[`${position.toLowerCase()}_injuries`] || [];
    
    for (const injury of positionInjuries) {
      const playerName = injury.name || injury.player || 'Unknown';
      const statusRaw = injury.status || 'active';
      const status = normalizeStatus(statusRaw);
      const depthPosition = injury.depth || 1;
      const isIR = injury.isIR || false; // Flag from ESPN IR supplement
      
      // BASELINE CONTRIBUTOR CHECK: Skip IR players not in baseline
      if (isIR || status === 'out') {
        const wasInBaseline = checkPlayerBaselineContribution(playerName, position, teamCode);
        
        // Double-check with ESPN IR data if available
        const confirmedIR = (espnIRData && isPlayerOnIR) ? isPlayerOnIR(playerName, teamCode, espnIRData) : isIR;
        
        if (confirmedIR && !wasInBaseline) {
          console.log(`⏭️ Skipping ${playerName} (${position}) - on IR, not in baseline EPA`);
          continue; // Skip adjustment - already absent when baseline calculated
        }
        
        if (confirmedIR && wasInBaseline) {
          console.log(`⚠️ ${playerName} (${position}) - on IR but WAS in baseline, applying impact`);
        }
      }
      
      // ENHANCED: Check if player is high-usage starter using EPA database and position-specific thresholds
      let isStarter = depthPosition === 1; // Default from injury report
      let adjustedDepthPosition = depthPosition;
      
      try {
        const { getPlayerEPA } = await import('../_lib/comprehensive-player-epa.js');
        const playerData = getPlayerEPA(playerName, position);
        
        // Use position-specific usage thresholds (RB: 50%, WR: 22%, TE: 15%)
        if (playerData && isHighUsageStarter(playerData, position)) {
          isStarter = true;
          adjustedDepthPosition = 1; // Override depth chart - player is true starter by usage
          console.log(`  ⭐ ${playerName} (${position}) identified as high-usage starter (${(playerData.usage * 100).toFixed(0)}% usage)`);
        } else if (playerData) {
          console.log(`  📊 ${playerName} (${position}) is backup/committee (${(playerData.usage * 100).toFixed(0)}% usage)`);
        }
      } catch (err) {
        // Fallback to depth chart position if EPA database unavailable
        console.log(`  ℹ️ Using depth chart for ${playerName} (EPA data unavailable)`);
      }
      
      // Skip healthy players beyond depth 2 (unless they're high-usage starters)
      if (status === 'active' && depthPosition > 2 && !isStarter) continue;
      
      // Use pickReplacement() to find healthy replacement from filtered depth chart
      const replacementPlayer = pickReplacement(teamCode, position, playerName, currentDepthChart, positionInjuries);
      
      if (replacementPlayer) {
        console.log(`  ${position} replacement: ${playerName} (${status}, usage-adjusted depth ${adjustedDepthPosition}) → ${replacementPlayer}`);
      } else {
        console.warn(`  ⚠️ No healthy replacement found for ${playerName} (${position})`);
      }
      
      // Calculate graded probPlay and snap scale
      const probPlay = statusToProbPlay(position, status);
      const snapScale = expectedSnapScale(position, status);
      
      console.log(`  📊 ${position} availability: probPlay=${probPlay.toFixed(2)}, snapScale=${snapScale.toFixed(2)}`);
      
      const sources = [{
        type: 'INJURY_REPORT',
        status: status,          // Provide canonical field
        reason: 'injury',
        isStarter: isStarter,    // Based on usage data + depth chart
        depthOrder: adjustedDepthPosition,
        depthPosition: adjustedDepthPosition,
        replacementPlayerName: replacementPlayer,  // Healthy player from filtered depth chart
        probPlay: probPlay,      // Graded probability (0.0-0.95) instead of binary
        snapScale: snapScale,    // Snap count scaling for limited returns
        timestamp: now
      }];
      
      const avail = buildCanonicalAvailability(
        `${teamCode}_${position}_${playerName}`,
        playerName,
        teamCode,
        position,
        weekNumber,
        sources,
        now
      );
      
      const impact = await avail.calculateImpact();
      if (Math.abs(impact.spreadImpact) > 0.01) {
        allPlayers.push({
          name: playerName,
          position: position,
          status: status,
          depth: depthPosition,
          impact: impact.spreadImpact,
          confidence: impact.confidence,
          availability: avail
        });
        totalDelta += impact.spreadImpact;
      }
    }
  }

  // Apply position caps with budget reallocation
  // Build adjustments array for position caps (expected input is an array of per-player adjustments)
  const rawAdjustments = allPlayers.map(p => ({
    position: p.position,
    impact: {
      spreadImpact: p.impact,
      totalImpact: p.impact * (p.position === 'QB' ? 0.3 : 0.25),
      confidence: p.confidence
    },
    player: p.name,
    status: p.status,
    depth: p.depth || 1
  }));

  const cappedAdjustments = applyPositionCaps(rawAdjustments);
  // Recompute total delta from capped adjustments
  totalDelta = cappedAdjustments.reduce((sum, adj) => sum + (adj.impact?.spreadImpact || 0), 0);
  
  // Gap B Fix: Apply team/global caps with interaction bumps
  // Build roomTotals for interaction detection
  const roomTotals = {
    QB: cappedAdjustments
      .filter(a => a.position === 'QB')
      .reduce((sum, a) => sum + Math.abs(a.impact?.spreadImpact || 0), 0),
    WR1: cappedAdjustments
      .filter(a => a.position === 'WR' && a.depth === 1)
      .reduce((sum, a) => sum + Math.abs(a.impact?.spreadImpact || 0), 0),
    TE1: cappedAdjustments
      .filter(a => a.position === 'TE' && a.depth === 1)
      .reduce((sum, a) => sum + Math.abs(a.impact?.spreadImpact || 0), 0),
    OL_LT: teamInjuries.ol_starters_out >= 1 ? 2.0 : 0,  // Proxy: OL impacts
    OL_hitCount: teamInjuries.ol_starters_out || 0
  };
  
  const teamCaps = applyTeamGlobalCaps(cappedAdjustments, roomTotals);
  
  // Log cap enforcement
  console.log(`🛡️ Gap B: Team caps applied - QB: ${teamCaps.qbImpact.toFixed(2)}, Non-QB: ${teamCaps.nonQbImpact.toFixed(2)}, Total: ${teamCaps.teamTotal.toFixed(2)}`);
  if (teamCaps.bumps > 0) {
    console.log(`  ↗️ Interaction bumps: +${teamCaps.bumps.toFixed(2)}pt`);
  }
  if (teamCaps.capsApplied.hitNonQBCap) {
    console.log(`  ⚠️ Non-QB cap applied (10.0 max, scale: ${teamCaps.capsApplied.scaleFactor.toFixed(3)})`);
  }
  if (teamCaps.capsApplied.hitTeamCap) {
    console.log(`  ⚠️ Team total cap applied (14.0 max, scale: ${teamCaps.capsApplied.scaleFactor.toFixed(3)})`);
  }
  
  // Override totalDelta with capped team total
  totalDelta = teamCaps.teamTotal;
  
  // Build injuryAnalysis from canonical availability
  // Expose adjustments in a shape used by safeguards: include EPA-style impact and player field
  cappedAdjustments.forEach(adj => {
    injuryAnalysis.adjustments.push({
      player: adj.player,
      name: adj.player,
      position: adj.position,
      status: adj.status,
      depth: adj.depth,
      impact: adj.impact?.spreadImpact,
      epaImpact: (adj.impact?.spreadImpact || 0) / 20,
      confidence: adj.impact?.confidence || 0.8,
      reason: 'Canonical availability v5 (field-level precedence)'
    });
  });
  
  // Traditional positional injuries (O-line, Defense, Special Teams) - fallback to simple calc
  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;
  if (olOut >= 2) {
    const olImpact = -2;
    totalDelta += olImpact;
    injuryAnalysis.adjustments.push({
      position: 'OL',
      impact: olImpact,
      reason: `${olOut} offensive line starters out`
    });
  }
  if (olOut >= 3) {
    const olImpact = -2; // Additional -2 for 3+ out (cumulative -4 total)
    totalDelta += olImpact;
    injuryAnalysis.adjustments.push({
      position: 'OL',
      impact: olImpact,
      reason: `${olOut} offensive line starters out (additional penalty)`
    });
  }
  if (dbOut >= 2) {
    const dbImpact = -1.5;
    totalDelta += dbImpact;
    injuryAnalysis.adjustments.push({
      position: 'DB',
      impact: dbImpact,
      reason: `${dbOut} defensive backs out`
    });
  }

  if (teamInjuries.kicker_status === 'out') {
    const kImpact = -1.5;
    totalDelta += kImpact;
    injuryAnalysis.adjustments.push({
      position: 'K',
      impact: kImpact,
      reason: 'Kicker out'
    });
  }
  if (teamInjuries.punter_status === 'out') {
    const pImpact = -1.0;
    totalDelta += pImpact;
    injuryAnalysis.adjustments.push({
      position: 'P',
      impact: pImpact,
      reason: 'Punter out'
    });
  }
  if (teamInjuries.returner_status === 'out') {
    const krImpact = -0.5;
    totalDelta += krImpact;
    injuryAnalysis.adjustments.push({
      position: 'KR/PR',
      impact: krImpact,
      reason: 'Return specialist out'
    });
  }

  // Calculate confidence from canonical availability (use min confidence from all players)
  const minConfidence = allPlayers.length > 0 
    ? Math.min(...allPlayers.map(p => p.confidence))
    : 1.0;
  
  injuryAnalysis.totalImpact = totalDelta;
  injuryAnalysis.confidence = minConfidence;
  
  // Gap B: Add team cap metadata to analysis
  injuryAnalysis.teamCaps = teamCaps.capsApplied;
  injuryAnalysis.interactionBumps = teamCaps.bumps;
  injuryAnalysis.qbImpact = teamCaps.qbImpact;
  injuryAnalysis.nonQbImpact = teamCaps.nonQbImpact;
  
  // ==================================================
  // RETURN BOOST SYSTEM (NEW)
  // ==================================================
  // Detect week-over-week improvements and apply positive impact credits
  console.log(`🔄 Checking return boosts for ${teamCode}, Week ${weekNumber}...`);
  
  try {
    const { detectReturnBoosts } = await import('../_lib/return-boost-system.js');
    const returnBoostData = await detectReturnBoosts(teamCode, injuries, weekNumber, 2025);
    
    if (returnBoostData.boosts && returnBoostData.boosts.length > 0) {
      console.log(`✅ Found ${returnBoostData.boosts.length} return boosts for ${teamCode}`);
      
      returnBoostData.boosts.forEach(boost => {
        totalDelta += boost.boost; // Add positive impact
        injuryAnalysis.adjustments.push({
          player: boost.playerName,
          name: boost.playerName,
          position: boost.position,
          status: boost.currentStatus,
          impact: boost.boost, // POSITIVE value
          epaImpact: boost.boost / 20,
          confidence: 0.8,
          reason: `Return boost: ${boost.reason}`,
          isReturnBoost: true
        });
      });
      
      injuryAnalysis.totalReturnBoost = returnBoostData.totalBoost;
      injuryAnalysis.totalImpact = totalDelta; // Update total with boosts
      
      console.log(`📈 Total return boost for ${teamCode}: +${returnBoostData.totalBoost.toFixed(2)} points`);
    }
  } catch (err) {
    console.warn(`⚠️ Return boost calculation failed for ${teamCode}: ${err.message}`);
  }
  
  // ==================================================
  // DEPTH CHART CHANGE DETECTION (NEW)
  // ==================================================
  // Detect non-injury personnel changes (benching, promotion, etc.)
  console.log(`📊 Checking depth chart changes for ${teamCode}, Week ${weekNumber}...`);
  
  try {
    const { getDepthChartImpactsForTeam } = await import('../_lib/depth-chart-change-detector.js');
    const depthChartChanges = getDepthChartImpactsForTeam(teamCode, weekNumber, 2025);
    
    if (depthChartChanges && depthChartChanges.hasPersonnelChanges) {
      console.log(`✅ Found personnel changes for ${teamCode}`);
      
      // QB change (benching, promotion, etc.)
      if (depthChartChanges.qbChange) {
        const qbChange = depthChartChanges.qbChange;
        
        // DEDUPLICATION: Skip if this change is due to injury (already counted)
        const qbInjuryDetected = teamInjuries.qb_name && normalizeStatus(teamInjuries.qb_status) === 'out';
        if (qbInjuryDetected) {
          console.log(`⏭️ Skipping QB depth chart change (already counted via injury system: ${teamInjuries.qb_name} OUT)`);
        } else {
          totalDelta += qbChange.spreadImpact;
          
          injuryAnalysis.adjustments.push({
            player: qbChange.currentStarter,
            name: qbChange.currentStarter,
            position: 'QB',
            status: 'DEPTH_CHANGE',
            impact: qbChange.spreadImpact,
            epaImpact: qbChange.epaDelta,
            confidence: qbChange.confidence,
            reason: `QB change: ${qbChange.previousStarter} → ${qbChange.currentStarter} (${qbChange.reason})`,
            isDepthChartChange: true,
            previousStarter: qbChange.previousStarter
          });
          
          console.log(`🔄 QB change: ${qbChange.previousStarter} → ${qbChange.currentStarter}`);
          console.log(`   Impact: ${qbChange.spreadImpact > 0 ? '+' : ''}${qbChange.spreadImpact.toFixed(2)} points (${qbChange.reason})`);
        }
      }
      
      // RB1 change
      if (depthChartChanges.rb1Change) {
        const rbChange = depthChartChanges.rb1Change;
        
        // DEDUPLICATION: Skip if RB1 is OUT due to injury (already counted)
        const rb1InjuryDetected = (teamInjuries.rb_injuries || []).some(rb => 
          normalizeStatus(rb.status) === 'out' && rb.depthPosition === 1
        );
        if (rb1InjuryDetected) {
          console.log(`⏭️ Skipping RB1 depth chart change (already counted via injury system)`);
        } else {
          totalDelta += rbChange.spreadImpact;
          
          injuryAnalysis.adjustments.push({
            player: rbChange.currentStarter,
            name: rbChange.currentStarter,
            position: 'RB',
            status: 'DEPTH_CHANGE',
            impact: rbChange.spreadImpact,
            epaImpact: rbChange.epaDelta,
            confidence: rbChange.confidence,
            reason: `RB1 change: ${rbChange.previousStarter} → ${rbChange.currentStarter} (${rbChange.reason})`,
            isDepthChartChange: true,
            previousStarter: rbChange.previousStarter
          });
          
          console.log(`🔄 RB1 change: ${rbChange.previousStarter} → ${rbChange.currentStarter}`);
          console.log(`   Impact: ${rbChange.spreadImpact > 0 ? '+' : ''}${rbChange.spreadImpact.toFixed(2)} points`);
        }
      }
      
      // WR1 change (dedup if already counted via injury system)
      if (depthChartChanges.wr1Change) {
        const wrChange = depthChartChanges.wr1Change;
        
        // DEDUPLICATION: Skip if WR1 is OUT due to injury (already counted)
        const wr1InjuryDetected = (teamInjuries.wr_injuries || []).some(wr => 
          normalizeStatus(wr.status) === 'out' && wr.depthPosition === 1
        );
        if (wr1InjuryDetected) {
          console.log(`⏭️ Skipping WR1 depth chart change (already counted via injury system)`);
        } else {
          totalDelta += wrChange.spreadImpact;
          
          injuryAnalysis.adjustments.push({
            player: wrChange.currentStarter,
            name: wrChange.currentStarter,
            position: 'WR1',
            status: 'DEPTH_CHANGE',
            impact: wrChange.spreadImpact,
            epaImpact: wrChange.epaDelta,
            confidence: wrChange.confidence,
            reason: `WR1 change: ${wrChange.previousStarter} → ${wrChange.currentStarter} (${wrChange.reason})`,
            isDepthChartChange: true,
            previousStarter: wrChange.previousStarter
          });
          
          console.log(`🔄 WR1 change: ${wrChange.previousStarter} → ${wrChange.currentStarter}`);
          console.log(`   Impact: ${wrChange.spreadImpact > 0 ? '+' : ''}${wrChange.spreadImpact.toFixed(2)} points`);
        }
      }
      
      // TE1 change (dedup if already counted via injury system)
      if (depthChartChanges.te1Change) {
        const teChange = depthChartChanges.te1Change;
        
        // DEDUPLICATION: Skip if TE1 is OUT due to injury (already counted)
        const te1InjuryDetected = (teamInjuries.te_injuries || []).some(te => 
          normalizeStatus(te.status) === 'out' && te.depthPosition === 1
        );
        if (te1InjuryDetected) {
          console.log(`⏭️ Skipping TE1 depth chart change (already counted via injury system)`);
        } else {
          totalDelta += teChange.spreadImpact;
          
          injuryAnalysis.adjustments.push({
            player: teChange.currentStarter,
            name: teChange.currentStarter,
            position: 'TE1',
            status: 'DEPTH_CHANGE',
            impact: teChange.spreadImpact,
            epaImpact: teChange.epaDelta,
            confidence: teChange.confidence,
            reason: `TE1 change: ${teChange.previousStarter} → ${teChange.currentStarter} (${teChange.reason})`,
            isDepthChartChange: true,
            previousStarter: teChange.previousStarter
          });
          
          console.log(`🔄 TE1 change: ${teChange.previousStarter} → ${teChange.currentStarter}`);
          console.log(`   Impact: ${teChange.spreadImpact > 0 ? '+' : ''}${teChange.spreadImpact.toFixed(2)} points`);
        }
      }
      
      injuryAnalysis.totalDepthChartImpact = depthChartChanges.totalSpreadImpact;
      injuryAnalysis.totalImpact = totalDelta; // Update total with depth chart changes
      
      console.log(`📈 Total depth chart impact for ${teamCode}: ${depthChartChanges.totalSpreadImpact > 0 ? '+' : ''}${depthChartChanges.totalSpreadImpact.toFixed(2)} points`);
    } else {
      console.log(`ℹ️ No significant depth chart changes for ${teamCode}`);
    }
  } catch (err) {
    console.warn(`⚠️ Depth chart change detection failed for ${teamCode}: ${err.message}`);
  }
  
  return {
    score: scoreData.score + totalDelta,
    confidence: scoreData.confidence * injuryAnalysis.confidence,
    evidenceStrength: scoreData.evidenceStrength,
    specialTeams: scoreData.specialTeams,
    injuryAnalysis: injuryAnalysis,
    _injuryApplied: true  // GPT SAFEGUARD: Mark that injuries have been applied
  };
}

// ELITE BASELINE CORRECTION FUNCTION
function checkPlayerBaselineContribution(playerName, position, teamCode) {
  // Elite logic: Check if player significantly contributed to season baseline stats
  // If player missed significant time already this season, their absence is 
  // already baked into the team's EPA baseline
  
  const teamContributors = BASELINE_CONTRIBUTORS_2025[teamCode];
  if (!teamContributors) {
    console.warn(`⚠️ No baseline data for ${teamCode} - assuming player contributed`);
    return true; // Conservative: assume player contributed if no data
  }
  
  const positionContributors = teamContributors[position];
  if (!positionContributors) {
    return true; // Conservative: assume player contributed if position not mapped
  }
  
  // Enhanced name matching with suffix normalization
  const normalizedPlayerName = playerName.toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, '');
  
  const isInBaseline = positionContributors.some(baselineName => {
    const normalizedBaseline = baselineName.toLowerCase()
      .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, '');
    return normalizedPlayerName === normalizedBaseline ||
           normalizedPlayerName.includes(normalizedBaseline) ||
           normalizedBaseline.includes(normalizedPlayerName);
  });
  
  return isInBaseline;
}

// v13 LOGIC: Fixed spread calculation
function calculateSpreadPrediction(homeScoreData, awayScoreData, homeCode, awayCode) {
  const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
  
  const qualityDifferential = awayScoreData.score - homeScoreData.score;
  const qualityAdjustment = Math.max(0, qualityDifferential * 0.2);
  
  const confidentHFA = Math.max(1.5, 2.2 - qualityAdjustment);
  const uncertainHFA = Math.max(1.0, 1.2 - qualityAdjustment);
  const dynamicHFA = confidentHFA - (confidentHFA - uncertainHFA) * (1 - avgConfidence);
  
  const isDivisional = isDivisionalGame(homeCode, awayCode);
  const divisionalAdjustment = isDivisional ? 0.8 : 1.0;
  
  // GPT SANITY GUARD: Reduce home field when both teams have below-average EPA
  // If both teams are weak (EPA < 0), home field is less reliable - halve the advantage
  const homeEPA = homeScoreData?.score || 0;
  const awayEPA = awayScoreData?.score || 0;
  const bothTeamsWeak = (homeEPA < 0 && awayEPA < 0);
  const weakTeamAdjustment = bothTeamsWeak ? 0.5 : 1.0;
  
  const adjustedHFA = dynamicHFA * divisionalAdjustment * weakTeamAdjustment;
  
  if (bothTeamsWeak) {
    console.log(`⚖️ Weak team HFA reduction: ${dynamicHFA.toFixed(2)} → ${adjustedHFA.toFixed(2)} (both teams EPA < 0)`);
  }
  
  const scoreDifference = homeScoreData.score - awayScoreData.score;
  
  // CRITICAL FIX: Scores from scoreTeamFromFeatures are ALREADY in point units!
  // The SCORING_MULTIPLIERS (CORE_EPA=24, TIER_BASE=8, etc.) convert EPA to points.
  // We should NOT multiply by 3.0 again - that inflates spreads 3x!
  const spreadFromScores = scoreDifference; // Remove the 3.0 multiplier
  
  let stSpreadAdjustment = 0;
  if (homeScoreData.specialTeams && awayScoreData.specialTeams) {
    const homeSTValue = homeScoreData.specialTeams.total_st_value;
    const awaySTValue = awayScoreData.specialTeams.total_st_value;
    stSpreadAdjustment = (homeSTValue - awaySTValue) * 0.5;
  }
  
  const predictedHomeMargin = adjustedHFA + spreadFromScores + stSpreadAdjustment;
  
  // DEBUG: Detailed logging for ATL and TB games
  if (homeCode === 'ATL' || homeCode === 'TB' || awayCode === 'ATL' || awayCode === 'TB' || 
      homeCode === 'SF' || homeCode === 'BUF' || awayCode === 'SF' || awayCode === 'BUF') {
    console.log(`\n🔍 === SPREAD DEBUG: ${awayCode} @ ${homeCode} ===`);
    console.log(`   Raw Scores: Home=${homeScoreData.score.toFixed(4)}, Away=${awayScoreData.score.toFixed(4)}`);
    console.log(`   Score Difference: ${scoreDifference.toFixed(4)}`);
    console.log(`   Spread from Scores (NO MULTIPLIER - scores already in points!): ${spreadFromScores.toFixed(2)}`);
    console.log(`   HFA Components: dynamic=${dynamicHFA.toFixed(2)}, div=${divisionalAdjustment.toFixed(2)}, weak=${weakTeamAdjustment.toFixed(2)}`);
    console.log(`   Adjusted HFA: ${adjustedHFA.toFixed(2)}`);
    console.log(`   ST Adjustment: ${stSpreadAdjustment.toFixed(2)}`);
    console.log(`   BEFORE clamp: ${predictedHomeMargin.toFixed(2)}`);
    console.log(`   AFTER clamp (±17): ${clamp(predictedHomeMargin, -17, 17).toFixed(2)}`);
  }
  
  // Log extreme predictions for investigation
  if (Math.abs(predictedHomeMargin) > 17) {
    console.log(`⚠️ EXTREME SPREAD: ${homeCode} vs ${awayCode}: ${predictedHomeMargin.toFixed(1)} (HFA: ${adjustedHFA.toFixed(1)}, ScoreDiff: ${scoreDifference.toFixed(2)}, Mult: ${spreadFromScores.toFixed(1)}, ST: ${stSpreadAdjustment.toFixed(1)})`);
  }
  
  return clamp(predictedHomeMargin, -17, 17); // Reduced from ±21 to ±17 (max realistic NFL spread)
}

function calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread = 0, homeSTData = null, awaySTData = null) {
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  const homeForm = homeMetrics?.form?.off || 0;
  const awayForm = awayMetrics?.form?.off || 0;
  
  const homeBasePoints = 24.0 + (homeOffEPA * 95) + (homeForm * 20);
  const awayBasePoints = 24.0 + (awayOffEPA * 95) + (awayForm * 20);
  
  const homePointsVsDefense = homeBasePoints - (awayDefEPA * 25);
  const awayPointsVsDefense = awayBasePoints - (homeDefEPA * 25);
  
  const homeExplosive = homeMetrics?.situational?.explosive_off ?? 0;
  const awayExplosive = awayMetrics?.situational?.explosive_off ?? 0;
  const homeExplosiveBoost = homeExplosive * 8;
  const awayExplosiveBoost = awayExplosive * 8;
  
  const homePace = Math.max(homeMetrics?.tempo?.pace || 65, 60);
  const awayPace = Math.max(awayMetrics?.tempo?.pace || 65, 60);
  const avgPace = (homePace + awayPace) / 2;
  const paceMultiplier = avgPace / 67;
  
  const wind15 = false;
  const neutralConditionsBoost = (!wind15 && Math.abs(marketSpread) <= 7) ? 1.5 : 0;
  
  const expectedMargin = Math.abs(marketSpread || 0);
  const gameScriptFactor = expectedMargin > 7 ? 0.95 : 1.0;
  
  const homeProjected = Math.max(14, (homePointsVsDefense + homeExplosiveBoost) * paceMultiplier * gameScriptFactor);
  const awayProjected = Math.max(14, (awayPointsVsDefense + awayExplosiveBoost) * paceMultiplier * gameScriptFactor);
  let baseTotal = homeProjected + awayProjected + neutralConditionsBoost;
  
  let stTotalAdjustment = 0;
  if (homeSTData && awaySTData) {
    const homeFGImpact = homeSTData.field_goal_net * 0.6;
    const awayFGImpact = awaySTData.field_goal_net * 0.6;
    const homeReturnImpact = homeSTData.return_advantage * 0.15;
    const awayReturnImpact = awaySTData.return_advantage * 0.15;
    stTotalAdjustment = homeFGImpact + awayFGImpact + homeReturnImpact + awayReturnImpact;
  }
  
  return clamp(baseTotal + stTotalAdjustment, 38, 68);
}

function calculateConfidence(modelProb, marketProb, edge, scoreConfidence, evidenceStrength, scoreDifference = 0, betType = 'spread', gameContext = {}) {
  const modelCertainty = Math.abs(modelProb - 0.5) * 2;
  const edgeComponent = edge ? Math.min(Math.abs(edge), 0.15) / 0.15 : 0;
  const differentiationBoost = Math.min(Math.abs(scoreDifference) / 12, 0.15);
  const scoreConfidenceBoost = (scoreConfidence - 0.5) * 0.2;
  const evidenceBoost = evidenceStrength * 0.15;
  
  const rawConfidence = (modelCertainty * 0.5) + (edgeComponent * 0.2) + 
                       scoreConfidenceBoost + evidenceBoost + differentiationBoost;
  
  let baseConfidence = Math.max(50, Math.round(rawConfidence * 50 + 55));
  
  baseConfidence = 50 + ((baseConfidence - 50) * 0.6);
  
  if (gameContext.week <= 4) {
    baseConfidence = baseConfidence * 0.95;
  }
  
  if (gameContext.divisional) {
    baseConfidence = baseConfidence * 0.98;
  }
  
  if (gameContext.majorInjuries) {
    baseConfidence = Math.max(baseConfidence, 65);
  }
  
  if (betType === 'total') {
    const totalEdge = Math.abs(edge || 0);
    if (totalEdge < 3.0) {
      baseConfidence = Math.min(baseConfidence, 58);
    } else if (totalEdge < 4.5) {
      baseConfidence = Math.min(baseConfidence, 62);
    } else {
      baseConfidence = Math.min(baseConfidence, 68);
    }
  }
  
  if (baseConfidence > 78) baseConfidence = Math.min(baseConfidence, 78);
  
  // PHASE 1 ENHANCEMENT: Apply calibration fix for 55-65% band
  const calibratedConfidence = applyCalibrationFix(baseConfidence);
  
  return Math.round(calibratedConfidence);
}

// v8 WORKING ODDS: Load live odds directly from The Odds API
/**
 * Load live odds only for games within 24 hours of kickoff
 * This optimization skips odds fetching for future games to reduce API overhead
 */
async function loadLiveOddsForGames(games) {
  if (!games || games.length === 0) {
    console.log('[ODDS] No games provided, skipping odds fetch');
    return [];
  }
  
  // Filter games to only those within 24 hours
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  
  const upcomingGames = games.filter(game => {
    if (!game.start) return true; // Include if no kickoff time
    const kickoff = new Date(game.start).getTime();
    const timeUntilKickoff = kickoff - now;
    return timeUntilKickoff <= TWENTY_FOUR_HOURS;
  });
  
  console.log(`[ODDS] Games within 24h: ${upcomingGames.length}/${games.length}`);
  
  // If no games within 24 hours, skip odds entirely
  if (upcomingGames.length === 0) {
    console.log('[ODDS] No games within 24 hours, skipping odds API call');
    return [];
  }
  
  // Otherwise fetch odds normally
  return loadLiveOdds();
}

/**
 * Internal odds loading function (called by loadLiveOddsForGames)
 */
async function loadLiveOdds() {
  const apiKey = process.env.ODDS_API_KEY;
  const oddsApiUrl = apiKey
    ? `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?apiKey=${encodeURIComponent(apiKey)}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`
    : null;

  // Primary: Fetch directly from The Odds API with strict timeout
  if (oddsApiUrl) {
    try {
      console.log('[ODDS] Fetching from The Odds API');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const res = await fetch(oddsApiUrl, { 
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        console.log(`[ODDS] Loaded ${Array.isArray(data) ? data.length : 0} games from The Odds API`);
        if (Array.isArray(data) && data.length > 0) return data;
      } else {
        console.warn(`[ODDS] The Odds API responded ${res.status}`);
      }
    } catch (err) {
      console.warn('[ODDS] The Odds API fetch failed:', err?.message || err);
      // Don't try fallback if we timed out - just return empty
      if (err.name === 'AbortError') {
        console.warn('[ODDS] Timeout reached, returning empty odds to avoid function timeout');
        return [];
      }
    }
  } else {
    console.warn('[ODDS] Missing ODDS_API_KEY, skipping direct The Odds API fetch');
  }

  // Fallback: Use internal aggregator (only if primary didn't timeout)
  try {
    console.log('[ODDS] Fallback: fetching from internal nfl-odds-get');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Even shorter 3 second timeout for fallback
    
    const oddsRes = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-odds-get?regions=us&markets=h2h,spreads,totals', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!oddsRes.ok) throw new Error(`Fallback odds endpoint failed: ${oddsRes.status}`);
    const oddsResponse = await oddsRes.json();
    const oddsData = oddsResponse.games || oddsResponse || [];
    console.log(`[ODDS] Fallback loaded ${oddsData.length} games`);
    return oddsData;
  } catch (fallbackErr) {
    console.error('[ODDS] Fallback failed:', fallbackErr?.message || fallbackErr);
    return []; // Return empty array - predictions can still generate without odds
  }
}

// v8 WORKING ODDS: Find odds for a specific game (proven working)
function findGameOdds(allOdds, homeTeam, awayTeam) {
  const homeTeamFull = TEAM_NAME_MAPPING[homeTeam] || homeTeam;
  const awayTeamFull = TEAM_NAME_MAPPING[awayTeam] || awayTeam;
  
  console.log(`Searching for: ${awayTeamFull} @ ${homeTeamFull}`);
  
  const found = allOdds.find(odds => 
    odds.home_team === homeTeamFull && odds.away_team === awayTeamFull
  );
  
  console.log(`Match found: ${!!found}`);
  return found;
}

// Book priority for display consistency  
const BOOK_PRIORITY = ['FanDuel', 'DraftKings', 'BetMGM', 'Caesars', 'ESPNBet', 'Fanatics'];

// NEW: Extract structured odds with display vs best separation
function extractStructuredOdds(gameOdds, modelPicks) {
  if (!gameOdds) return { display: null, best: {}, all_books: {} };
  
  const bookmakers = gameOdds.bookmakers || [];
  if (bookmakers.length === 0) return { display: null, best: {}, all_books: {} };
  
  // BOOK FILTER: Audit incoming books and normalize names
  const rawBookNames = bookmakers.map(b => b.title);
  auditBooks(rawBookNames.map(n => ({ book: n })), 'extractStructuredOdds');
  
  const timestamp = new Date().toISOString();
  const all_books = {};
  
  // Extract all bookmaker data (ALLOWED BOOKS ONLY)
  bookmakers.forEach(book => {
    const rawBookName = book.title;
    const bookName = canonicalBookName(rawBookName);
    
    // FILTER: Skip disallowed books
    if (!isBookAllowed(bookName)) {
      console.log(`⛔ [BOOK_FILTER] Skipping disallowed book: ${rawBookName} → ${bookName}`);
      return; // Skip this book
    }
    
    const bookData = { bookmaker: bookName };
    
    if (book.markets) {
      // Extract H2H (moneyline)
      const h2hMarket = book.markets.find(m => m.key === 'h2h');
      if (h2hMarket) {
        const homeOutcome = h2hMarket.outcomes.find(o => o.name === gameOdds.home_team);
        const awayOutcome = h2hMarket.outcomes.find(o => o.name === gameOdds.away_team);
        bookData.h2h = {
          home: homeOutcome?.price || null,
          away: awayOutcome?.price || null,
          home_link: homeOutcome?.link || null,
          away_link: awayOutcome?.link || null,
          ts: timestamp
        };
      }
      
      // Extract spreads
      const spreadMarket = book.markets.find(m => m.key === 'spreads');
      if (spreadMarket) {
        const homeOutcome = spreadMarket.outcomes.find(o => o.name === gameOdds.home_team);
        const awayOutcome = spreadMarket.outcomes.find(o => o.name === gameOdds.away_team);
        bookData.spread = {
          home_line: homeOutcome?.point || 0,
          home_price: homeOutcome?.price || -110,
          home_link: homeOutcome?.link || null,
          away_line: awayOutcome?.point || 0,
          away_price: awayOutcome?.price || -110,
          away_link: awayOutcome?.link || null,
          ts: timestamp
        };
      }
      
      // Extract totals
      const totalMarket = book.markets.find(m => m.key === 'totals');
      if (totalMarket) {
        const overOutcome = totalMarket.outcomes.find(o => o.name === 'Over');
        const underOutcome = totalMarket.outcomes.find(o => o.name === 'Under');
        bookData.total = {
          over: { line: overOutcome?.point || 0, price: overOutcome?.price || -110, link: overOutcome?.link || null },
          under: { line: underOutcome?.point || 0, price: underOutcome?.price || -110, link: underOutcome?.link || null },
          ts: timestamp
        };
      }
    }
    
    all_books[bookName] = bookData;
  });
  
  // Select display book (consistent UI) - ALLOWED BOOKS ONLY
  let displayBook = null;
  for (const priorityBook of PRIORITY_BOOK_ORDER) {
    if (all_books[priorityBook]) {
      displayBook = all_books[priorityBook];
      console.log(`📊 [DISPLAY] Using priority book: ${priorityBook}`);
      break;
    }
  }
  
  // Fallback to first available allowed book
  if (!displayBook && Object.keys(all_books).length > 0) {
    displayBook = Object.values(all_books)[0];
    console.log(`📊 [DISPLAY] Fallback to first available: ${displayBook.bookmaker}`);
  }
  
  // Find best book for each market based on model picks
  const best = {};
  
  // Best moneyline book
  if (modelPicks.mlPick && modelPicks.mlPick !== 'push') {
    const isHomePick = modelPicks.mlPick === 'home';
    let bestMLBook = null;
    let bestMLPrice = isHomePick ? -1000 : 0; // Worst possible starting point
    
    Object.entries(all_books).forEach(([bookName, book]) => {
      if (book.h2h) {
        const priceForPick = isHomePick ? book.h2h.home : book.h2h.away;
        if (priceForPick !== null) {
          const isBetter = isHomePick ? 
            (priceForPick > bestMLPrice) : // For favorites, higher (less negative) is better
            (priceForPick > bestMLPrice);   // For underdogs, higher (more positive) is better
          
          if (isBetter) {
            bestMLPrice = priceForPick;
            bestMLBook = bookName;
          }
        }
      }
    });
    
    if (bestMLBook) {
      const bestBookData = all_books[bestMLBook];
      
      best.h2h = {
        bookmaker: bestMLBook,
        pick_side: isHomePick ? 'home' : 'away',
        price: bestMLPrice,
        ts: timestamp
      };
    }
  }
  
  // Best spread book
  if (modelPicks.spreadPick && modelPicks.spreadPick !== 'push') {
    const teamPick = modelPicks.spreadPick; // Team abbreviation
    const isHomePick = teamPick === gameOdds.home_team;
    let bestSpreadBook = null;
    let bestSpreadLine = isHomePick ? -50 : 50; // Worst possible starting point
    let bestSpreadPrice = -200;
    
    Object.entries(all_books).forEach(([bookName, book]) => {
      if (book.spread) {
        const lineForPick = isHomePick ? book.spread.home_line : book.spread.away_line;
        const priceForPick = isHomePick ? book.spread.home_price : book.spread.away_price;
        
        if (lineForPick !== null) {
          // More favorable line logic: if backing favorite, want smaller spread; if backing dog, want bigger spread
          const lineIsBetter = lineForPick > bestSpreadLine; // This works for both cases
          const lineIsSame = Math.abs(lineForPick - bestSpreadLine) < 0.1;
          const priceIsBetter = priceForPick > bestSpreadPrice;
          
          if (lineIsBetter || (lineIsSame && priceIsBetter)) {
            bestSpreadLine = lineForPick;
            bestSpreadPrice = priceForPick;
            bestSpreadBook = bookName;
          }
        }
      }
    });
    
    if (bestSpreadBook) {
      const bestBookData = all_books[bestSpreadBook];
      
      best.spread = {
        bookmaker: bestSpreadBook,
        pick_side: isHomePick ? 'home' : 'away',
        line: bestSpreadLine,
        price: bestSpreadPrice,
        ts: timestamp
      };
    }
  }
  
  // Best total book
  if (modelPicks.totalPick && modelPicks.totalPick !== 'push') {
    const isOverPick = modelPicks.totalPick === 'over';
    let bestTotalBook = null;
    let bestTotalLine = isOverPick ? 100 : 0; // Worst possible starting point
    let bestTotalPrice = -200;
    
    Object.entries(all_books).forEach(([bookName, book]) => {
      if (book.total) {
        const targetOutcome = isOverPick ? book.total.over : book.total.under;
        if (targetOutcome.line !== null) {
          // For Over: want lowest line; For Under: want highest line
          const lineIsBetter = isOverPick ? 
            (targetOutcome.line < bestTotalLine) :
            (targetOutcome.line > bestTotalLine);
          const lineIsSame = Math.abs(targetOutcome.line - bestTotalLine) < 0.1;
          const priceIsBetter = targetOutcome.price > bestTotalPrice;
          
          if (lineIsBetter || (lineIsSame && priceIsBetter)) {
            bestTotalLine = targetOutcome.line;
            bestTotalPrice = targetOutcome.price;
            bestTotalBook = bookName;
          }
        }
      }
    });
    
    if (bestTotalBook) {
      const bestBookData = all_books[bestTotalBook];
      const targetOutcome = isOverPick ? bestBookData.total?.over : bestBookData.total?.under;
      
      best.total = {
        bookmaker: bestTotalBook,
        pick_side: isOverPick ? 'over' : 'under',
        line: bestTotalLine,
        price: bestTotalPrice,
        ts: timestamp
      };
    }
  }
  
  return {
    source_snapshot_at: timestamp,
    display: displayBook,
    best: best,
    all_books: all_books
  };
}

// LEGACY: Keep old function for backwards compatibility during transition
function extractOddsData(gameOdds) {
  if (!gameOdds) return {};
  
  // Your API returns both structures - use the working one
  let markets = {};
  
  if (gameOdds.markets) {
    // Direct markets structure (this is what works)
    markets = gameOdds.markets;
    console.log('Using direct markets structure');
  } else if (gameOdds.bookmakers?.[0]?.markets) {
    // Fallback to bookmaker structure  
    const primaryBook = gameOdds.bookmakers[0];
    primaryBook.markets.forEach(market => {
      markets[market.key] = market.outcomes || [];
    });
    console.log('Using bookmaker structure fallback');
  } else {
    console.warn('No markets found in odds data');
    return {};
  }
  
  // Extract moneyline
  const h2hMarket = markets.h2h || [];
  const homeMLOutcome = h2hMarket.find(o => o.name === gameOdds.home_team);
  const awayMLOutcome = h2hMarket.find(o => o.name === gameOdds.away_team);
  
  // Extract spread
  const spreadsMarket = markets.spreads || [];
  const homeSpreadOutcome = spreadsMarket.find(o => o.name === gameOdds.home_team);
  const awaySpreadOutcome = spreadsMarket.find(o => o.name === gameOdds.away_team);
  
  let favoriteTeam = null;
  let favoriteSpread = null;
  
  if (homeSpreadOutcome && homeSpreadOutcome.point < 0) {
    favoriteTeam = 'home';
    favoriteSpread = homeSpreadOutcome.point;
  } else if (awaySpreadOutcome && awaySpreadOutcome.point < 0) {
    favoriteTeam = 'away';
    favoriteSpread = awaySpreadOutcome.point;
  } else {
    favoriteSpread = homeSpreadOutcome?.point || awaySpreadOutcome?.point || 0;
  }
  
  // Extract total
  const totalsMarket = markets.totals || [];
  const totalOutcome = totalsMarket[0];
  
  const result = {
    ml_home: homeMLOutcome?.price,
    ml_away: awayMLOutcome?.price,
    spread_line: favoriteSpread,
    spread_favorite: favoriteTeam,
    total_line: totalOutcome?.point,
    _extraction_success: !!(homeMLOutcome && awayMLOutcome && favoriteSpread !== null && totalOutcome)
  };
  
  console.log('Odds extraction result:', result);
  return result;
}

// v13 LOGIC: Generate parlay components
async function generateParlayComponents(games, predictions) {
  const components = [];
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const pred = predictions[i];
    
    const mlPick = pred.predictions.moneyline;
    const spreadPick = pred.predictions.spread;
    const totalPick = pred.predictions.total;
    
    if (mlPick.confidence >= 65 && mlPick.edge >= 10) {
      const availabilityData = {
        totalImpact: (pred.modelEnhancements?.injuryAnalysis?.home?.totalImpact || 0) + 
                     (pred.modelEnhancements?.injuryAnalysis?.away?.totalImpact || 0),
        minConfidence: Math.min(
          pred.modelEnhancements?.injuryAnalysis?.home?.confidence || 1.0,
          pred.modelEnhancements?.injuryAnalysis?.away?.confidence || 1.0
        )
      };
      const sanityCheck = pred.predictions?.elite?.sanityCheck || null;
      const mlOdds = pred.odds?.moneyline?.pick_odds || null;
      let unitInfo = calculateRecommendedUnits(mlPick.confidence, mlPick.edge, 'moneyline', availabilityData, sanityCheck, mlOdds);
      
      // PHASE 2: Apply line movement gates (with safe defaults)
      const gameId = game.game_id || `${game.away_team}_${game.home_team}`;
      const pickSide = mlPick.pick === game.home_team ? 'home' : 'away';
      
      // Safe defaults - never undefined
      let gateResult = { pass: true, reason: 'no_gates_applied', metadata: {} };
      let sizingResult = { 
        final_units: unitInfo.units, 
        reasons: ['base_kelly_units'], 
        metrics: null,
        multiplier: 1.0
      };
      
      try {
        const g = await applyPreBetGates({ market: 'moneyline', pick: pickSide }, gameId);
        if (g && typeof g.pass === 'boolean') {
          gateResult = g;
          
          if (!gateResult.pass) {
            console.log(`🚫 [GATES] Blocking ML pick for ${gameId}: ${gateResult.reason}`);
            continue; // Skip this pick
          }
        }
      } catch (gateError) {
        console.warn('[GATE_ERROR]', gameId, 'moneyline', String(gateError));
      }
      
      try {
        const s = await applyLineMovementSizingModifiers({ market: 'moneyline', pick: pickSide }, gameId, unitInfo.units);
        if (s && Number.isFinite(s.final_units)) {
          sizingResult = s;
          console.log(`📏 [SIZING] ML pick ${gameId}: ${unitInfo.units.toFixed(2)}U → ${sizingResult.final_units.toFixed(2)}U (${sizingResult.reasons.join(', ')})`);
        }
      } catch (sizingError) {
        console.warn('[SIZING_ERROR]', gameId, 'moneyline', String(sizingError));
      }
      
      components.push({
        gameId,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'moneyline',
        pick: mlPick.pick,
        confidence: mlPick.confidence,
        edge: mlPick.edge,
        description: `${mlPick.pick} ML`,
        odds: pred.odds?.moneyline?.pick_odds || null,
        ev_score: (mlPick.confidence - 50) * mlPick.edge,
        recommended_units: Math.max(0, Number(sizingResult?.final_units) || unitInfo.units),
        unit_tier: unitInfo.tier,
        unit_reasoning: sizingResult?.reasons?.length > 0 
          ? `${unitInfo.reasoning} | ${sizingResult.reasons.join(', ')}`
          : unitInfo.reasoning,
        line_movement: sizingResult?.metrics || null,
        gate_result: gateResult?.reason || 'no_gates_applied'
      });
    }
    
    if (spreadPick.confidence >= 62 && spreadPick.edge >= 1.5 && spreadPick.pick !== 'push') {
      const availabilityData = {
        totalImpact: (pred.modelEnhancements?.injuryAnalysis?.home?.totalImpact || 0) + 
                     (pred.modelEnhancements?.injuryAnalysis?.away?.totalImpact || 0),
        minConfidence: Math.min(
          pred.modelEnhancements?.injuryAnalysis?.home?.confidence || 1.0,
          pred.modelEnhancements?.injuryAnalysis?.away?.confidence || 1.0
        )
      };
      const sanityCheck = pred.predictions?.elite?.sanityCheck || null;
      let unitInfo = calculateRecommendedUnits(spreadPick.confidence, spreadPick.edge, 'straight', availabilityData, sanityCheck);
      
      // PHASE 2: Apply line movement gates (with safe defaults)
      const gameId = game.game_id || `${game.away_team}_${game.home_team}`;
      const pickSide = spreadPick.pick === game.home_team ? 'home' : 'away';
      
      // Safe defaults
      let gateResult = { pass: true, reason: 'no_gates_applied', metadata: {} };
      let sizingResult = { 
        final_units: unitInfo.units, 
        reasons: ['base_kelly_units'], 
        metrics: null,
        multiplier: 1.0
      };
      
      try {
        const g = await applyPreBetGates({ market: 'spread', pick: pickSide }, gameId);
        if (g && typeof g.pass === 'boolean') {
          gateResult = g;
          if (!gateResult.pass) {
            console.log(`🚫 [GATES] Blocking spread pick for ${gameId}: ${gateResult.reason}`);
            continue;
          }
        }
      } catch (gateError) {
        console.warn('[GATE_ERROR]', gameId, 'spread', String(gateError));
      }
      
      try {
        const s = await applyLineMovementSizingModifiers({ market: 'spread', pick: pickSide }, gameId, unitInfo.units);
        if (s && Number.isFinite(s.final_units)) {
          sizingResult = s;
          console.log(`📏 [SIZING] Spread pick ${gameId}: ${unitInfo.units.toFixed(2)}U → ${sizingResult.final_units.toFixed(2)}U (${sizingResult.reasons.join(', ')})`);
        }
      } catch (sizingError) {
        console.warn('[SIZING_ERROR]', gameId, 'spread', String(sizingError));
      }
      
      components.push({
        gameId,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'spread',
        pick: spreadPick.pick,
        confidence: spreadPick.confidence,
        edge: spreadPick.edge,
        description: `${spreadPick.pick} ${spreadPick.line >= 0 ? '+' : ''}${spreadPick.line}`,
        odds: pred.odds?.spread?.pick_odds || null,
        ev_score: (spreadPick.confidence - 50) * spreadPick.edge,
        recommended_units: Math.max(0, Number(sizingResult?.final_units) || unitInfo.units),
        unit_tier: unitInfo.tier,
        unit_reasoning: sizingResult?.reasons?.length > 0 
          ? `${unitInfo.reasoning} | ${sizingResult.reasons.join(', ')}`
          : unitInfo.reasoning,
        line_movement: sizingResult?.metrics || null,
        gate_result: gateResult?.reason || 'no_gates_applied'
      });
    }
    
    if (totalPick.confidence >= 60 && totalPick.edge >= 2.5) {
      const availabilityData = {
        totalImpact: (pred.modelEnhancements?.injuryAnalysis?.home?.totalImpact || 0) + 
                     (pred.modelEnhancements?.injuryAnalysis?.away?.totalImpact || 0),
        minConfidence: Math.min(
          pred.modelEnhancements?.injuryAnalysis?.home?.confidence || 1.0,
          pred.modelEnhancements?.injuryAnalysis?.away?.confidence || 1.0
        )
      };
      const sanityCheck = pred.predictions?.elite?.sanityCheck || null;
      let unitInfo = calculateRecommendedUnits(totalPick.confidence, totalPick.edge, 'straight', availabilityData, sanityCheck);
      
      // PHASE 2: Apply line movement gates (with safe defaults)
      const gameId = game.game_id || `${game.away_team}_${game.home_team}`;
      const pickSide = totalPick.pick === 'over' ? 'over' : 'under';
      
      // Safe defaults
      let gateResult = { pass: true, reason: 'no_gates_applied', metadata: {} };
      let sizingResult = { 
        final_units: unitInfo.units, 
        reasons: ['base_kelly_units'], 
        metrics: null,
        multiplier: 1.0
      };
      
      try {
        const g = await applyPreBetGates({ market: 'total', pick: pickSide }, gameId);
        if (g && typeof g.pass === 'boolean') {
          gateResult = g;
          if (!gateResult.pass) {
            console.log(`🚫 [GATES] Blocking total pick for ${gameId}: ${gateResult.reason}`);
            continue;
          }
        }
      } catch (gateError) {
        console.warn('[GATE_ERROR]', gameId, 'total', String(gateError));
      }
      
      try {
        const s = await applyLineMovementSizingModifiers({ market: 'total', pick: pickSide }, gameId, unitInfo.units);
        if (s && Number.isFinite(s.final_units)) {
          sizingResult = s;
          console.log(`📏 [SIZING] Total pick ${gameId}: ${unitInfo.units.toFixed(2)}U → ${sizingResult.final_units.toFixed(2)}U (${sizingResult.reasons.join(', ')})`);
        }
      } catch (sizingError) {
        console.warn('[SIZING_ERROR]', gameId, 'total', String(sizingError));
      }
      
      components.push({
        gameId,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'total',
        pick: totalPick.pick,
        confidence: totalPick.confidence,
        edge: totalPick.edge,
        description: `${totalPick.pick.toUpperCase()} ${totalPick.line}`,
        odds: null,
        ev_score: (totalPick.confidence - 50) * totalPick.edge * 0.8,
        recommended_units: Math.max(0, Number(sizingResult?.final_units) || unitInfo.units),
        unit_tier: unitInfo.tier,
        unit_reasoning: sizingResult?.reasons?.length > 0 
          ? `${unitInfo.reasoning} | ${sizingResult.reasons.join(', ')}`
          : unitInfo.reasoning,
        line_movement: sizingResult?.metrics || null,
        gate_result: gateResult?.reason || 'no_gates_applied'
      });
    }
  }
  
  components.sort((a, b) => b.ev_score - a.ev_score);
  return components;
}

// Kelly Hybrid Staking Integration
function calculateRecommendedUnits(confidence, edge, betType = 'straight', availabilityData = null, sanityCheck = null, marketOdds = null) {
  // For parlays, always use small units
  if (betType === 'parlay') {
    return edge >= 8 ? 0.5 : 0.25;
  }
  
  // Build signals for Kelly from availability data
  const signals = {
    edgePct: edge,
    clvPts: 0, // TODO: Add CLV tracking
    lineMoveToward: 0, // TODO: Add line movement tracking
    ticketsPct: 50, // TODO: Add public betting data
    handlePct: 50,
    availabilityConf: availabilityData?.minConfidence || 0.85,
    marketShockActive: false,
    injurySwingPts: Math.abs(availabilityData?.totalImpact || 0),
    injuryConfirmedHours: 24,
    modelCalibration: 0.85, // TODO: Track model calibration
    backtestRoi: 0, // TODO: Track backtest ROI
    primetimeGame: false
  };
  
  try {
    // Convert confidence % to probability
    const edgeProb = confidence / 100;
    // Assume -110 odds (1.909 decimal) or use actual odds if available
    let priceDec = 1.909;
    if (marketOdds !== null) {
      priceDec = marketOdds > 0 
        ? (marketOdds / 100) + 1 
        : (100 / Math.abs(marketOdds)) + 1;
    }
    
    let kellyResult = recommendUnits(edgeProb, priceDec, signals, 10, betType);
    
    // NEW RULE: Apply reduced Kelly fractions for moneylines
    // 0.25× Kelly for ≤ −300, 0.30× Kelly for others
    if (betType === 'moneyline' && marketOdds !== null) {
      const originalUnits = kellyResult.units;
      const kellyFraction = marketOdds <= -300 ? 0.25 : 0.30;
      kellyResult.units *= kellyFraction;
      console.log(`📊 ML Kelly adjustment (${kellyFraction}×): ${originalUnits.toFixed(2)}U → ${kellyResult.units.toFixed(2)}U`);
      kellyResult.reasoning = (kellyResult.reason || '') + ` | ML ${kellyFraction}× Kelly`;
    }
    
    // SAFEGUARD: Apply 35% haircut if sanity check alert fires
    if (sanityCheck?.alert) {
      const originalUnits = kellyResult.units;
      kellyResult.units *= 0.65; // 35% reduction for outliers
      console.log(`🚨 Sanity alert haircut: ${originalUnits.toFixed(2)}U → ${kellyResult.units.toFixed(2)}U`);
      kellyResult.reasoning = (kellyResult.reason || '') + ' | Reduced 35% (sanity alert)';
    }
    
    console.log(`📊 Kelly recommendation: ${kellyResult.units}U (${kellyResult.recommendation})`);
    
    return {
      units: kellyResult.units,
      tier: kellyResult.recommendation,
      reasoning: kellyResult.reasoning || kellyResult.reason || 'Kelly hybrid staking',
      kellyAudit: kellyResult.audit
    };
  } catch (error) {
    console.error('⚠️ Kelly error, using fallback:', error.message);
    // Fallback to simple thresholds
    let units;
    let tier;
    let reasoning;
    
    if (confidence >= 65 && edge >= 8) {
      units = 1.5;
      tier = 'premium';
      reasoning = '65%+ conf, 8%+ edge (fallback)';
    } else if (confidence >= 61 && edge >= 5) {
      units = 1.0;
      tier = 'strong';
      reasoning = '61-64% conf, 5-7% edge (fallback)';
    } else if (confidence >= 58 && edge >= 2) {
      units = 0.5;
      tier = 'value';
      reasoning = '58-60% conf, 2-4% edge (fallback)';
    } else {
      units = 1.0;
      tier = 'standard';
      reasoning = 'flat unit (fallback)';
    }
    
    // Apply moneyline Kelly fraction to fallback too
    if (betType === 'moneyline' && marketOdds !== null) {
      const kellyFraction = marketOdds <= -300 ? 0.25 : 0.30;
      units *= kellyFraction;
      reasoning += ` | ML ${kellyFraction}× Kelly`;
    }
    
    // Apply sanity haircut to fallback too
    if (sanityCheck?.alert) {
      units *= 0.65;
      reasoning += ' | Reduced 35% (sanity alert)';
    }
    
    return { units, tier, reasoning };
  }
}

function generateResponsibleParlays(components) {
  if (components.length < 2) {
    return [{
      type: "insufficient_data",
      legs: [],
      description: "Not enough high-confidence picks for parlay suggestions",
      risk_level: "N/A",
      recommended_unit: 0
    }];
  }
  
  const parlays = [];
  
  // Only use premium picks: ≥60% confidence AND ≥5% edge for parlays
  const premiumComponents = components.filter(c => 
    c.confidence >= 60 && c.ev_score >= 5
  );
  
  if (premiumComponents.length < 2) {
    return [{
      type: "insufficient_premium_data",
      legs: [],
      description: "No premium picks (≥60% conf + ≥5% edge) available for safe parlays",
      risk_level: "N/A",
      recommended_unit: 0,
      note: "Stick to straight bets - parlay conditions not met"
    }];
  }
  
  // FIRST: Generate 2 x 2-leg parlays (fixed)
  const topPremium = premiumComponents.slice(0, Math.min(6, premiumComponents.length));
  for (let i = 0; i < topPremium.length - 1 && parlays.length < 2; i++) {
    for (let j = i + 1; j < topPremium.length && parlays.length < 2; j++) {
      if (topPremium[i].gameId !== topPremium[j].gameId) {
        const avgConf = (topPremium[i].confidence + topPremium[j].confidence) / 2;
        const avgEdge = (topPremium[i].ev_score + topPremium[j].ev_score) / 2;
        
        parlays.push({
          type: "premium_2leg",
          legs: [topPremium[i], topPremium[j]],
          avg_confidence: avgConf,
          avg_edge: avgEdge,
          combined_ev: topPremium[i].ev_score + topPremium[j].ev_score,
          risk_level: "MODERATE",
          recommended_unit: avgEdge >= 8 ? 0.5 : 0.25,
          description: `${topPremium[i].description} + ${topPremium[j].description}`,
          note: "2-leg parlay (mix of ML/spread/total)"
        });
      }
    }
  }
  
  // SECOND: Generate 3 x smart logic parlays (variable legs)
  if (premiumComponents.length >= 3) {
    let smartParlayCount = 0;
    
    // 3-leg parlay if we have 4-6 premium picks
    if (premiumComponents.length >= 4 && smartParlayCount < 3) {
      const legs = premiumComponents.slice(0, 3).filter((c, idx, arr) => 
        arr.findIndex(x => x.gameId === c.gameId) === idx // unique games only
      );
      
      if (legs.length === 3) {
        const avgConf = legs.reduce((sum, c) => sum + c.confidence, 0) / 3;
        const avgEdge = legs.reduce((sum, c) => sum + c.ev_score, 0) / 3;
        
        parlays.push({
          type: "smart_3leg",
          legs: legs,
          avg_confidence: avgConf,
          avg_edge: avgEdge,
          combined_ev: legs.reduce((sum, c) => sum + c.ev_score, 0),
          risk_level: "HIGH",
          recommended_unit: 0.2,
          description: legs.map(c => c.description).join(" + "),
          note: "Smart 3-leg (auto-selected)"
        });
        smartParlayCount++;
      }
    }
    
    // Fill remaining smart slots with additional combinations
    while (smartParlayCount < 3 && premiumComponents.length >= 3) {
      const startIdx = smartParlayCount;
      let legs;
      
      if (premiumComponents.length >= 6 && smartParlayCount === 1) {
        // 4-leg parlay for second smart slot if enough picks
        legs = premiumComponents.slice(0, 4).filter((c, idx, arr) => 
          arr.findIndex(x => x.gameId === c.gameId) === idx
        ).slice(0, 4);
      } else {
        // 3-leg variations for remaining slots
        legs = premiumComponents.slice(startIdx, startIdx + 3).filter((c, idx, arr) => 
          arr.findIndex(x => x.gameId === c.gameId) === idx
        );
      }
      
      if (legs.length >= 2) {
        const finalLegs = legs.slice(0, Math.min(legs.length, 4));
        const avgConf = finalLegs.reduce((sum, c) => sum + c.confidence, 0) / finalLegs.length;
        const avgEdge = finalLegs.reduce((sum, c) => sum + c.ev_score, 0) / finalLegs.length;
        
        parlays.push({
          type: `smart_${finalLegs.length}leg`,
          legs: finalLegs,
          avg_confidence: avgConf,
          avg_edge: avgEdge,
          combined_ev: finalLegs.reduce((sum, c) => sum + c.ev_score, 0),
          risk_level: finalLegs.length >= 3 ? "HIGH" : "MODERATE",
          recommended_unit: finalLegs.length >= 4 ? 0.1 : (finalLegs.length === 3 ? 0.15 : 0.2),
          description: finalLegs.map(c => c.description).join(" + "),
          note: `Smart ${finalLegs.length}-leg (ML/spread/total mix)`
        });
        smartParlayCount++;
      } else {
        break;
      }
    }
  }
  
  // Sort by combined EV and return max 5 parlays (2 fixed 2-leg + 3 smart)
  parlays.sort((a, b) => b.combined_ev - a.combined_ev);
  return parlays.slice(0, 5);
}

// MAIN PREDICTION FUNCTION: v13 Logic + v8 Odds Integration
async function generateAdvancedPredictions(games, season, weekOverride = null) {
  const perfStart = Date.now();
  console.log('=== v13 LOGIC + v8 WORKING ODDS INTEGRATION (WITH PERFORMANCE OPTIMIZATIONS) ===');
  
  let advancedMetrics = null;
  let injuries = null;
  let currentWeek = weekOverride || 1;
  
  // ========================================
  // STAGE 1: LOAD METRICS (WITH CACHING)
  // ========================================
  const metricsStart = Date.now();
  try {
    // Check cache first
    if (moduleCache.advancedMetrics.data && isCacheValid(moduleCache.advancedMetrics)) {
      console.log('📦 Using cached advanced metrics');
      advancedMetrics = moduleCache.advancedMetrics.data;
    } else {
      console.log('🔄 Loading fresh advanced metrics');
      advancedMetrics = await loadAdvancedMetrics(season);
      moduleCache.advancedMetrics.data = advancedMetrics;
      moduleCache.advancedMetrics.loadedAt = Date.now();
    }
    
    // Determine current week
    if (!weekOverride) {
      try {
        currentWeek = getCurrentWeek(advancedMetrics);
        console.log(`📅 Current week detected: ${currentWeek}`);
      } catch (e) {
        console.warn('Could not determine current week from metrics, defaulting to 1');
        currentWeek = 1;
      }
    } else {
      console.log(`📅 Using overridden week: ${weekOverride}`);
    }
  } catch (error) {
    console.warn('Enhanced metrics loading failed:', error);
  }
  console.log(`⏱️ Metrics loaded in ${Date.now() - metricsStart}ms`);
  
  // ========================================
  // STAGE 2: LOAD INJURIES (WITH CACHING)
  // ========================================
  const injuriesStart = Date.now();
  try {
    // Check cache first
    if (moduleCache.injuries.data && isCacheValid(moduleCache.injuries)) {
      console.log('📦 Using cached injuries');
      injuries = moduleCache.injuries.data;
    } else {
      console.log('🔄 Loading fresh injuries');
      injuries = await loadInjuries();
      moduleCache.injuries.data = injuries;
      moduleCache.injuries.loadedAt = Date.now();
    }
    
    // **Update injury duration tracking ONCE per request (not per game)**
    // SKIP for GET requests to avoid write operations
    const isGetRequest = typeof saveToBlobs !== 'undefined' && !saveToBlobs;
    if (injuries && injuries.teams && Object.keys(injuries.teams).length > 0 && isGetRequest) {
      console.log('⏭️  Skipping injury duration update for GET request (read-only mode)');
    } else if (injuries && injuries.teams && Object.keys(injuries.teams).length > 0) {
      console.log('🔄 Updating injury duration tracking (once per request)...');
      await updateInjuryDurations(injuries, currentWeek);
    }
    
    console.log('🔥 INJURY DEBUG - Loaded injuries:', {
      injuriesIsNull: injuries === null,
      injuriesType: typeof injuries,
      hasTeams: !!(injuries && injuries.teams),
      teamCount: injuries && injuries.teams ? Object.keys(injuries.teams).length : 0
    });
  } catch (error) {
    console.warn('Injuries loading failed:', error);
  }
  console.log(`⏱️ Injuries loaded in ${Date.now() - injuriesStart}ms`);

  // ========================================
  // STAGE 3: PRE-LOAD DEPTH CHARTS
  // ========================================
  const depthChartsStart = Date.now();
  const weeksToLoad = currentWeek > 1 ? [currentWeek, currentWeek - 1] : [currentWeek];
  const depthChartsMap = await loadDepthChartsForWeeks(weeksToLoad, season);
  console.log(`⏱️ Depth charts loaded in ${Date.now() - depthChartsStart}ms`);

  const validMetrics = validateAdvancedMetrics(advancedMetrics);
  
  if (!validMetrics) {
    return {
      predictions: games.map(game => ({
        ...game,
        predictions: {
          home_win_prob: 0.5, away_win_prob: 0.5,
          moneyline: { pick: null, confidence: 50, edge: 0 },
          spread: { pick: null, confidence: 50, line: null, predicted: null, edge: 0 },
          total: { pick: null, confidence: 50, line: null, predicted: null, edge: 0 }
        },
        modelEnhancements: { version: 'v13_logic_v8_odds_hybrid', notes: ["Metrics unavailable"] }
      })),
      parlaySuggestions: [{
        type: "no_data",
        legs: [],
        description: "No data available for parlay suggestions",
        risk_level: "N/A",
        recommended_unit: 0
      }]
    };
  }

  const league = advancedMetrics?.league || { means: {}, stds: {} };
  
  // ========================================
  // STAGE 4: LOAD ODDS (WITH TIME FILTER)
  // ========================================
  const oddsStart = Date.now();
  const allOdds = await loadLiveOddsForGames(games);
  console.log(`⏱️ Odds loaded in ${Date.now() - oddsStart}ms`);

  console.log(`v13 logic + v8 odds: Processing ${games.length} games with working odds integration`);

  // ========================================
  // STAGE 5: PROCESS GAMES (WITH CONCURRENCY LIMIT)
  // ========================================
  const gamesStart = Date.now();
  const predictions = await processGamesWithConcurrencyLimit(games, 5, async (game) => {
    const homeCode = game.home_team;
    const awayCode = game.away_team;

    console.log(`\n=== HYBRID PREDICTION: ${awayCode} @ ${homeCode} ===`);

    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);
    const contextWeights = calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics);
    const matchups = calculateMatchups(homeMetrics, awayMetrics, league);

    // v13 LOGIC: Enhanced team scoring with all fixes
    let homeScoreData = scoreTeamFromFeatures(homeMetrics, league, contextWeights, matchups?.home, true, currentWeek, awayMetrics, homeCode);
    let awayScoreData = scoreTeamFromFeatures(awayMetrics, league, contextWeights, matchups?.away, false, currentWeek, homeMetrics, awayCode);

    // v4.1 PRODUCTION SAFEGUARDS: Apply EPA filtering before injury adjustments
    console.log(`🛡️ SAFEGUARDS v4.1: Applying EPA filters and depth chart validation`);
    const epaFilterResults = applySituationalEPAFilters(homeMetrics, awayMetrics, game);
    
    if (injuries) {
      console.log(`🔥 APPLYING CANONICAL AVAILABILITY for ${awayCode} @ ${homeCode}, Week ${currentWeek}`);
      // Debug snapshot of normalized injury shape per team (once per game)
      const homeInj = injuries.teams?.[homeCode];
      const awayInj = injuries.teams?.[awayCode];
      if (homeInj) {
        console.log('🩺 HOME injury snapshot:', {
          qb_name: homeInj.qb_name,
            qb_status: homeInj.qb_status,
            rb_injuries: homeInj.rb_injuries?.length || 0,
            wr_injuries: homeInj.wr_injuries?.length || 0,
            te_injuries: homeInj.te_injuries?.length || 0,
            normalized: homeInj._normalized_legacy_fields === true
        });
      }
      if (awayInj) {
        console.log('🩺 AWAY injury snapshot:', {
          qb_name: awayInj.qb_name,
            qb_status: awayInj.qb_status,
            rb_injuries: awayInj.rb_injuries?.length || 0,
            wr_injuries: awayInj.wr_injuries?.length || 0,
            te_injuries: awayInj.te_injuries?.length || 0,
            normalized: awayInj._normalized_legacy_fields === true
        });
      }
      // Apply injury adjustments (will use preloaded depth charts internally via closure)
      homeScoreData = await applyInjuryAdjustments(homeScoreData, homeCode, injuries, currentWeek, depthChartsMap);
      awayScoreData = await applyInjuryAdjustments(awayScoreData, awayCode, injuries, currentWeek, depthChartsMap);
      
      // v4.1 SAFEGUARDS: Apply depth chart safeguards to injury impacts
      if (homeScoreData.injuryAnalysis?.adjustments?.length > 0) {
        const homeSafeguards = applyDepthChartSafeguards(
          homeScoreData.injuryAnalysis.adjustments,
          injuries,
          { team: homeCode, gameId: game.game_id }
        );
        homeScoreData.injuryAnalysis.safeguardedAdjustments = homeSafeguards.safeguardedImpacts;
        homeScoreData.injuryAnalysis.safeguardWarnings = homeSafeguards.warnings;
        console.log(`🛡️ Home injury safeguards: ${homeSafeguards.warnings.length} warnings, ${homeSafeguards.summary.totalImpactReduction.toFixed(1)}% reduction`);
      }
      
      if (awayScoreData.injuryAnalysis?.adjustments?.length > 0) {
        const awaySafeguards = applyDepthChartSafeguards(
          awayScoreData.injuryAnalysis.adjustments,
          injuries,
          { team: awayCode, gameId: game.game_id }
        );
        awayScoreData.injuryAnalysis.safeguardedAdjustments = awaySafeguards.safeguardedImpacts;
        awayScoreData.injuryAnalysis.safeguardWarnings = awaySafeguards.warnings;
        console.log(`🛡️ Away injury safeguards: ${awaySafeguards.warnings.length} warnings, ${awaySafeguards.summary.totalImpactReduction.toFixed(1)}% reduction`);
      }
    } else {
      console.log(`❌ NO INJURIES APPLIED - injuries object is falsy:`, injuries);
    }

    const scoreDifference = homeScoreData.score - awayScoreData.score;
    
    // GPT SAFEGUARD: Defensive normalization to catch probability-like scores
    // Only trigger if scores look like win probabilities (0.3-0.7 range AND sum ~1.0)
    // Real team scores should be outside this range (typically -5 to +10 points)
    const looksLikeProbability = (home, away) => {
      if (typeof home !== 'number' || typeof away !== 'number') return false;
      if (home < 0 || away < 0 || home > 1 || away > 1) return false;
      const sum = home + away;
      const inProbRange = home >= 0.2 && home <= 0.8 && away >= 0.2 && away <= 0.8;
      const sumIsOne = Math.abs(sum - 1.0) < 0.1; // Allow small rounding error
      return inProbRange && sumIsOne;
    };
    
    const toPoints = (p) => 14 + (p - 0.5) * 40; // 0.5→14pts, 0.7→22pts, 0.3→6pts
    let probabilityNormalizationApplied = false;
    
    if (looksLikeProbability(homeScoreData.score, awayScoreData.score)) {
      console.log(`🚨 PROBABILITY→POINTS NORMALIZATION: ${homeCode} vs ${awayCode}`);
      console.log(`   Raw: Home=${homeScoreData.score.toFixed(4)}, Away=${awayScoreData.score.toFixed(4)}, Sum=${(homeScoreData.score + awayScoreData.score).toFixed(4)}`);
      const normalizedHomeScore = toPoints(homeScoreData.score);
      const normalizedAwayScore = toPoints(awayScoreData.score);
      console.log(`   Normalized: Home=${normalizedHomeScore.toFixed(2)}, Away=${normalizedAwayScore.toFixed(2)}`);
      probabilityNormalizationApplied = true;
      
      // Update scoreData objects with normalized values
      homeScoreData = { ...homeScoreData, score: normalizedHomeScore };
      awayScoreData = { ...awayScoreData, score: normalizedAwayScore };
    }
    
    // v8 WORKING ODDS: Get odds data early for validation
    const gameOdds = findGameOdds(allOdds, homeCode, awayCode);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};  // Keep legacy for now
    
    // v13 LOGIC: Fixed spread calculation
    const predictedSpread = calculateSpreadPrediction(homeScoreData, awayScoreData, homeCode, awayCode);
    
    // GPT COMPREHENSIVE DIAGNOSTIC: Log all components for problem games
    const currentMarketSpread = realOdds.spread_line || 0;
    const marketDivergence = Math.abs(predictedSpread - currentMarketSpread);
    
    // GPT DIVERGENCE REVIEW FLAG: Flag extreme divergences for manual review
    const DIVERGENCE_REVIEW_THRESHOLD = 8.0; // points
    let reviewFlag = null;
    let stakeReductionFactor = 1.0;
    
    if (marketDivergence > DIVERGENCE_REVIEW_THRESHOLD) {
      reviewFlag = {
        reason: "MODEL_MARKET_DIVERGENCE",
        divergence: Number(marketDivergence.toFixed(1)),
        action: "MANUAL_REVIEW_REQUIRED",
        model: predictedSpread > 0 ? homeCode : awayCode,
        modelLine: Number(Math.abs(predictedSpread).toFixed(1)),
        market: currentMarketSpread > 0 ? homeCode : awayCode,
        marketLine: Math.abs(currentMarketSpread)
      };
      stakeReductionFactor = 0.25; // Reduce Kelly stake to 25% for manual review games
      console.log(`⚠️ DIVERGENCE REVIEW FLAG: ${awayCode} @ ${homeCode}`);
      console.log(`   Divergence: ${marketDivergence.toFixed(1)} pts (threshold: ${DIVERGENCE_REVIEW_THRESHOLD})`);
      console.log(`   Stake reduction: 100% → 25%`);
    }
    
    // GPT DIAGNOSTIC: Only log for games with large divergence (reduce log spam)
    if (marketDivergence > DIVERGENCE_REVIEW_THRESHOLD) {
      console.log(JSON.stringify({
        tag: "SPREAD_DIAGNOSTIC",
        matchup: `${awayCode} @ ${homeCode}`,
        base: { 
          home: homeScoreData.score, 
          away: awayScoreData.score, 
          diff: homeScoreData.score - awayScoreData.score 
        },
        injuries: { 
          homePts: homeScoreData.injuryAnalysis?.totalImpact || 0,
          homeCount: (homeScoreData.injuryAnalysis?.adjustments || []).length,
          homeApplied: homeScoreData._injuryApplied || false,
          awayPts: awayScoreData.injuryAnalysis?.totalImpact || 0,
          awayCount: (awayScoreData.injuryAnalysis?.adjustments || []).length,
          awayApplied: awayScoreData._injuryApplied || false
        },
        safeguards: {
          probabilityNormalization: probabilityNormalizationApplied,
          reviewFlag: reviewFlag !== null,
          stakeReduction: stakeReductionFactor
        },
        final: { 
          model_home_margin: predictedSpread,
          market_spread: currentMarketSpread,
          divergence: marketDivergence
        }
      }));
    }
    
    // VALIDATION: Check for extreme market divergence
    if (marketDivergence > 10) {
      console.log(`🚨 LARGE DIVERGENCE: ${homeCode} vs ${awayCode}`);
      console.log(`   Model: ${predictedSpread > 0 ? homeCode : awayCode} ${Math.abs(predictedSpread).toFixed(1)}`);
      console.log(`   Market: ${currentMarketSpread > 0 ? homeCode : awayCode} ${Math.abs(currentMarketSpread).toFixed(1)}`);
      console.log(`   Divergence: ${marketDivergence.toFixed(1)} points`);
      console.log(`   Home Score: ${homeScoreData.score.toFixed(2)}, Away Score: ${awayScoreData.score.toFixed(2)}`);
    }
    
    const rawHomeWinProb = sigmoid(predictedSpread / 14);
    const rawAwayWinProb = 1 - rawHomeWinProb;

    // v4.1 PRODUCTION SAFEGUARDS: Apply calibration and market anchoring
    let homeWinProb = rawHomeWinProb;
    let awayWinProb = rawAwayWinProb;
    let calibrationData = null;
    let anchoringData = null;
    
    // Note: Calibration would be applied here with preloaded mapping
    // For now, use conservative adjustment for high confidence predictions
    if (rawHomeWinProb > 0.75) {
      homeWinProb = 0.50 + (rawHomeWinProb - 0.50) * 0.85; // Conservative scaling
      awayWinProb = 1 - homeWinProb;
      calibrationData = {
        applied: true,
        rawProb: rawHomeWinProb,
        calibratedProb: homeWinProb,
        adjustment: Math.abs(rawHomeWinProb - homeWinProb),
        method: 'conservative_scaling'
      };
      console.log(`📊 Conservative calibration: ${(rawHomeWinProb * 100).toFixed(1)}% → ${(homeWinProb * 100).toFixed(1)}%`);
    } else if (rawAwayWinProb > 0.75) {
      awayWinProb = 0.50 + (rawAwayWinProb - 0.50) * 0.85; // Conservative scaling
      homeWinProb = 1 - awayWinProb;
      calibrationData = {
        applied: true,
        rawProb: rawAwayWinProb,
        calibratedProb: awayWinProb,
        adjustment: Math.abs(rawAwayWinProb - awayWinProb),
        method: 'conservative_scaling'
      };
      console.log(`📊 Conservative calibration: Away ${(rawAwayWinProb * 100).toFixed(1)}% → ${(awayWinProb * 100).toFixed(1)}%`);
    }

    // Generate basic model picks for structured odds selection
    const mlPick = homeWinProb > awayWinProb ? homeCode : awayCode;
    const initialSpreadPick = predictedSpread > 1.5 ? homeCode : (predictedSpread < -1.5 ? awayCode : 'push');
    
    // Calculate basic predicted total for over/under (will be refined later)
    const basicPredictedTotal = homeScoreData.score + awayScoreData.score;
    let initialTotalPick = 'push';
    
    // NEW: Extract structured odds with display vs best separation
    const modelPicks = {
      mlPick: mlPick === homeCode ? 'home' : 'away',
      spreadPick: initialSpreadPick,
      totalPick: initialTotalPick // Will be updated below when we know the market total
    };
    
    const structuredOdds = extractStructuredOdds(gameOdds, modelPicks);
    const hasLiveOdds = gameOdds && realOdds.ml_home && realOdds.ml_away;
    
    // GPT SANITY GUARD: Check model-to-market spread delta (flag if >5 points)
    let modelMarketDelta = null;
    let sanityWarning = null;
    if (hasLiveOdds && realOdds.spread_line !== undefined) {
      const marketSpread = realOdds.spread_favorite === homeCode ? realOdds.spread_line : -realOdds.spread_line;
      modelMarketDelta = Math.abs(predictedSpread - marketSpread);
      
      if (modelMarketDelta > 5.0) {
        sanityWarning = {
          type: 'LARGE_MODEL_MARKET_DELTA',
          message: `Model spread (${predictedSpread.toFixed(1)}) differs from market (${marketSpread.toFixed(1)}) by ${modelMarketDelta.toFixed(1)} points`,
          recommendation: 'MANUAL_REVIEW',
          confidence_penalty: 0.15 // Reduce confidence by 15% when model disagrees heavily with market
        };
        console.log(`⚠️ SANITY WARNING: ${sanityWarning.message}`);
        
        // Apply confidence penalty for extreme divergence
        homeWinProb = 0.50 + (homeWinProb - 0.50) * (1 - sanityWarning.confidence_penalty);
        awayWinProb = 1 - homeWinProb;
        console.log(`  ↘️ Confidence reduced due to market divergence`);
      }
    }
    
    // Update total pick now that we have market total
    if (structuredOdds.display?.total?.over?.line) {
      const marketTotal = structuredOdds.display.total.over.line;
      initialTotalPick = basicPredictedTotal > marketTotal + 3 ? 'over' : 
                  basicPredictedTotal < marketTotal - 3 ? 'under' : 'push';
      modelPicks.totalPick = initialTotalPick;
      
      // Re-extract odds with updated total pick
      if (initialTotalPick !== 'push') {
        const updatedStructuredOdds = extractStructuredOdds(gameOdds, modelPicks);
        Object.assign(structuredOdds, updatedStructuredOdds);
      }
    }
    
    console.log(`Live odds found: ${hasLiveOdds}, Spread: ${realOdds.spread_line}, Total: ${realOdds.total_line}`);
    console.log(`Structured odds display book: ${structuredOdds.display?.bookmaker || 'none'}`);
    
    // PHASE 4 ENHANCEMENT: Sophisticated variance modeling
    const enhancedVarianceData = calculateEnhancedVariance(homeMetrics, awayMetrics);
    const enhancedVariance = enhancedVarianceData.total || enhancedVarianceData; // Handle both old and new format
    const isHighVariance = enhancedVarianceData.isHighVariance || enhancedVariance > 10.0;
    const marginTooClose = Math.abs(predictedSpread) < 2.5;
    
    const gameContext = {
      week: currentWeek,
      divisional: isDivisionalGame(homeCode, awayCode),
      majorInjuries: (injuries?.teams?.[homeCode]?.qb_status === 'out') || (injuries?.teams?.[awayCode]?.qb_status === 'out'),
      // Enhanced context for no-bet logic
      highVariance: isHighVariance,
      marginTooClose: marginTooClose,
      enhancedVariance: enhancedVariance,
      varianceBreakdown: enhancedVarianceData.breakdown || null
    };
    
    // PHASE 2 ENHANCEMENT: Check for no-bet scenarios with true edge calculation
    const predictionData = { homeWinProb, awayWinProb };
    const skipCheck = shouldSkipBet(predictionData, gameContext, realOdds);
    
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    
    // NEW: Calculate edges using best-book pricing
    let mlEdge = 0;
    let mlMarketProb = 0.5;
    let mlConfidence = Math.round(mlModelProb * 100);
    
    if (structuredOdds.best.h2h) {
      const bestMLPrice = structuredOdds.best.h2h.price;
      mlMarketProb = americanToImplied(bestMLPrice);
      
      // Remove vig using both sides from the same best book
      const bestBook = structuredOdds.all_books[structuredOdds.best.h2h.bookmaker];
      if (bestBook?.h2h?.home && bestBook?.h2h?.away) {
        const homeImplied = americanToImplied(bestBook.h2h.home);
        const awayImplied = americanToImplied(bestBook.h2h.away);
        const totalImplied = homeImplied + awayImplied;
        const vigFreeHome = homeImplied / totalImplied;
        const vigFreeAway = awayImplied / totalImplied;
        
        mlMarketProb = structuredOdds.best.h2h.pick_side === 'home' ? vigFreeHome : vigFreeAway;
      }
      
      const rawMLEdge = mlModelProb - mlMarketProb;
      mlEdge = Math.abs(rawMLEdge);
    } else {
      // Fallback to legacy odds
      const homeMarketProb = americanToImplied(realOdds.ml_home) || 0.5;
      const awayMarketProb = americanToImplied(realOdds.ml_away) || 0.5;
      mlMarketProb = mlPick === homeCode ? homeMarketProb : awayMarketProb;
      const rawMLEdge = mlMarketProb && hasLiveOdds ? mlModelProb - mlMarketProb : 0;
      mlEdge = Math.abs(rawMLEdge);
    }
    
    const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
    const avgEvidence = (homeScoreData.evidenceStrength + awayScoreData.evidenceStrength) / 2;
    
    // PHASE 3 ENHANCEMENT: Apply public bias detection
    const publicBiasAdjustment = detectPublicBias(mlPick, realOdds.spread_line, predictedSpread);
    const baseMLConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge, avgConfidence, avgEvidence, scoreDifference, 'moneyline', gameContext);
    mlConfidence = Math.round(baseMLConfidence * publicBiasAdjustment);
    
    // Get opponent QB EPA for moneyline filter (heavy favorite check)
    const opponentQBEPA = mlPick === homeCode 
      ? (awayMetrics?.core?.off_epa || null)  // Home is favored, check away offense EPA
      : (homeMetrics?.core?.off_epa || null);  // Away is favored, check home offense EPA
    
    // Add moneyline skip check using best-book edge
    const mlSkipCheck = shouldSkipMoneylineBet(mlPick, gameContext, realOdds, mlConfidence, mlEdge * 100, mlModelProb, opponentQBEPA);

    // Spread predictions with structured odds integration
    const marketSpread = hasLiveOdds ? (realOdds.spread_line || 0) : 0;
    const marketFavorite = realOdds.spread_favorite;
    
    const modelHomeMargin = predictedSpread;
    let marketHomeMargin = 0;
    if (hasLiveOdds && marketSpread !== 0) {
      marketHomeMargin = marketFavorite === 'home' ? Math.abs(marketSpread) : -Math.abs(marketSpread);
    }
    
    const marginDifference = modelHomeMargin - marketHomeMargin;
    
    // SAFEGUARD #1: Market Sanity Check (7.5pt threshold)
    const allHomeInjuries = homeScoreData.injuryAnalysis?.adjustments || [];
    const allAwayInjuries = awayScoreData.injuryAnalysis?.adjustments || [];
    const sanityCheck = checkMarketSanity(modelHomeMargin, marketHomeMargin, [...allHomeInjuries, ...allAwayInjuries]);
    
    // Store sanity check in predictions
    if (!game.predictions) game.predictions = {};
    if (!game.predictions.elite) game.predictions.elite = {};
    game.predictions.elite.sanityCheck = sanityCheck;
    
    // Flag for manual review if sanity check fails
    if (sanityCheck?.alert) {
      console.warn(`🚨 SANITY CHECK ALERT: ${sanityCheck.message}`);
      if (!game.predictions.flags) game.predictions.flags = [];
      game.predictions.flags.push('MANUAL_REVIEW');
    }
    const spreadThreshold = hasLiveOdds ? 2.5 : 1.0;
    
    let spreadPick = initialSpreadPick; // Start with initial pick
    let displayedSpread;
    
    if (!hasLiveOdds) {
      if (modelHomeMargin > 1.5) {
        spreadPick = homeCode;
      } else if (modelHomeMargin < -1.5) {
        spreadPick = awayCode;
      } else {
        spreadPick = 'push';
      }
      displayedSpread = Math.abs(modelHomeMargin);
    } else {
      // FIXED: Correct spread pick logic
      // If model predicts smaller margin than market, take the underdog
      // If model predicts larger margin than market, take the favorite
      if (Math.abs(marginDifference) < spreadThreshold) {
        spreadPick = 'push';
      } else if (marginDifference > spreadThreshold) {
        // Model thinks favorite will cover by more than market
        spreadPick = marketFavorite === 'home' ? homeCode : awayCode;
      } else {
        // Model thinks favorite won't cover, take underdog
        spreadPick = marketFavorite === 'home' ? awayCode : homeCode;
      }
      displayedSpread = Math.abs(marketSpread);
    }
    
    // Enhanced spread edge calculation using best-book data
    let spreadEdge = Math.abs(marginDifference);
    let bestSpreadInfo = null;
    
    if (structuredOdds.best.spread && spreadPick !== 'push') {
      const bestSpread = structuredOdds.best.spread;
      const bestBook = structuredOdds.all_books[bestSpread.bookmaker];
      
      if (bestBook?.spread) {
        // Use best-book line for edge calculation
        const bestLine = bestSpread.line;
        const modelLineForPick = spreadPick === homeCode ? modelHomeMargin : -modelHomeMargin;
        spreadEdge = Math.abs(modelLineForPick - bestLine);
        
        bestSpreadInfo = {
          bookmaker: bestSpread.bookmaker,
          line: bestLine,
          price: bestSpread.price,
          edge_points: spreadEdge
        };
      }
    }
    
    const baseSpreadConfidence = calculateConfidence(0.6, 0.52, spreadEdge / 14, avgConfidence, avgEvidence, scoreDifference, 'spread', gameContext);
    const spreadConfidence = baseSpreadConfidence;
    
    // COMPREHENSIVE DIAGNOSTIC for problematic games
    if (homeCode === 'ATL' || homeCode === 'TB' || awayCode === 'SF' || awayCode === 'BUF') {
      const diagnostic = {
        tag: 'SPREAD_DIAGNOSTIC',
        gameId: `${currentWeek}_${awayCode}_${homeCode}`,
        matchup: `${awayCode} @ ${homeCode}`,
        // RAW FEATURES
        features: {
          offEpa_home: homeMetrics?.core?.off_epa || 0,
          defEpa_home: homeMetrics?.core?.def_epa || 0,
          offEpa_away: awayMetrics?.core?.off_epa || 0,
          defEpa_away: awayMetrics?.core?.def_epa || 0,
          form_home: homeMetrics?.form?.off || 0,
          form_away: awayMetrics?.form?.off || 0,
          base_home_score: homeScoreData.score,
          base_away_score: awayScoreData.score
        },
        // INTERMEDIATE COMPUTATIONS
        comp: {
          preInjury_home_score: homeScoreData.score,
          preInjury_away_score: awayScoreData.score,
          injury_home_total: homeScoreData.injuryAnalysis?.totalImpact || 0,
          injury_away_total: awayScoreData.injuryAnalysis?.totalImpact || 0,
          injury_home_count: (homeScoreData.injuryAnalysis?.adjustments || []).length,
          injury_away_count: (awayScoreData.injuryAnalysis?.adjustments || []).length,
          scoreDifference: scoreDifference,
          spreadFromScores_NO_MULTIPLIER: scoreDifference, // Scores already in points!
          predictedSpread: predictedSpread,
          clampApplied: Math.abs(predictedSpread) >= 16.9
        },
        // OUTPUTS
        out: {
          model_home_margin: modelHomeMargin,
          market_home_margin: marketHomeMargin,
          diff: marginDifference,
          marketSpread: marketSpread,
          marketFavorite: marketFavorite
        }
      };
      console.log('\n🔍 SPREAD_DIAGNOSTIC:\n' + JSON.stringify(diagnostic, null, 2));
    }
    
    // Use spread-specific skip check with enhanced edge
    // Determine the spread line for the picked team
    const pickedTeamSpreadLine = spreadPick === homeCode ? (realOdds.spread_line || 0) : -(realOdds.spread_line || 0);
    const spreadSkipCheck = shouldSkipSpreadBet(spreadPick, marginDifference, gameContext, realOdds, spreadConfidence, spreadEdge, pickedTeamSpreadLine);

    // Enhanced total calculations
    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread, homeScoreData.specialTeams, awayScoreData.specialTeams);
    const marketTotal = hasLiveOdds ? (realOdds.total_line || 44) : 44;
    
    let totalDifference = predictedTotal - marketTotal;
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    let totalEdge = Math.abs(totalDifference);
    let bestTotalInfo = null;
    
    // Enhanced total edge calculation using best-book data
    if (structuredOdds.best.total && totalPick !== 'push') {
      const bestTotal = structuredOdds.best.total;
      const bestTotalLine = bestTotal.line;
      
      totalDifference = predictedTotal - bestTotalLine;
      totalEdge = Math.abs(totalDifference);
      
      bestTotalInfo = {
        bookmaker: bestTotal.bookmaker,
        line: bestTotalLine,
        price: bestTotal.price,
        side: bestTotal.pick_side,
        edge_points: totalEdge
      };
    }
    
    const totalConfidence = calculateConfidence(0.6, 0.52, totalEdge / 10, avgConfidence, avgEvidence, 0, 'total', gameContext);
    
    // Use proper totals skip check with enhanced edge
    const totalSkipCheck = shouldSkipTotalBet(totalPick, totalDifference, gameContext, realOdds, totalConfidence, totalEdge);

    // v4.1 PRODUCTION SAFEGUARDS: Apply final safety limits to all bet recommendations
    const rawPredictions = {
      moneyline: { 
        pick: mlPick,
        confidence: mlConfidence,
        edge: Number((mlEdge * 100).toFixed(1)),
        bet: !mlSkipCheck.skip,
        betRecommendation: mlSkipCheck.skip ? "NO BET" : "BET",
        skipReason: mlSkipCheck.reason || null,
        displayNote: mlSkipCheck.skip ? "NO BET" : "BET",
        best_book: structuredOdds.best.h2h ? {
          bookmaker: structuredOdds.best.h2h.bookmaker,
          price: structuredOdds.best.h2h.price,
          edge_pct: Number((mlEdge * 100).toFixed(1))
        } : null
      },
      spread: { 
        pick: spreadPick,
        confidence: spreadConfidence,
        line: hasLiveOdds ? marketSpread : Number(displayedSpread.toFixed(1)),
        predicted: Number(Math.abs(predictedSpread).toFixed(1)),
        edge: Number(spreadEdge.toFixed(1)),
        model_home_margin: Number(modelHomeMargin.toFixed(1)),
        bet: !spreadSkipCheck.skip,
        betRecommendation: spreadSkipCheck.skip ? "NO BET" : "BET",
        skipReason: spreadSkipCheck.reason || null,
        displayNote: spreadSkipCheck.skip ? "NO BET" : "BET",
        best_book: bestSpreadInfo
      },
      total: { 
        pick: totalPick, 
        confidence: totalConfidence, 
        line: marketTotal, 
        predicted: Number(predictedTotal.toFixed(1)), 
        edge: Number(totalEdge.toFixed(1)),
        bet: !totalSkipCheck.skip,
        betRecommendation: totalSkipCheck.skip ? "NO BET" : "BET",
        skipReason: totalSkipCheck.reason || null,
        displayNote: totalSkipCheck.skip ? "NO BET" : "BET",
        best_book: bestTotalInfo
      }
    };
    
    // Apply production safety limits
    const safeguardedPredictions = applyProductionSafetyLimits(
      rawPredictions,
      realOdds,
      {
        modelConfidence: Math.max(homeScoreData.confidence, awayScoreData.confidence),
        marketDivergence: anchoringData?.divergence || 0,
        dataQuality: (epaFilterResults.home?.filterStats?.filterRate || 0) + (epaFilterResults.away?.filterStats?.filterRate || 0) > 40 ? 0.6 : 0.8
      }
    );
    
    console.log(`🛡️ Safety limits applied: ${safeguardedPredictions.safetyLimits?.applied?.length || 0} adjustments`);

    return {
      ...game,
      predictions: {
        home_win_prob: Number(homeWinProb.toFixed(3)),
        away_win_prob: Number(awayWinProb.toFixed(3)),
        ...safeguardedPredictions
      },
      
      // NEW: Structured odds with display vs best separation
      odds: structuredOdds.display ? {
        // Display book for consistent UI
        display: structuredOdds.display,
        display_book: structuredOdds.display.bookmaker,
        
        // Best book info for edge calculations
        best: structuredOdds.best,
        
        // Legacy format for backwards compatibility
        moneyline: { 
          home: structuredOdds.display.h2h?.home || realOdds.ml_home, 
          away: structuredOdds.display.h2h?.away || realOdds.ml_away
        },
        spread: { 
          line: structuredOdds.display.spread?.home_line || realOdds.spread_line, 
          favorite: realOdds.spread_favorite,
          home_line: structuredOdds.display.spread?.home_line,
          away_line: structuredOdds.display.spread?.away_line
        },
        total: { 
          line: structuredOdds.display.total?.over?.line || realOdds.total_line,
          over_price: structuredOdds.display.total?.over?.price,
          under_price: structuredOdds.display.total?.under?.price
        },
        
        // Metadata
        source_snapshot_at: structuredOdds.source_snapshot_at,
        live_odds_available: hasLiveOdds,
        books_available: Object.keys(structuredOdds.all_books || {})
      } : {
        // Fallback to legacy structure
        moneyline: { 
          home: realOdds.ml_home, 
          away: realOdds.ml_away
        },
        spread: { 
          line: realOdds.spread_line, 
          favorite: realOdds.spread_favorite
        },
        total: { line: realOdds.total_line },
        live_odds_available: hasLiveOdds
      },
      
      modelEnhancements: {
        version: 'v4.1_safeguarded_production',
        fixesApplied: [
          "v13: Deterministic special teams (no Math.random)",
          "v13: Reduced multipliers (CORE_EPA 30→24, TIER_BASE 10→8)",
          "v13: Z-score clipping (±2.5 max)",
          "v13: NaN shield for league stats",
          "v13: Fixed spread calculation logic",
          "v13: No input mutation (pure functions)",
          "v8: Working odds data extraction",
          "v8: Proven team name mapping",
          "v8: Functional live odds integration",
          "ENHANCED: 55-65% confidence band calibration fix",
          "ENHANCED: True edge calculation with vig removal",
          "ENHANCED: No-bet logic for insufficient edges",
          "ENHANCED: Public team bias detection",
          "ENHANCED: Sophisticated variance modeling",
          "v4.1: Conservative probability calibration",
          "v4.1: Situational EPA filtering",
          "v4.1: Depth chart safeguards", 
          "v4.1: Production safety limits",
          "v4.1: Market anchoring framework"
        ],
        safeguards: {
          calibrationApplied: calibrationData?.applied || false,
          calibrationMethod: calibrationData?.method || 'none',
          calibrationAdjustment: calibrationData?.adjustment?.toFixed(3) || '0.000',
          epaFilteringHome: epaFilterResults.home?.filterStats?.filterRate?.toFixed(1) + '%' || 'N/A',
          epaFilteringAway: epaFilterResults.away?.filterStats?.filterRate?.toFixed(1) + '%' || 'N/A',
          depthChartWarnings: (homeScoreData.injuryAnalysis?.safeguardWarnings?.length || 0) + (awayScoreData.injuryAnalysis?.safeguardWarnings?.length || 0),
          safetyLimitsApplied: safeguardedPredictions.safetyLimits?.applied?.length || 0,
          marketAnchoringAvailable: !!anchoringData,
          sanityWarning: sanityWarning || null, // GPT sanity guard
          modelMarketDelta: modelMarketDelta?.toFixed(1) || null,
          divergenceReviewFlag: reviewFlag, // GPT: Manual review for extreme divergences
          stakeReductionFactor: stakeReductionFactor,
          injuryDoubleApplicationPrevented: homeScoreData._injuryApplied && awayScoreData._injuryApplied,
          probabilityNormalizationApplied: probabilityNormalizationApplied
        },
        enhancedFeatures: {
          calibrationFix: "Applied to confidence band 55-65%",
          noBetLogic: skipCheck.skip ? skipCheck.reason : "Sufficient edge",
          publicBias: publicBiasAdjustment < 1.0 ? "Detected" : "None",
          varianceLevel: isHighVariance ? "High" : "Normal",
          enhancedVariance: enhancedVariance.toFixed(3)
        },
        diagnostics: {
          homeScore: homeScoreData.score.toFixed(2),
          awayScore: awayScoreData.score.toFixed(2),
          scoreDiff: scoreDifference.toFixed(2),
          marginDiff: marginDifference.toFixed(2),
          spreadPick: spreadPick,
          liveOddsWorking: hasLiveOdds
        },
        // INJURY ANALYSIS: Expose injury data for debugging and transparency
        injuryAnalysis: {
          home: homeScoreData.injuryAnalysis || null,
          away: awayScoreData.injuryAnalysis || null,
          hasInjuryImpact: !!(
            (homeScoreData.injuryAnalysis?.adjustments && homeScoreData.injuryAnalysis.adjustments.some(a => Math.abs(a.impact) > 0.01)) ||
            (awayScoreData.injuryAnalysis?.adjustments && awayScoreData.injuryAnalysis.adjustments.some(a => Math.abs(a.impact) > 0.01))
          ),
          injuryDataAvailable: !!injuries?.teams
        }
      },
      
      teamStats: {
        home: {
          strength: Number(homeWinProb.toFixed(3)),
          score: Number(homeScoreData.score.toFixed(2)),
          confidence: Number(homeScoreData.confidence.toFixed(3)),
          specialTeamsValue: homeScoreData.specialTeams?.total_st_value || 0,
          injuryImpact: homeScoreData.injuryAnalysis || null,
          safeguardedInjuryImpact: homeScoreData.injuryAnalysis?.safeguardedAdjustments || null,
          epaFilterStats: epaFilterResults.home?.filterStats || null
        },
        away: {
          strength: Number(awayWinProb.toFixed(3)),
          score: Number(awayScoreData.score.toFixed(2)),
          confidence: Number(awayScoreData.confidence.toFixed(3)),
          specialTeamsValue: awayScoreData.specialTeams?.total_st_value || 0,
          injuryImpact: awayScoreData.injuryAnalysis || null,
          safeguardedInjuryImpact: awayScoreData.injuryAnalysis?.safeguardedAdjustments || null,
          epaFilterStats: epaFilterResults.away?.filterStats || null
        }
      }
    };
  });
  console.log(`⏱️ Games processed in ${Date.now() - gamesStart}ms`);
  console.log(`⏱️ TOTAL RUNTIME: ${Date.now() - perfStart}ms`);

  const parlayComponents = await generateParlayComponents(games, predictions);
  const parlaySuggestions = generateResponsibleParlays(parlayComponents);
  
  console.log(`Generated ${parlaySuggestions.length} parlay suggestions from ${parlayComponents.length} qualifying components`);

  return {
    predictions: predictions,
    parlaySuggestions: parlaySuggestions,
    parlayMetadata: {
      totalComponents: parlayComponents.length,
      averageConfidence: parlayComponents.length > 0 ? 
        parlayComponents.reduce((sum, c) => sum + c.confidence, 0) / parlayComponents.length : 0,
      responsibleGambling: {
        maxRecommendedUnit: Math.max(...parlaySuggestions.map(p => p.recommended_unit || 0)),
        riskWarning: "Parlays have exponentially higher risk. Only bet what you can afford to lose.",
        bankrollManagement: "Never exceed 5% of total bankroll on parlays combined."
      }
    },
    // INJURY INTEGRATION STATUS: For debugging and transparency
    injuryIntegrationStatus: {
      dataAvailable: !!injuries?.teams,
      teamsWithData: injuries?.teams ? Object.keys(injuries.teams).length : 0,
      gamesWithInjuryImpact: predictions.filter(p => 
        p.modelEnhancements?.injuryAnalysis?.hasInjuryImpact || 
        p.teamStats?.home?.injuryImpact?.adjustments?.length ||
        p.teamStats?.away?.injuryImpact?.adjustments?.length
      ).length,
      lastUpdated: injuries?.asOf || null
    }
  };
}

/**
 * Save advanced predictions to blob storage in the format that nfl-predictions-get expects
 * This bridges the sophisticated R Pipeline model to the live website
 */
async function saveAdvancedPredictionsToBlobs(result, season) {
  const { getStore } = await import('@netlify/blobs');
  
  // Transform advanced predictions to the format expected by the frontend
  const rows = result.predictions.map(game => {
    const homeTeam = TEAM_NAME_MAPPING[game.home_team] || game.home_team;
    const awayTeam = TEAM_NAME_MAPPING[game.away_team] || game.away_team;
    
    // Extract compact predictions with best_book
    const compactPredictions = {
      moneyline: game.predictions?.moneyline ? {
        pick: game.predictions.moneyline.pick,
        confidence: game.predictions.moneyline.confidence,
        odds: game.predictions.moneyline.odds || null,
        edge: game.predictions.moneyline.edge ?? null,
        best_book: game.predictions.moneyline.best_book ? {
          bookmaker: game.predictions.moneyline.best_book.bookmaker,
          price: game.predictions.moneyline.best_book.price,
          line: game.predictions.moneyline.best_book.line ?? null,
          edge_pct: game.predictions.moneyline.best_book.edge_pct ?? null
        } : null
      } : null,
      spread: game.predictions?.spread ? {
        pick: game.predictions.spread.pick,
        line: game.predictions.spread.line,
        confidence: game.predictions.spread.confidence,
        edge: game.predictions.spread.edge ?? null,
        odds: game.predictions.spread.odds || null,
        model_home_margin: game.predictions.spread.model_home_margin ?? null,
        best_book: game.predictions.spread.best_book ? {
          bookmaker: game.predictions.spread.best_book.bookmaker,
          price: game.predictions.spread.best_book.price,
          line: game.predictions.spread.best_book.line ?? null,
          edge_pct: game.predictions.spread.best_book.edge_pct ?? null
        } : null
      } : null,
      total: game.predictions?.total ? {
        pick: game.predictions.total.pick,
        line: game.predictions.total.line,
        confidence: game.predictions.total.confidence,
        edge: game.predictions.total.edge ?? null,
        odds: game.predictions.total.odds || null,
        best_book: game.predictions.total.best_book ? {
          bookmaker: game.predictions.total.best_book.bookmaker,
          price: game.predictions.total.best_book.price,
          line: game.predictions.total.best_book.line ?? null,
          edge_pct: game.predictions.total.best_book.edge_pct ?? null
        } : null
      } : null
    };

    return {
      id: game.game_id,
      matchup: `${awayTeam} @ ${homeTeam}`,
      kickoff: game.start,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      
      // Transform advanced predictions to simple format
      odds: game.odds || {},
      // Expose simplified predictions including best_book (with deep_link)
      predictions: compactPredictions,
      // Convenience fields for CTAs
      ml_deep_link: compactPredictions.moneyline?.best_book?.deep_link || null,
      spread_deep_link: compactPredictions.spread?.best_book?.deep_link || null,
      total_deep_link: compactPredictions.total?.best_book?.deep_link || null,
      
      // Use the sophisticated model's best pick as the main choice
      model_choice: {
        market: game.predictions.moneyline.bet ? "moneyline" : 
                game.predictions.spread.bet ? "spread" : 
                game.predictions.total.bet ? "total" : "moneyline",
        side: game.predictions.moneyline.bet ? 
              (game.predictions.moneyline.pick === game.home_team ? "home" : "away") :
              game.predictions.spread.bet ? 
              (game.predictions.spread.pick === game.home_team ? "home" : "away") : "home"
      },
      
      // Frontend display fields
      displayMarket: game.predictions.moneyline.bet ? "moneyline" : "spread",
      displayPick: game.predictions.moneyline.bet ? 
                   TEAM_NAME_MAPPING[game.predictions.moneyline.pick] || game.predictions.moneyline.pick :
                   TEAM_NAME_MAPPING[game.predictions.spread.pick] || game.predictions.spread.pick,
      displayPrice: game.odds?.moneyline?.home || null,
      displayLine: game.predictions.spread.line || null,
      
      // Enhanced confidence from sophisticated model
      confidence: Math.max(
        game.predictions.moneyline.confidence / 100,
        game.predictions.spread.confidence / 100,
        game.predictions.total.confidence / 100
      ),
      
      // Detailed pick information
      pick: {
        type: game.predictions.moneyline.bet ? "moneyline" : "spread",
        team: game.predictions.moneyline.bet ? 
              TEAM_NAME_MAPPING[game.predictions.moneyline.pick] || game.predictions.moneyline.pick :
              TEAM_NAME_MAPPING[game.predictions.spread.pick] || game.predictions.spread.pick,
        confidence: Math.max(
          game.predictions.moneyline.confidence / 100,
          game.predictions.spread.confidence / 100
        ),
        pickLabel: game.predictions.moneyline.bet ? 
                   `moneyline: ${TEAM_NAME_MAPPING[game.predictions.moneyline.pick] || game.predictions.moneyline.pick}` :
                   `spread: ${TEAM_NAME_MAPPING[game.predictions.spread.pick] || game.predictions.spread.pick} ${game.predictions.spread.line}`
      },
      
      // Advanced metadata for power users
      _advanced: {
        modelVersion: game.modelEnhancements?.version || 'v13_r_pipeline',
        mlEdge: game.predictions.moneyline.edge,
        spreadEdge: game.predictions.spread.edge,
        totalEdge: game.predictions.total.edge,
        homeWinProb: game.predictions.home_win_prob,
        awayWinProb: game.predictions.away_win_prob,
        betRecommendations: {
          moneyline: game.predictions.moneyline.betRecommendation,
          spread: game.predictions.spread.betRecommendation,
          total: game.predictions.total.betRecommendation
        }
      }
    };
  });
  
  // Create the payload in the expected format
  const blobData = {
    ok: true,
    updated: new Date().toISOString(),
    rows: rows,
    source: 'r_pipeline_advanced_epa_model',
    version: 'v13_hybrid_integration',
    totalGames: rows.length,
    metadata: {
      season: season,
      modelEnhancements: result.predictions[0]?.modelEnhancements || {},
      parlayData: result.parlaySuggestions || [],
      generatedAt: new Date().toISOString(),
      dataSource: 'nfl-predictions-generate (R Pipeline + NFLVerse EPA)'
    }
  };
  
  // Save to the same blob storage that nfl-predictions-get reads from
  const name = process.env.BLOBS_STORE_NFL || "nfl-td";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  const store = (siteID && token) ? getStore({ siteID, token, name }) : getStore(name);
  
  await store.set("predictions/current.json", JSON.stringify(blobData));
  
  console.log(`💾 Saved ${rows.length} advanced predictions to blob storage (predictions/current.json)`);
  return blobData;
}

export default async (request, context) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    let games = [];
    let season = '2025';
    let currentWeek = null; // Initialize at top level
    const saveToBlobs = request.method === 'GET';

    if (request.method === 'POST') {
      const body = await request.json();
      games = body.games || [];
      season = body.season || '2025';
      // For POST requests, try to extract week from body or games data
      currentWeek = body.week || (games.length > 0 && games[0].week) || null;
      if (currentWeek) {
        console.log(`📅 POST request week: ${currentWeek}`);
      }
    } else if (request.method === 'GET') {
      const url = new URL(request.url);
      season = url.searchParams.get('season') || '2025';
      const requestedWeek = url.searchParams.get('week');

      // CACHING DISABLED: Always generate fresh predictions
      // The caching system was causing issues with stale data and lockingR
      console.log('🔄 Generating fresh predictions (caching disabled)');

      // Fetch games and regenerate - READ FROM LOCAL SCHEDULE FILE
      try {
        console.log('🔄 Loading current NFL games from local schedule...');
        // Use cached schedule loader (performance optimization)
        const fullSchedule = await getScheduleFull();
        
        // Determine which week to load
        if (requestedWeek) {
          // Use explicitly requested week (allows looking ahead)
          currentWeek = parseInt(requestedWeek, 10);
          console.log(`📅 Using requested week: ${currentWeek}`);
        } else {
          // Use date-based week detection as fallback
          const now = new Date();
          const seasonStart = new Date('2025-09-04');
          const nowDay = now.getDay();
          let adjustedDate = new Date(now);
          // WEEK TRANSITION FIX: Week advances on Tuesday (day 2) not just Monday
          // This ensures we're on the current week by Tuesday morning
          if (nowDay === 1) {
            // Monday: still previous week
            adjustedDate.setDate(adjustedDate.getDate() - 1);
          } else if (nowDay >= 2) {
            // Tuesday onward: current week
            // Add 1 day to bump into the next week
            adjustedDate.setDate(adjustedDate.getDate() + 1);
          }
          const daysSinceStart = Math.floor((adjustedDate - seasonStart) / (24 * 60 * 60 * 1000));
          currentWeek = Math.max(1, Math.min(22, Math.floor(daysSinceStart / 7) + 1));
          console.log(`📅 Current week (date-based): ${currentWeek} (${now.toDateString()})`);
        }
        
        // Get games for requested/current week
        const weekGames = fullSchedule.weeks[currentWeek.toString()]?.matchups || [];
        games = weekGames.map(game => ({
          game_id: game.id,
          home_team: getTeamAbbreviation(game.homeTeam),
          away_team: getTeamAbbreviation(game.awayTeam),
          start: game.kickoff,
          week: game.week
        }));
        console.log(`✅ Loaded ${games.length} games for week ${currentWeek} from local schedule`);
      } catch (error) {
        console.warn('⚠️  Failed to load games from schedule:', error.message);
        console.warn('⚠️  Error stack:', error.stack);
        games = []; // Continue with empty games if fetch fails
      }
    }

    // Ensure currentWeek has a valid value before proceeding
    if (!currentWeek) {
      // Fallback to date-based calculation
      const now = new Date();
      const seasonStart = new Date('2025-09-04');
      const nowDay = now.getDay();
      let adjustedDate = new Date(now);
      if (nowDay === 1) {
        adjustedDate.setDate(adjustedDate.getDate() - 1);
      }
      const daysSinceStart = Math.floor((adjustedDate - seasonStart) / (24 * 60 * 60 * 1000));
      currentWeek = Math.max(1, Math.min(22, Math.floor(daysSinceStart / 7) + 1));
      console.log(`📅 Fallback: Using date-based week ${currentWeek}`);
    }

    const result = await generateAdvancedPredictions(games, season, currentWeek);
    
    // ========================================
    // EXPOSURE CHECKING: Enforce daily/per-game limits
    // ========================================
    console.log('\n🔍 [EXPOSURE] Checking exposure limits...');
    const publishedBets = [];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    let blockedCount = 0;
    
    if (result.predictions && result.predictions.length > 0) {
      const allPredictions = [...result.predictions];
      result.predictions = []; // Reset, will rebuild with only allowed bets
      
      for (const prediction of allPredictions) {
        // Determine betType from market
        let betType = 'spread';
        const market = (prediction.market || '').toLowerCase();
        if (market === 'moneyline' || market === 'ml') {
          betType = 'moneyline';
        } else if (market === 'total' || market === 'over' || market === 'under' || market === 'ou') {
          betType = 'total';
        }
        
        const proposedUnits = prediction.recommended_units || 0;
        const gameId = prediction.game_id || prediction.gameId || `${prediction.away_team}_${prediction.home_team}`;
        
        // Check exposure limits
        const exposureCheck = checkExposureLimits(
          proposedUnits,
          betType,
          publishedBets,
          gameId,
          today
        );
        
        if (!exposureCheck.allowed) {
          console.warn(`🚫 [EXPOSURE] Blocked: ${prediction.pick} (${proposedUnits.toFixed(1)}U ${betType})`);
          console.warn(`   Violations:`, exposureCheck.violations.map(v => `${v.type}: ${v.message || v.excess.toFixed(1) + 'U over limit'}`).join(', '));
          blockedCount++;
          continue; // Skip this bet
        }
        
        // Bet passed exposure checks - publish it
        publishedBets.push({
          units: proposedUnits,
          betType,
          gameId,
          date: today
        });
        
        result.predictions.push(prediction);
        
        // Log exposure usage (only for first 3 bets to avoid spam)
        if (publishedBets.length <= 3) {
          console.log(`✅ [EXPOSURE] Published: ${prediction.pick} (${proposedUnits.toFixed(1)}U ${betType})`);
          console.log(`   Daily: ${exposureCheck.dailyUsage.proposed.toFixed(1)}/${exposureCheck.dailyUsage.limit}U | Remaining: ${exposureCheck.dailyUsage.remaining.toFixed(1)}U`);
          console.log(`   Game: ${exposureCheck.gameUsage.proposed.toFixed(1)}/${exposureCheck.gameUsage.limit}U | Remaining: ${exposureCheck.gameUsage.remaining.toFixed(1)}U`);
          console.log(`   Sides: ${exposureCheck.sidesUsage.proposed.toFixed(1)}/${exposureCheck.sidesUsage.limit}U | Totals: ${exposureCheck.totalsUsage.proposed.toFixed(1)}/5.0U`);
        }
      }
      
      console.log(`\n📊 [EXPOSURE SUMMARY]`);
      console.log(`   Total bets analyzed: ${allPredictions.length}`);
      console.log(`   Bets published: ${result.predictions.length}`);
      console.log(`   Bets blocked: ${blockedCount}`);
      if (publishedBets.length > 0) {
        const totalUnits = publishedBets.reduce((sum, bet) => sum + bet.units, 0);
        console.log(`   Total exposure: ${totalUnits.toFixed(1)}U / 112.5U daily limit`);
      }
    }
    
    // LIVE SITE INTEGRATION: Always save to blob storage when we have predictions
    let blobData = null;
    if (result.predictions && result.predictions.length > 0) {
      try {
        blobData = await saveAdvancedPredictionsToBlobs(result, season);
        console.log('✅ Saved advanced predictions to blob storage for live site');
        
        // CACHE: Also save to predictions cache for fast loading
        // CACHING DISABLED: Skip saving to cache
        console.log('📌 Caching disabled - predictions saved only to main blob storage');
      } catch (error) {
        console.error('❌ Failed to save to blobs:', error);
        // Continue anyway - don't fail the request
      }
    }
    
    // CSV SNAPSHOT: Write picks snapshot for CLV tracking
    // Every prediction refresh writes a timestamped row to CSV with exact picks + market odds
    // This captures the picks + odds at the time of generation (not just at kickoff)
    let snapshotInfo = null;
    if (blobData && blobData.rows && blobData.rows.length > 0) {
      try {
        const currentWeek = blobData.metadata?.week || getCurrentWeek();
        const snapshotResult = await writePicksSnapshot(blobData, currentWeek, season);
        if (snapshotResult.success) {
          console.log(`✅ CSV snapshot written: ${snapshotResult.games_count} games to ${snapshotResult.key}`);
          snapshotInfo = { key: snapshotResult.key, timestamp: snapshotResult.timestamp };
        } else {
          console.warn('⚠️  CSV snapshot failed:', snapshotResult.error);
        }
      } catch (error) {
        console.warn('⚠️  CSV snapshot error:', error.message);
        // Continue anyway - don't fail the request
      }
    }
    
    const finalResult = {
      ...result,
      snapshot: snapshotInfo  // Include snapshot info for verification
    };
    
    return new Response(JSON.stringify(finalResult), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('❌ Hybrid v13+v8 prediction error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    
    return new Response(JSON.stringify({
      error: 'Hybrid prediction generation failed',
      message: error.message,
      stack: error.stack,
      name: error.name
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

/**
 * Save predictions to cache for fast loading (30min cache lifetime)
 */
async function saveToPredictionsCache(result, season) {
  try {
    const cacheStore = getStore("predictions-cache");
    
    // Determine week from first prediction
    const week = result.predictions?.[0]?.week || 'current';
    const cacheKey = `nfl-predictions-${season}-week${week}`;
    
    const cacheData = {
      ...result,
      generated_at: new Date().toISOString(),
      cache_key: cacheKey,
      cache_ttl: 1800 // 30 minutes
    };
    
    await cacheStore.set(cacheKey, JSON.stringify(cacheData), {
      metadata: {
        generated_at: new Date().toISOString(),
        season: season,
        week: week,
        games_count: result.predictions?.length || 0
      }
    });
    
    console.log(`💾 [CACHE] Saved predictions to ${cacheKey}`);
  } catch (error) {
    console.error('[CACHE] Failed to save predictions cache:', error);
    // Don't throw - caching is optional
  }
}

/**
 * Check games for kickoff events and trigger pick locking
 * Auto-locks picks within 5 minutes of kickoff (before or after)
 * 
 * FIX: Proper UTC normalization (GPT audit fix #1)
 * - All time comparisons done in UTC epoch milliseconds
 * - Logs both kickoff and now in ISO format for debugging
 */
// LOCKING SYSTEM REMOVED: Replaced with simple CSV snapshots
// Old locking system (500+ lines) replaced with ~50 lines of CSV writing
// Benefits: Simpler, more reliable, portable, transparent
// All picks + market odds captured in timestamped CSV rows
// Grade offline after week ends
