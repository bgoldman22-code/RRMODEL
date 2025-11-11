/**
 * Phase 2: Marginal Distributions Builder for DD/TD Prediction
 * 
 * Generates player-specific marginal distributions for:
 * - Minutes (log-normal or beta-PERT based on role + injury + B2B)
 * - Points (Negative Binomial using OU line + usage + archetype)
 * - Rebounds (reuse existing model predictions)
 * - Assists (reuse existing model predictions)
 * 
 * Output: CDFs for PTS/REB/AST per player for copula input
 */

import { fetchSchedule, fetchBoxScore, fetchInjuries, fetchLineups, isBackToBack, fetchPlayerGameLogs } from './utils-data.mjs';
import { logNormalSample, betaPERTSample, negativeBinomialSample, buildEmpiricalCDF } from './utils-distributions.mjs';
import { fetchBettingOdds } from './utils-odds.mjs';
import fs from 'fs';
import path from 'path';

// ==================== CONFIGURATION ====================

const MINUTES_DISTRIBUTION = 'log-normal'; // 'log-normal' or 'beta-pert'
const SAMPLE_SIZE = 10000; // Samples for CDF building
const LOOKBACK_GAMES = 10; // Recent games for baseline estimation

// Role-based minutes priors
const MINUTES_PRIORS = {
  starter: { mean: 32, sd: 5 },
  rotation: { mean: 22, sd: 6 },
  bench: { mean: 12, sd: 5 },
  unknown: { mean: 20, sd: 8 }
};

// Injury/B2B minutes penalties
const MINUTES_PENALTIES = {
  questionable: 0.85,  // 15% reduction
  doubtful: 0.60,      // 40% reduction
  probable: 0.95,      // 5% reduction
  backToBack: 0.92     // 8% reduction
};

// Points archetype priors (per 36 minutes)
const POINTS_ARCHETYPES = {
  scorer: { mean: 22, variance: 40 },     // High volume, high variance
  secondary: { mean: 16, variance: 25 },  // Medium volume
  role_player: { mean: 10, variance: 15 },
  defensive: { mean: 6, variance: 8 }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Determine player role from recent minutes
 */
function determineRole(recentMinutes) {
  if (recentMinutes.length === 0) return 'unknown';
  
  const avgMinutes = recentMinutes.reduce((a, b) => a + b, 0) / recentMinutes.length;
  
  if (avgMinutes >= 28) return 'starter';
  if (avgMinutes >= 18) return 'rotation';
  if (avgMinutes >= 8) return 'bench';
  return 'bench';
}

/**
 * Infer archetype from recent points per 36
 */
function inferArchetype(gameLogs) {
  if (gameLogs.length === 0) return 'role_player';
  
  // Calculate points per 36 minutes
  const pointsPer36 = gameLogs
    .filter(g => g.minutes > 5)
    .map(g => (g.points / g.minutes) * 36);
  
  if (pointsPer36.length === 0) return 'role_player';
  
  const avgPtsPer36 = pointsPer36.reduce((a, b) => a + b, 0) / pointsPer36.length;
  
  if (avgPtsPer36 >= 20) return 'scorer';
  if (avgPtsPer36 >= 14) return 'secondary';
  if (avgPtsPer36 >= 8) return 'role_player';
  return 'defensive';
}

/**
 * Get injury status for player
 */
function getInjuryStatus(playerName, injuries) {
  const injury = injuries.find(inj => 
    inj.playerName.toLowerCase().includes(playerName.toLowerCase()) ||
    playerName.toLowerCase().includes(inj.playerName.toLowerCase())
  );
  
  if (!injury) return null;
  
  const status = injury.status.toLowerCase();
  if (status.includes('out')) return 'out';
  if (status.includes('doubtful')) return 'doubtful';
  if (status.includes('questionable')) return 'questionable';
  if (status.includes('probable')) return 'probable';
  
  return null;
}

/**
 * Build minutes distribution for player
 */
function buildMinutesDistribution(playerName, recentGames, injuries, isB2B, teamId, gameDate) {
  // Get recent minutes
  const recentMinutes = recentGames
    .slice(0, LOOKBACK_GAMES)
    .map(g => g.minutes)
    .filter(m => m > 0);
  
  if (recentMinutes.length === 0) {
    // No history - use unknown role prior
    const prior = MINUTES_PRIORS.unknown;
    return {
      type: MINUTES_DISTRIBUTION,
      mean: prior.mean,
      sd: prior.sd,
      penalty: 1.0,
      role: 'unknown'
    };
  }
  
  // Determine role and baseline
  const role = determineRole(recentMinutes);
  const prior = MINUTES_PRIORS[role];
  
  // Empirical mean/sd from recent games
  const empiricalMean = recentMinutes.reduce((a, b) => a + b, 0) / recentMinutes.length;
  const empiricalSd = Math.sqrt(
    recentMinutes.reduce((sum, m) => sum + Math.pow(m - empiricalMean, 2), 0) / recentMinutes.length
  );
  
  // Blend empirical with prior (70% empirical, 30% prior)
  const blendedMean = 0.7 * empiricalMean + 0.3 * prior.mean;
  const blendedSd = 0.7 * empiricalSd + 0.3 * prior.sd;
  
  // Apply penalties
  let penalty = 1.0;
  const injuryStatus = getInjuryStatus(playerName, injuries);
  if (injuryStatus && MINUTES_PENALTIES[injuryStatus]) {
    penalty *= MINUTES_PENALTIES[injuryStatus];
  }
  if (isB2B) {
    penalty *= MINUTES_PENALTIES.backToBack;
  }
  
  const adjustedMean = blendedMean * penalty;
  
  return {
    type: MINUTES_DISTRIBUTION,
    mean: adjustedMean,
    sd: blendedSd,
    penalty,
    role,
    injuryStatus: injuryStatus || 'healthy'
  };
}

/**
 * Build points distribution using Negative Binomial
 */
function buildPointsDistribution(playerName, recentGames, minutesDist, oddsLine = null) {
  if (recentGames.length === 0) {
    // No history - use generic archetype
    const archetype = POINTS_ARCHETYPES.role_player;
    const expectedMinutes = minutesDist.mean;
    const pointsPer36 = archetype.mean;
    const expectedPoints = (pointsPer36 / 36) * expectedMinutes;
    
    return {
      distribution: 'negative-binomial',
      mean: expectedPoints,
      variance: archetype.variance * (expectedMinutes / 36),
      r: null, // Will be calculated
      p: null,
      archetype: 'role_player',
      source: 'prior'
    };
  }
  
  // Infer archetype from recent games
  const archetype = inferArchetype(recentGames);
  const archetypePrior = POINTS_ARCHETYPES[archetype];
  
  // Empirical points per minute
  const validGames = recentGames.filter(g => g.minutes > 5);
  const pointsPerMin = validGames.map(g => g.points / g.minutes);
  const avgPointsPerMin = pointsPerMin.reduce((a, b) => a + b, 0) / pointsPerMin.length;
  
  // Project to expected minutes
  const expectedPoints = avgPointsPerMin * minutesDist.mean;
  
  // Variance calculation (overdispersion)
  const empiricalVariance = pointsPerMin.reduce((sum, ppm) => {
    const projected = ppm * minutesDist.mean;
    return sum + Math.pow(projected - expectedPoints, 2);
  }, 0) / pointsPerMin.length;
  
  // Blend with archetype prior variance
  const blendedVariance = 0.6 * empiricalVariance + 0.4 * archetypePrior.variance;
  
  // If odds line is provided, nudge mean toward it (50% weight)
  let finalMean = expectedPoints;
  if (oddsLine && oddsLine.line) {
    finalMean = 0.5 * expectedPoints + 0.5 * oddsLine.line;
  }
  
  // Calculate Negative Binomial parameters (r, p)
  // mean = r(1-p)/p, variance = r(1-p)/p²
  // Ensure variance > mean (overdispersion requirement)
  const variance = Math.max(blendedVariance, finalMean * 1.2);
  const p = finalMean / variance;
  const r = (finalMean * p) / (1 - p);
  
  return {
    distribution: 'negative-binomial',
    mean: finalMean,
    variance,
    r: Math.max(1, r), // Ensure r >= 1
    p: Math.min(0.99, Math.max(0.01, p)), // Bound p
    archetype,
    source: oddsLine ? 'hybrid' : 'empirical',
    oddsLineUsed: oddsLine ? oddsLine.line : null
  };
}

/**
 * Reuse existing REB/AST model predictions
 * (In production, this would call your actual model endpoints)
 */
async function getReboundsAssistsFromModel(playerName, gameId, teamId, oppTeam) {
  // Placeholder - in production, this would call:
  // - netlify/functions/nba-generate.mjs for rebounds
  // - netlify/functions/nba-generate.mjs for assists
  // For now, return null to indicate we need to implement integration
  
  return {
    rebounds: {
      mean: null,
      sd: null,
      confidence: null,
      source: 'existing-model-placeholder'
    },
    assists: {
      mean: null,
      sd: null,
      confidence: null,
      source: 'existing-model-placeholder'
    }
  };
}

/**
 * Build empirical CDF from sampled distribution
 */
function sampleAndBuildCDF(distribution, sampleSize, seed) {
  const samples = [];
  
  if (distribution.distribution === 'negative-binomial') {
    const { r, p } = distribution;
    for (let i = 0; i < sampleSize; i++) {
      samples.push(negativeBinomialSample(r, p, seed + i));
    }
  } else if (distribution.type === 'log-normal') {
    const { mean, sd } = distribution;
    for (let i = 0; i < sampleSize; i++) {
      samples.push(logNormalSample(mean, sd, seed + i));
    }
  } else if (distribution.type === 'beta-pert') {
    // Not yet implemented in this version
    throw new Error('Beta-PERT not yet implemented');
  }
  
  return buildEmpiricalCDF(samples);
}

// ==================== MAIN MARGINALS BUILDER ====================

/**
 * Build marginal distributions for all players in today's games
 */
export async function buildMarginals(dateString) {
  console.log(`\n🎯 Building marginal distributions for ${dateString}...`);
  
  // Fetch today's schedule
  const schedule = await fetchSchedule(dateString);
  if (!schedule || schedule.length === 0) {
    console.log('⚠️  No games scheduled for this date');
    return [];
  }
  
  console.log(`📅 Found ${schedule.length} games`);
  
  // Fetch injuries
  const injuries = await fetchInjuries();
  console.log(`🏥 Loaded ${injuries.length} injury reports`);
  
  // Build marginals for each game
  const allMarginals = [];
  
  for (const game of schedule) {
    const { gameId, homeTeam, awayTeam, date } = game;
    console.log(`\n🏀 Processing ${awayTeam} @ ${homeTeam} (${gameId})`);
    
    // Fetch lineups (starters)
    const lineups = await fetchLineups(gameId);
    
    // Check back-to-back status
    const homeB2B = await isBackToBack(homeTeam, date);
    const awayB2B = await isBackToBack(awayTeam, date);
    
    // Fetch betting odds for points lines
    const bettingOdds = await fetchBettingOdds(dateString, gameId);
    const playerPropsOdds = bettingOdds?.markets?.filter(m => 
      m.key === 'player_points'
    ) || [];
    
    // Process both teams
    for (const team of [homeTeam, awayTeam]) {
      const isHome = team === homeTeam;
      const oppTeam = isHome ? awayTeam : homeTeam;
      const isB2B = isHome ? homeB2B : awayB2B;
      
      // Get starters for this team
      const starters = lineups[team] || [];
      
      // For each starter, build marginals
      for (const playerName of starters) {
        try {
          // Fetch player game logs
          const gameLogs = await fetchPlayerGameLogs(playerName);
          const recentGames = gameLogs.slice(0, LOOKBACK_GAMES);
          
          if (recentGames.length === 0) {
            console.log(`  ⚠️  No game logs found for ${playerName}`);
            continue;
          }
          
          // 1. Minutes distribution
          const minutesDist = buildMinutesDistribution(
            playerName, 
            recentGames, 
            injuries, 
            isB2B, 
            team, 
            date
          );
          
          // 2. Points distribution
          const pointsOddsLine = playerPropsOdds.find(p => 
            p.description?.toLowerCase().includes(playerName.toLowerCase())
          );
          const pointsDist = buildPointsDistribution(
            playerName, 
            recentGames, 
            minutesDist, 
            pointsOddsLine
          );
          
          // 3. Rebounds/Assists from existing model
          const rebAst = await getReboundsAssistsFromModel(
            playerName, 
            gameId, 
            team, 
            oppTeam
          );
          
          // 4. Build CDFs
          const seed = Date.now() + allMarginals.length;
          
          // Minutes CDF
          const minutesCDF = sampleAndBuildCDF(minutesDist, SAMPLE_SIZE, seed);
          
          // Points CDF
          const pointsCDF = sampleAndBuildCDF(pointsDist, SAMPLE_SIZE, seed + SAMPLE_SIZE);
          
          // Store marginals
          allMarginals.push({
            playerName,
            team,
            oppTeam,
            gameId,
            date: dateString,
            isStarter: true,
            isBackToBack: isB2B,
            
            minutes: {
              distribution: minutesDist,
              cdf: minutesCDF,
              mean: minutesDist.mean,
              sd: minutesDist.sd
            },
            
            points: {
              distribution: pointsDist,
              cdf: pointsCDF,
              mean: pointsDist.mean,
              variance: pointsDist.variance
            },
            
            rebounds: {
              mean: rebAst.rebounds.mean,
              sd: rebAst.rebounds.sd,
              confidence: rebAst.rebounds.confidence,
              cdf: null // Will be populated by existing model
            },
            
            assists: {
              mean: rebAst.assists.mean,
              sd: rebAst.assists.sd,
              confidence: rebAst.assists.confidence,
              cdf: null // Will be populated by existing model
            }
          });
          
          console.log(`  ✅ ${playerName}: MIN=${minutesDist.mean.toFixed(1)}, PTS=${pointsDist.mean.toFixed(1)}`);
          
        } catch (error) {
          console.error(`  ❌ Error processing ${playerName}:`, error.message);
        }
      }
    }
  }
  
  console.log(`\n✅ Built marginals for ${allMarginals.length} players`);
  return allMarginals;
}

/**
 * Save marginals to file
 */
export function saveMarginals(marginals, dateString) {
  const outputDir = './data/nba/ddtd/marginals';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, `${dateString}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(marginals, null, 2));
  
  console.log(`💾 Saved marginals to ${outputPath}`);
  return outputPath;
}

// ==================== CLI EXECUTION ====================

if (import.meta.url === `file://${process.argv[1]}`) {
  const dateArg = process.argv[2];
  
  if (!dateArg) {
    console.error('Usage: node build-marginals.mjs YYYY-MM-DD');
    process.exit(1);
  }
  
  try {
    const marginals = await buildMarginals(dateArg);
    
    if (marginals.length > 0) {
      saveMarginals(marginals, dateArg);
      
      // Print summary
      console.log('\n📊 MARGINALS SUMMARY');
      console.log('='.repeat(60));
      
      const archetypes = {};
      const roles = {};
      
      marginals.forEach(m => {
        const arch = m.points.distribution.archetype;
        const role = m.minutes.distribution.role;
        archetypes[arch] = (archetypes[arch] || 0) + 1;
        roles[role] = (roles[role] || 0) + 1;
      });
      
      console.log('\nArchetype Distribution:');
      Object.entries(archetypes).forEach(([arch, count]) => {
        console.log(`  ${arch}: ${count} players`);
      });
      
      console.log('\nRole Distribution:');
      Object.entries(roles).forEach(([role, count]) => {
        console.log(`  ${role}: ${count} players`);
      });
      
      console.log('\nTop 5 Projected Points:');
      marginals
        .sort((a, b) => b.points.mean - a.points.mean)
        .slice(0, 5)
        .forEach((m, i) => {
          console.log(`  ${i + 1}. ${m.playerName} (${m.team}): ${m.points.mean.toFixed(1)} pts`);
        });
    }
    
  } catch (error) {
    console.error('❌ Error building marginals:', error);
    process.exit(1);
  }
}
