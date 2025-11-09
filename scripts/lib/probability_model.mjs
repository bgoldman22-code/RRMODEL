/**
 * Enhanced HR Probability Model
 * 
 * Calculates probability a batter hits HR today using:
 * - Player's HR score (historical stats)
 * - Pitcher difficulty (ERA, HR/9, GB/FB rate)
 * - Park factors (venue-specific)
 * - Recent form (last 7/15 games)
 * - Platoon advantage (L/R matchup)
 * 
 * Returns probability (0.00 to 1.00)
 */

import { getParkFactor } from './park_factors.mjs';

/**
 * Calculate base HR score from player stats
 */
export function calculateHRScore(player) {
  const hrRate = (player.HR || 0) / Math.max(player.AB || 1, 1);
  const iso = player.ISO || 0;
  const hrFB = (player['HR/FB'] || 0) / 100; // Convert percentage
  const hardPct = (player['Hard%'] || 0) / 100;
  
  // Weighted formula: HR Rate 50%, ISO 25%, HR/FB 15%, Hard% 10%
  const score = (hrRate * 50) + (iso * 25) + (hrFB * 15) + (hardPct * 10);
  
  return {
    score: score * 100, // Scale to 0-100
    hrRate: hrRate,
    iso: iso,
    hrFB: hrFB * 100,
    hardPct: hardPct * 100
  };
}

/**
 * Calculate pitcher difficulty factor
 * Lower = easier to hit HR against
 * Range: 0.7 (easy) to 1.3 (hard)
 */
export function calculatePitcherDifficulty(pitcherProfile) {
  if (!pitcherProfile) return 1.0; // Neutral if no data
  
  const era = pitcherProfile.era || 4.50;
  const hr9 = pitcherProfile.homeRunsPer9 || 1.2;
  const gbPct = pitcherProfile.groundBallPct || 45;
  
  // Lower ERA = harder (multiply by 1.1-1.3)
  // Higher HR/9 = easier (multiply by 0.8-1.0)
  // Lower GB% = easier (more fly balls)
  
  let difficulty = 1.0;
  
  // ERA adjustment (-0.1 to +0.2)
  if (era < 3.00) difficulty += 0.15;        // Ace
  else if (era < 3.50) difficulty += 0.10;   // Good
  else if (era < 4.00) difficulty += 0.05;   // Above avg
  else if (era > 5.00) difficulty -= 0.10;   // Bad
  else if (era > 6.00) difficulty -= 0.15;   // Very bad
  
  // HR/9 adjustment (-0.15 to +0.1)
  if (hr9 < 0.8) difficulty += 0.10;         // Stingy
  else if (hr9 > 1.5) difficulty -= 0.10;    // Generous
  else if (hr9 > 2.0) difficulty -= 0.15;    // Very generous
  
  // GB% adjustment (-0.1 to +0.1)
  if (gbPct > 50) difficulty += 0.08;        // Ground ball pitcher
  else if (gbPct < 40) difficulty -= 0.08;   // Fly ball pitcher
  
  return Math.max(0.7, Math.min(1.3, difficulty));
}

/**
 * Calculate platoon advantage
 * Returns multiplier based on handedness matchup
 */
export function calculatePlatoonAdvantage(batterHand, pitcherHand) {
  // Same-handed matchup (harder)
  if (batterHand === pitcherHand) {
    return 0.85; // -15% penalty
  }
  
  // Opposite-handed matchup (easier)
  return 1.15; // +15% bonus
}

/**
 * Calculate recent form factor
 * Adjusts based on hot/cold streak
 */
export function calculateFormFactor(recentStats) {
  if (!recentStats || !recentStats.last7) return 1.0;
  
  const last7HR = recentStats.last7.hr || 0;
  const last7Games = recentStats.last7.games || 7;
  
  // 3+ HR in last 7 = hot (1.15x)
  // 2 HR in last 7 = warm (1.08x)
  // 0-1 HR = cold (0.92x)
  
  if (last7HR >= 3) return 1.15;
  if (last7HR >= 2) return 1.08;
  if (last7HR >= 1) return 1.00;
  return 0.92;
}

/**
 * Main probability calculator
 */
export function calculateHRProbability(player, matchup, game) {
  // 1. Base probability from HR score
  const hrScore = calculateHRScore(player);
  let probability = hrScore.hrRate; // Start with historical HR rate
  
  // 2. Adjust for pitcher difficulty
  if (matchup && matchup.pitcherProfile) {
    const pitcherDifficulty = calculatePitcherDifficulty(matchup.pitcherProfile);
    probability = probability / pitcherDifficulty;
  }
  
  // 3. Adjust for park factor
  if (game && game.venue) {
    const parkFactor = getParkFactor(game.venue, player.Bats || 'R');
    probability = probability * parkFactor.handed;
  }
  
  // 4. Adjust for platoon advantage
  if (player.Bats && matchup && matchup.pitcherHand) {
    const platoonFactor = calculatePlatoonAdvantage(player.Bats, matchup.pitcherHand);
    probability = probability * platoonFactor;
  }
  
  // 5. Adjust for recent form
  if (player.recentStats) {
    const formFactor = calculateFormFactor(player.recentStats);
    probability = probability * formFactor;
  }
  
  // 6. Apply floor and ceiling (1% to 40% range)
  probability = Math.max(0.01, Math.min(0.40, probability));
  
  return probability;
}

/**
 * Calculate Expected Value
 */
export function calculateEV(probability, odds) {
  const expectedReturn = probability * odds;
  const expectedValue = expectedReturn - 1;
  const edge = probability - (1 / odds);
  
  return {
    ev: expectedValue,
    edge: edge,
    expectedReturn: expectedReturn
  };
}

/**
 * Generate detailed "WHY" explanation
 */
export function generateWHY(player, matchup, game, parkFactor) {
  const reasons = [];
  
  // 1. H2H stats
  if (matchup && matchup.h2h && matchup.h2h.hasData) {
    const h2h = matchup.h2h;
    reasons.push(`${h2h.hr} HR in ${h2h.ab} AB vs ${matchup.pitcher} (${h2h.avg} BA)`);
  }
  
  // 2. Pitcher profile
  if (matchup && matchup.pitcherProfile) {
    const p = matchup.pitcherProfile;
    if (p.homeRunsPer9 > 1.5) {
      reasons.push(`Pitcher allows ${p.homeRunsPer9.toFixed(1)} HR/9 (${((p.homeRunsPer9 / 1.2 - 1) * 100).toFixed(0)}% above league avg)`);
    }
    if (p.flyBallPct > 40) {
      reasons.push(`High fly ball pitcher (${p.flyBallPct.toFixed(0)}% FB rate)`);
    }
    if (p.era > 4.50) {
      reasons.push(`Struggling pitcher (${p.era.toFixed(2)} ERA)`);
    }
  }
  
  // 3. Park factor
  if (parkFactor && parkFactor.handed !== 1.0) {
    const pct = ((parkFactor.handed - 1) * 100).toFixed(0);
    const sign = parkFactor.handed > 1 ? '+' : '';
    const hand = player.Bats === 'R' ? 'RHH' : 'LHH';
    reasons.push(`${game.venue}: ${sign}${pct}% HR park for ${hand}`);
  }
  
  // 4. Recent form
  if (player.recentStats && player.recentStats.last7) {
    const hr = player.recentStats.last7.hr;
    if (hr >= 2) {
      reasons.push(`Hot streak: ${hr} HR in last 7 games`);
    }
  }
  
  // 5. Power metrics
  if (player.ISO > 0.250) {
    reasons.push(`Elite power (${player.ISO.toFixed(3)} ISO)`);
  }
  if (player['Barrel%'] > 15) {
    reasons.push(`High barrel rate (${player['Barrel%'].toFixed(1)}%)`);
  }
  
  return reasons;
}

export default {
  calculateHRScore,
  calculateHRProbability,
  calculateEV,
  generateWHY,
  calculatePitcherDifficulty,
  calculatePlatoonAdvantage,
  calculateFormFactor
};
