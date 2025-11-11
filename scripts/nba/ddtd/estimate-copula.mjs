/**
 * Phase 3: Gaussian Copula Estimation & Monte Carlo Sampling for DD/TD
 * 
 * Estimates correlation structure between PTS/REB/AST using:
 * - Hierarchical priors by archetype (scorer, secondary, role_player, defensive)
 * - Empirical correlation from historical game logs
 * - Shrinkage toward identity (regularization)
 * 
 * Performs Monte Carlo sampling (25k draws, seeded) to calculate:
 * - p_DD: Probability of Double-Double (2 stats >= 10)
 * - p_TD: Probability of Triple-Double (3 stats >= 10)
 * - Pairwise joints: p_PR (points+rebounds), p_PA (points+assists), p_RA (rebounds+assists)
 * 
 * Output: DD/TD probabilities with confidence intervals (bootstrap)
 */

import { gaussianCopulaSamples, shrinkCorrelation, buildEmpiricalCDF } from './utils-distributions.mjs';
import { fetchPlayerGameLogs } from './utils-data.mjs';
import fs from 'fs';
import path from 'path';

// ==================== CONFIGURATION ====================

const MONTE_CARLO_DRAWS = 25000; // Default sampling size
const BOOTSTRAP_ITERATIONS = 1000; // For confidence intervals
const SHRINKAGE_LAMBDA = 0.3; // Shrinkage toward identity (30%)

// Archetype correlation priors (PTS-REB-AST)
// Based on typical stat profiles for each archetype
const CORRELATION_PRIORS = {
  scorer: {
    // High scorers: PTS-REB moderate, PTS-AST weak, REB-AST weak
    matrix: [
      [1.00, 0.25, 0.15],  // PTS vs [PTS, REB, AST]
      [0.25, 1.00, 0.10],  // REB vs [PTS, REB, AST]
      [0.15, 0.10, 1.00]   // AST vs [PTS, REB, AST]
    ],
    weight: 0.3 // 30% prior weight
  },
  
  secondary: {
    // Balanced players: moderate correlations across board
    matrix: [
      [1.00, 0.30, 0.25],
      [0.30, 1.00, 0.20],
      [0.25, 0.20, 1.00]
    ],
    weight: 0.3
  },
  
  role_player: {
    // Role players: stronger PTS-REB, weaker assists
    matrix: [
      [1.00, 0.40, 0.10],
      [0.40, 1.00, 0.05],
      [0.10, 0.05, 1.00]
    ],
    weight: 0.3
  },
  
  defensive: {
    // Defensive specialists: strong REB-AST, weak PTS correlation
    matrix: [
      [1.00, 0.20, 0.05],
      [0.20, 1.00, 0.30],
      [0.05, 0.30, 1.00]
    ],
    weight: 0.3
  },
  
  unknown: {
    // Generic prior: weak correlations
    matrix: [
      [1.00, 0.20, 0.15],
      [0.20, 1.00, 0.15],
      [0.15, 0.15, 1.00]
    ],
    weight: 0.4 // Higher prior weight when uncertain
  }
};

// DD/TD thresholds
const DD_THRESHOLD = 10;
const TD_THRESHOLD = 10;

// ==================== CORRELATION ESTIMATION ====================

/**
 * Calculate empirical correlation matrix from game logs
 */
function calculateEmpiricalCorrelation(gameLogs) {
  if (gameLogs.length < 5) {
    return null; // Not enough data
  }
  
  // Extract PTS, REB, AST vectors
  const validGames = gameLogs.filter(g => 
    g.points !== null && g.rebounds !== null && g.assists !== null && g.minutes > 5
  );
  
  if (validGames.length < 5) {
    return null;
  }
  
  const pts = validGames.map(g => g.points);
  const reb = validGames.map(g => g.rebounds);
  const ast = validGames.map(g => g.assists);
  
  // Calculate means
  const meanPts = pts.reduce((a, b) => a + b, 0) / pts.length;
  const meanReb = reb.reduce((a, b) => a + b, 0) / reb.length;
  const meanAst = ast.reduce((a, b) => a + b, 0) / ast.length;
  
  // Calculate standard deviations
  const sdPts = Math.sqrt(pts.reduce((sum, p) => sum + Math.pow(p - meanPts, 2), 0) / pts.length);
  const sdReb = Math.sqrt(reb.reduce((sum, r) => sum + Math.pow(r - meanReb, 2), 0) / reb.length);
  const sdAst = Math.sqrt(ast.reduce((sum, a) => sum + Math.pow(a - meanAst, 2), 0) / ast.length);
  
  if (sdPts === 0 || sdReb === 0 || sdAst === 0) {
    return null; // No variance
  }
  
  // Calculate correlations
  let corrPtsReb = 0, corrPtsAst = 0, corrRebAst = 0;
  
  for (let i = 0; i < pts.length; i++) {
    corrPtsReb += ((pts[i] - meanPts) / sdPts) * ((reb[i] - meanReb) / sdReb);
    corrPtsAst += ((pts[i] - meanPts) / sdPts) * ((ast[i] - meanAst) / sdAst);
    corrRebAst += ((reb[i] - meanReb) / sdReb) * ((ast[i] - meanAst) / sdAst);
  }
  
  corrPtsReb /= pts.length;
  corrPtsAst /= pts.length;
  corrRebAst /= pts.length;
  
  // Construct correlation matrix
  return [
    [1.00, corrPtsReb, corrPtsAst],
    [corrPtsReb, 1.00, corrRebAst],
    [corrPtsAst, corrRebAst, 1.00]
  ];
}

/**
 * Blend empirical correlation with archetype prior
 */
function blendCorrelations(empiricalMatrix, archetype) {
  const prior = CORRELATION_PRIORS[archetype] || CORRELATION_PRIORS.unknown;
  const priorMatrix = prior.matrix;
  const priorWeight = prior.weight;
  
  if (!empiricalMatrix) {
    // No empirical data - use prior only
    return priorMatrix;
  }
  
  // Blend: (1 - w) * empirical + w * prior
  const blended = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      blended[i][j] = (1 - priorWeight) * empiricalMatrix[i][j] + priorWeight * priorMatrix[i][j];
    }
  }
  
  return blended;
}

/**
 * Estimate correlation matrix for player with hierarchical priors
 */
export async function estimateCorrelationMatrix(playerName, archetype, lookbackGames = 20) {
  console.log(`  📊 Estimating correlation for ${playerName} (${archetype})...`);
  
  // Fetch recent game logs
  const gameLogs = await fetchPlayerGameLogs(playerName);
  const recentGames = gameLogs.slice(0, lookbackGames);
  
  // Calculate empirical correlation
  const empiricalCorr = calculateEmpiricalCorrelation(recentGames);
  
  // Blend with archetype prior
  const blendedCorr = blendCorrelations(empiricalCorr, archetype);
  
  // Apply shrinkage toward identity
  const finalCorr = shrinkCorrelation(blendedCorr, SHRINKAGE_LAMBDA);
  
  return {
    correlationMatrix: finalCorr,
    empirical: empiricalCorr,
    archetype,
    gamesUsed: recentGames.length,
    source: empiricalCorr ? 'blended' : 'prior-only'
  };
}

// ==================== MONTE CARLO SAMPLING ====================

/**
 * Convert CDF to inverse CDF (for copula sampling)
 */
function createInverseCDF(cdf) {
  return (u) => {
    // Find value where CDF(x) = u
    // Linear interpolation between CDF points
    
    if (u <= 0) return cdf.values[0];
    if (u >= 1) return cdf.values[cdf.values.length - 1];
    
    for (let i = 0; i < cdf.probabilities.length - 1; i++) {
      if (cdf.probabilities[i] <= u && u < cdf.probabilities[i + 1]) {
        // Linear interpolation
        const t = (u - cdf.probabilities[i]) / (cdf.probabilities[i + 1] - cdf.probabilities[i]);
        return cdf.values[i] + t * (cdf.values[i + 1] - cdf.values[i]);
      }
    }
    
    return cdf.values[cdf.values.length - 1];
  };
}

/**
 * Sample DD/TD using Gaussian copula
 */
export function sampleDDTD(marginals, correlationMatrix, numSamples = MONTE_CARLO_DRAWS, seed = Date.now()) {
  console.log(`  🎲 Sampling ${numSamples} draws for DD/TD probabilities...`);
  
  const { points, rebounds, assists } = marginals;
  
  // Create inverse CDFs for marginals
  const invCDF_pts = createInverseCDF(points.cdf);
  const invCDF_reb = createInverseCDF(rebounds.cdf);
  const invCDF_ast = createInverseCDF(assists.cdf);
  
  // Generate copula samples (uniform [0,1])
  const copulaSamples = gaussianCopulaSamples(correlationMatrix, numSamples, seed);
  
  // Transform to original scales using inverse CDFs
  let countDD = 0;
  let countTD = 0;
  let countPR = 0; // Points + Rebounds both >= 10
  let countPA = 0; // Points + Assists both >= 10
  let countRA = 0; // Rebounds + Assists both >= 10
  
  const samples = [];
  
  for (let i = 0; i < numSamples; i++) {
    const [u_pts, u_reb, u_ast] = copulaSamples[i];
    
    const pts = invCDF_pts(u_pts);
    const reb = invCDF_reb(u_reb);
    const ast = invCDF_ast(u_ast);
    
    samples.push({ pts, reb, ast });
    
    // Count DD (2+ stats >= 10)
    const statsOver10 = [pts >= DD_THRESHOLD, reb >= DD_THRESHOLD, ast >= DD_THRESHOLD].filter(Boolean).length;
    if (statsOver10 >= 2) countDD++;
    if (statsOver10 >= 3) countTD++;
    
    // Count pairwise
    if (pts >= DD_THRESHOLD && reb >= DD_THRESHOLD) countPR++;
    if (pts >= DD_THRESHOLD && ast >= DD_THRESHOLD) countPA++;
    if (reb >= DD_THRESHOLD && ast >= DD_THRESHOLD) countRA++;
  }
  
  const p_DD = countDD / numSamples;
  const p_TD = countTD / numSamples;
  const p_PR = countPR / numSamples;
  const p_PA = countPA / numSamples;
  const p_RA = countRA / numSamples;
  
  return {
    p_DD,
    p_TD,
    pairwise: {
      p_PR,
      p_PA,
      p_RA
    },
    samples, // Keep samples for bootstrap
    numSamples
  };
}

/**
 * Calculate confidence intervals via bootstrap
 */
export function bootstrapConfidenceIntervals(samples, confidenceLevel = 0.95) {
  console.log(`  🔄 Bootstrapping confidence intervals (${BOOTSTRAP_ITERATIONS} iterations)...`);
  
  const numSamples = samples.length;
  const bootstrapDD = [];
  const bootstrapTD = [];
  
  for (let iter = 0; iter < BOOTSTRAP_ITERATIONS; iter++) {
    // Resample with replacement
    let countDD = 0;
    let countTD = 0;
    
    for (let i = 0; i < numSamples; i++) {
      const idx = Math.floor(Math.random() * numSamples);
      const { pts, reb, ast } = samples[idx];
      
      const statsOver10 = [pts >= DD_THRESHOLD, reb >= DD_THRESHOLD, ast >= DD_THRESHOLD].filter(Boolean).length;
      if (statsOver10 >= 2) countDD++;
      if (statsOver10 >= 3) countTD++;
    }
    
    bootstrapDD.push(countDD / numSamples);
    bootstrapTD.push(countTD / numSamples);
  }
  
  // Sort and extract percentiles
  bootstrapDD.sort((a, b) => a - b);
  bootstrapTD.sort((a, b) => a - b);
  
  const alpha = (1 - confidenceLevel) / 2;
  const lowerIdx = Math.floor(alpha * BOOTSTRAP_ITERATIONS);
  const upperIdx = Math.floor((1 - alpha) * BOOTSTRAP_ITERATIONS);
  
  return {
    DD: {
      lower: bootstrapDD[lowerIdx],
      upper: bootstrapDD[upperIdx]
    },
    TD: {
      lower: bootstrapTD[lowerIdx],
      upper: bootstrapTD[upperIdx]
    }
  };
}

// ==================== MAIN PIPELINE ====================

/**
 * Estimate DD/TD probabilities for all players from marginals
 */
export async function estimateDDTD(marginalsPath) {
  console.log(`\n🎯 Estimating DD/TD probabilities from ${marginalsPath}...`);
  
  // Load marginals
  const marginals = JSON.parse(fs.readFileSync(marginalsPath, 'utf8'));
  console.log(`📊 Loaded marginals for ${marginals.length} players`);
  
  const results = [];
  
  for (const playerMarginals of marginals) {
    const { playerName, team, gameId, date } = playerMarginals;
    const archetype = playerMarginals.points.distribution.archetype;
    
    console.log(`\n🏀 ${playerName} (${team})`);
    
    try {
      // 1. Estimate correlation matrix
      const correlation = await estimateCorrelationMatrix(playerName, archetype);
      
      // 2. Sample DD/TD using copula
      const sampling = sampleDDTD(
        playerMarginals, 
        correlation.correlationMatrix, 
        MONTE_CARLO_DRAWS
      );
      
      // 3. Bootstrap confidence intervals
      const confidenceIntervals = bootstrapConfidenceIntervals(sampling.samples);
      
      // 4. Store results
      results.push({
        playerName,
        team,
        gameId,
        date,
        archetype,
        
        probabilities: {
          DD: sampling.p_DD,
          TD: sampling.p_TD
        },
        
        confidenceIntervals: {
          DD: confidenceIntervals.DD,
          TD: confidenceIntervals.TD
        },
        
        pairwise: sampling.pairwise,
        
        correlation: {
          matrix: correlation.correlationMatrix,
          source: correlation.source,
          gamesUsed: correlation.gamesUsed
        },
        
        marginals: {
          points: { mean: playerMarginals.points.mean, variance: playerMarginals.points.variance },
          rebounds: { mean: playerMarginals.rebounds.mean, sd: playerMarginals.rebounds.sd },
          assists: { mean: playerMarginals.assists.mean, sd: playerMarginals.assists.sd },
          minutes: { mean: playerMarginals.minutes.mean, sd: playerMarginals.minutes.sd }
        },
        
        metadata: {
          numSamples: sampling.numSamples,
          bootstrapIterations: BOOTSTRAP_ITERATIONS,
          shrinkageLambda: SHRINKAGE_LAMBDA
        }
      });
      
      console.log(`  ✅ DD: ${(sampling.p_DD * 100).toFixed(1)}% [${(confidenceIntervals.DD.lower * 100).toFixed(1)}% - ${(confidenceIntervals.DD.upper * 100).toFixed(1)}%]`);
      console.log(`  ✅ TD: ${(sampling.p_TD * 100).toFixed(1)}% [${(confidenceIntervals.TD.lower * 100).toFixed(1)}% - ${(confidenceIntervals.TD.upper * 100).toFixed(1)}%]`);
      
    } catch (error) {
      console.error(`  ❌ Error estimating DD/TD for ${playerName}:`, error.message);
    }
  }
  
  console.log(`\n✅ Estimated DD/TD probabilities for ${results.length} players`);
  return results;
}

/**
 * Save DD/TD estimates to file
 */
export function saveDDTDEstimates(estimates, dateString) {
  const outputDir = './data/nba/ddtd/estimates';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, `${dateString}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(estimates, null, 2));
  
  console.log(`💾 Saved DD/TD estimates to ${outputPath}`);
  return outputPath;
}

// ==================== CLI EXECUTION ====================

if (import.meta.url === `file://${process.argv[1]}`) {
  const marginalsPath = process.argv[2];
  
  if (!marginalsPath) {
    console.error('Usage: node estimate-copula.mjs <path-to-marginals.json>');
    process.exit(1);
  }
  
  try {
    const estimates = await estimateDDTD(marginalsPath);
    
    if (estimates.length > 0) {
      // Extract date from marginals filename
      const dateMatch = marginalsPath.match(/(\d{4}-\d{2}-\d{2})/);
      const dateString = dateMatch ? dateMatch[1] : 'unknown';
      
      saveDDTDEstimates(estimates, dateString);
      
      // Print summary
      console.log('\n📊 DD/TD PROBABILITY SUMMARY');
      console.log('='.repeat(80));
      
      console.log('\nTop 5 DD Probabilities:');
      estimates
        .sort((a, b) => b.probabilities.DD - a.probabilities.DD)
        .slice(0, 5)
        .forEach((est, i) => {
          const ci = est.confidenceIntervals.DD;
          console.log(`  ${i + 1}. ${est.playerName} (${est.team}): ${(est.probabilities.DD * 100).toFixed(1)}% [${(ci.lower * 100).toFixed(1)}% - ${(ci.upper * 100).toFixed(1)}%]`);
        });
      
      console.log('\nTop 5 TD Probabilities:');
      estimates
        .sort((a, b) => b.probabilities.TD - a.probabilities.TD)
        .slice(0, 5)
        .forEach((est, i) => {
          const ci = est.confidenceIntervals.TD;
          console.log(`  ${i + 1}. ${est.playerName} (${est.team}): ${(est.probabilities.TD * 100).toFixed(1)}% [${(ci.lower * 100).toFixed(1)}% - ${(ci.upper * 100).toFixed(1)}%]`);
        });
      
      // Average probabilities by archetype
      console.log('\nAverage DD Probability by Archetype:');
      const archetypeDD = {};
      estimates.forEach(est => {
        if (!archetypeDD[est.archetype]) {
          archetypeDD[est.archetype] = [];
        }
        archetypeDD[est.archetype].push(est.probabilities.DD);
      });
      
      Object.entries(archetypeDD).forEach(([arch, probs]) => {
        const avg = probs.reduce((a, b) => a + b, 0) / probs.length;
        console.log(`  ${arch}: ${(avg * 100).toFixed(1)}% (${probs.length} players)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error estimating DD/TD:', error);
    process.exit(1);
  }
}
