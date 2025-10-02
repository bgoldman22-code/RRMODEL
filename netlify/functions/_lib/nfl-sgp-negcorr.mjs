// netlify/functions/_lib/nfl-sgp-negcorr.mjs
// NFL Same-Game Parlay Negative Correlation Scanner
// Identifies Explosive & Steady Playmaker archetypes with high-likelihood prop combos

/**
 * ARCHETYPE DEFINITIONS
 */
export const ARCHETYPES = {
  EXPLOSIVE: {
    label: 'Explosive Playmaker',
    description: 'High Yards, Low Receptions - deep threats, screen RBs',
    thresholds: {
      min_adot: 8.0,           // WR deep threats
      min_yac_per_rec: 7.0,    // RB explosive screens
      max_targets: 8.0,        // Lower volume (relaxed)
      min_explosive_rate: 0.15 // 15%+ explosive plays (relaxed)
    }
  },
  STEADY: {
    label: 'Steady Playmaker',
    description: 'Low Yards, High Receptions - slot WRs, possession TEs',
    thresholds: {
      max_adot: 7.5,           // Short routes
      max_yac_per_rec: 5.0,    // Not YAC-heavy
      min_targets: 6.0,        // Higher volume
      max_explosive_rate: 0.12 // Low explosive rate
    }
  }
};

/**
 * ALT LINE COMBOS TO SCAN
 */
export const ALT_LINE_COMBOS = {
  EXPLOSIVE: [
    // Under receptions, Over yards
    { rec: { line: 2.5, side: 'under' }, yards: { line: 39.5, side: 'over' } },
    { rec: { line: 2.5, side: 'under' }, yards: { line: 49.5, side: 'over' } },
    { rec: { line: 3.5, side: 'under' }, yards: { line: 49.5, side: 'over' } },
    { rec: { line: 3.5, side: 'under' }, yards: { line: 59.5, side: 'over' } },
    { rec: { line: 4.5, side: 'under' }, yards: { line: 59.5, side: 'over' } },
    { rec: { line: 4.5, side: 'under' }, yards: { line: 69.5, side: 'over' } }
  ],
  STEADY: [
    // Over receptions, Under yards
    { rec: { line: 4.5, side: 'over' }, yards: { line: 39.5, side: 'under' } },
    { rec: { line: 5.5, side: 'over' }, yards: { line: 39.5, side: 'under' } },
    { rec: { line: 5.5, side: 'over' }, yards: { line: 49.5, side: 'under' } },
    { rec: { line: 6.5, side: 'over' }, yards: { line: 44.5, side: 'under' } },
    { rec: { line: 6.5, side: 'over' }, yards: { line: 54.5, side: 'under' } },
    { rec: { line: 7.5, side: 'over' }, yards: { line: 49.5, side: 'under' } }
  ]
};

/**
 * Classify player archetype based on stats
 */
export function classifyArchetype(playerStats) {
  const { proj_adot, proj_yac_per_rec, total_targets, games_played, proj_explosive_rate } = playerStats;
  
  const avg_targets = total_targets / games_played;
  
  // Check Explosive criteria (relaxed logic - either high aDOT OR high YAC, and decent explosive rate)
  const isExplosive = (
    (proj_adot >= ARCHETYPES.EXPLOSIVE.thresholds.min_adot ||
     proj_yac_per_rec >= ARCHETYPES.EXPLOSIVE.thresholds.min_yac_per_rec) &&
    avg_targets <= ARCHETYPES.EXPLOSIVE.thresholds.max_targets
  ) || (
    proj_explosive_rate >= ARCHETYPES.EXPLOSIVE.thresholds.min_explosive_rate &&
    avg_targets <= ARCHETYPES.EXPLOSIVE.thresholds.max_targets
  );
  
  // Check Steady criteria
  const isSteady = (
    proj_adot <= ARCHETYPES.STEADY.thresholds.max_adot &&
    proj_yac_per_rec <= ARCHETYPES.STEADY.thresholds.max_yac_per_rec &&
    avg_targets >= ARCHETYPES.STEADY.thresholds.min_targets &&
    proj_explosive_rate <= ARCHETYPES.STEADY.thresholds.max_explosive_rate
  );
  
  if (isExplosive) return 'EXPLOSIVE';
  if (isSteady) return 'STEADY';
  return null; // Not a clear archetype
}

/**
 * Negative binomial random variate (overdispersed Poisson for targets)
 * Using gamma-Poisson mixture
 */
function negBinomialRandom(mean, overdispersion = 1.5) {
  // Shape parameter (lower = more variance)
  const r = mean / (overdispersion - 1);
  const p = r / (r + mean);
  
  // Gamma random (approximate via sum of exponentials for small r)
  let gamma = 0;
  for (let i = 0; i < Math.ceil(r); i++) {
    gamma += -Math.log(Math.random());
  }
  gamma *= (1 - p) / p;
  
  // Poisson(gamma)
  let k = 0;
  let L = Math.exp(-gamma);
  let p_k = 1;
  while (p_k > L) {
    k++;
    p_k *= Math.random();
  }
  return k - 1;
}

/**
 * Sample yards per catch from two-component mixture
 * Short component + explosive component
 */
function sampleYardsPerCatch(adot, yacPerRec, explosiveRate) {
  // Short component: centered around adot + yac
  const shortMean = Math.max(2, adot * 0.6 + yacPerRec);
  const shortStd = Math.max(1, shortMean * 0.4);
  
  // Explosive component: lognormal tail
  const explosiveMean = Math.max(15, adot * 1.5 + yacPerRec * 2);
  const explosiveStd = explosiveMean * 0.5;
  
  // Choose component
  const isExplosive = Math.random() < explosiveRate;
  
  if (isExplosive) {
    // Lognormal (approximate via Box-Muller then exp)
    const mu = Math.log(explosiveMean) - 0.5 * Math.log(1 + (explosiveStd / explosiveMean) ** 2);
    const sigma = Math.sqrt(Math.log(1 + (explosiveStd / explosiveMean) ** 2));
    
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    return Math.max(0, Math.exp(mu + sigma * z));
  } else {
    // Normal (Box-Muller)
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    return Math.max(0, shortMean + shortStd * z);
  }
}

/**
 * Simulate one game outcome for a player
 * Returns { receptions, yards }
 */
function simulatePlayerGame(projTargets, catchRate, adot, yacPerRec, explosiveRate) {
  // Sample targets
  const targets = Math.max(0, negBinomialRandom(projTargets, 1.5));
  
  // Sample receptions (binomial)
  let receptions = 0;
  for (let i = 0; i < targets; i++) {
    if (Math.random() < catchRate) receptions++;
  }
  
  // Sample yards (sum of YPC draws)
  let yards = 0;
  for (let i = 0; i < receptions; i++) {
    yards += sampleYardsPerCatch(adot, yacPerRec, explosiveRate);
  }
  
  return { receptions, yards: Math.round(yards) };
}

/**
 * Calculate probability of a combo via simulation
 */
export function calculateComboProb(playerProj, combo, numSims = 50000) {
  const { projTargets, catchRate, adot, yacPerRec, explosiveRate } = playerProj;
  
  let hits = 0;
  
  for (let i = 0; i < numSims; i++) {
    const outcome = simulatePlayerGame(projTargets, catchRate, adot, yacPerRec, explosiveRate);
    
    // Check if outcome satisfies combo
    const recHit = combo.rec.side === 'under' 
      ? outcome.receptions <= combo.rec.line 
      : outcome.receptions >= combo.rec.line;
    
    const yardsHit = combo.yards.side === 'under'
      ? outcome.yards <= combo.yards.line
      : outcome.yards >= combo.yards.line;
    
    if (recHit && yardsHit) hits++;
  }
  
  return hits / numSims;
}

/**
 * Build player projection from stats, game context, opponent defense
 */
export function buildPlayerProjection(playerStats, gameContext, opponentDefense) {
  const { team, position } = playerStats;
  const { total_targets, games_played, proj_catch_rate, proj_adot, proj_yac_per_rec, proj_explosive_rate } = playerStats;
  
  // Base targets per game
  const baseTargetsPerGame = total_targets / games_played;
  
  // Game script adjustment (team pass attempts forecast)
  const teamPassAttempts = gameContext.projPassAttempts || 35;
  const leagueAvgPassAttempts = 35;
  const scriptMultiplier = teamPassAttempts / leagueAvgPassAttempts;
  
  // Opponent defense adjustment
  const defenseStats = opponentDefense.find(d => d.team === gameContext.opponent && d.position === position);
  const catchRateAdj = defenseStats ? defenseStats.proj_catch_rate_allowed / 0.65 : 1.0; // League avg ~65%
  const explosiveAdj = defenseStats ? defenseStats.proj_explosive_rate_allowed / 0.15 : 1.0; // League avg ~15%
  
  // Final projections
  const projTargets = baseTargetsPerGame * scriptMultiplier;
  const catchRate = Math.min(0.95, Math.max(0.40, proj_catch_rate * catchRateAdj));
  const adot = proj_adot;
  const yacPerRec = proj_yac_per_rec;
  const explosiveRate = Math.min(0.40, Math.max(0.05, proj_explosive_rate * explosiveAdj));
  
  return {
    projTargets,
    catchRate,
    adot,
    yacPerRec,
    explosiveRate,
    confidence: gameContext.availabilityConf || 0.80
  };
}

/**
 * Scan player for best alt line combos
 */
export function scanPlayerCombos(playerStats, playerProj, archetype) {
  const combos = ALT_LINE_COMBOS[archetype];
  const results = [];
  
  for (const combo of combos) {
    const prob = calculateComboProb(playerProj, combo, 50000);
    
    // Only include if probability is reasonable (15-50% range for good value)
    if (prob >= 0.15 && prob <= 0.50) {
      results.push({
        combo,
        trueProbability: prob,
        reasoning: generateReasoning(playerStats, playerProj, combo, archetype)
      });
    }
  }
  
  // Return top 3 combos by probability
  return results
    .sort((a, b) => b.trueProbability - a.trueProbability)
    .slice(0, 3);
}

/**
 * Generate human-readable reasoning for a combo
 */
function generateReasoning(playerStats, playerProj, combo, archetype) {
  const reasons = [];
  
  if (archetype === 'EXPLOSIVE') {
    if (playerProj.adot >= 10) {
      reasons.push(`Deep threat (aDOT ${playerProj.adot.toFixed(1)})`);
    }
    if (playerProj.yacPerRec >= 7) {
      reasons.push(`Elite YAC (${playerProj.yacPerRec.toFixed(1)} per catch)`);
    }
    if (playerProj.explosiveRate >= 0.25) {
      reasons.push(`High explosive rate (${(playerProj.explosiveRate * 100).toFixed(0)}%)`);
    }
  } else {
    if (playerProj.adot <= 6) {
      reasons.push(`Short routes (aDOT ${playerProj.adot.toFixed(1)})`);
    }
    if (playerProj.projTargets >= 7) {
      reasons.push(`High volume (${playerProj.projTargets.toFixed(1)} proj targets)`);
    }
    if (playerProj.catchRate >= 0.70) {
      reasons.push(`High catch rate (${(playerProj.catchRate * 100).toFixed(0)}%)`);
    }
  }
  
  return reasons.join(', ');
}

/**
 * Main scanner: process all players for a slate
 */
export function scanSlate(playerStats, gameContexts, opponentDefense) {
  const candidates = [];
  
  for (const player of playerStats) {
    // Get game context for this player's team
    const gameContext = gameContexts.find(g => g.team === player.team);
    if (!gameContext) continue;
    
    // Classify archetype
    const archetype = classifyArchetype(player);
    if (!archetype) continue;
    
    // Build projection
    const playerProj = buildPlayerProjection(player, gameContext, opponentDefense);
    
    // Scan combos
    const combos = scanPlayerCombos(player, playerProj, archetype);
    
    // Add to candidates
    for (const comboResult of combos) {
      candidates.push({
        player: player.player_name,
        team: player.team,
        position: player.position,
        archetype: ARCHETYPES[archetype].label,
        combo: comboResult.combo,
        trueProbability: comboResult.trueProbability,
        reasoning: comboResult.reasoning,
        inputs: {
          projTargets: playerProj.projTargets,
          projCatchRate: playerProj.catchRate,
          aDOT: playerProj.adot,
          yacPerReception: playerProj.yacPerRec,
          explosiveRate: playerProj.explosiveRate,
          gameScript: gameContext.script || 'neutral',
          availabilityConf: playerProj.confidence
        }
      });
    }
  }
  
  // Sort by probability descending
  return candidates.sort((a, b) => b.trueProbability - a.trueProbability);
}

export default {
  classifyArchetype,
  buildPlayerProjection,
  calculateComboProb,
  scanPlayerCombos,
  scanSlate,
  ARCHETYPES,
  ALT_LINE_COMBOS
};
