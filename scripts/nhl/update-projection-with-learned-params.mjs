/**
 * Update Projection Engine to Use Learned Parameters
 * 
 * This script modifies nhl-elite-projection-v4.cjs.js to:
 * 1. Load learned_parameters.json instead of hardcoded assumptions
 * 2. Use team-specific home/away multipliers
 * 3. Apply fitted TOI power law
 * 4. Use learned streak multipliers
 * 5. Apply fitted ZINB dispersion
 * 
 * Run AFTER training pipeline completes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Updating Projection Engine with Learned Parameters');
console.log('='.repeat(70));

// Check if learned parameters exist
const paramsPath = path.join(__dirname, '../../data/nhl/learned_parameters.json');

if (!fs.existsSync(paramsPath)) {
  console.error('\n❌ ERROR: learned_parameters.json not found!');
  console.error('   Run the training pipeline first:');
  console.error('   node scripts/nhl/train-elite-model.mjs\n');
  process.exit(1);
}

const params = JSON.parse(fs.readFileSync(paramsPath, 'utf-8'));

console.log('✅ Loaded learned parameters');
console.log(`   Generated: ${params.generatedAt}`);
console.log(`   Training games: ${params.trainingGames?.toLocaleString() || 'N/A'}`);

// Generate code snippets
console.log('\n📝 Generating code snippets...\n');

// 1. Home/away effects
console.log('1️⃣  HOME/AWAY EFFECTS (Team-Specific):');
console.log('-'.repeat(70));
console.log('Replace this line:');
console.log('  baseSOG *= isHome ? 1.08 : 0.94;');
console.log('\nWith:');
console.log(`
const HOME_AWAY_EFFECTS = ${JSON.stringify(params.homeAwayEffects, null, 2)};

// Team-specific home/away adjustment
const homeAwayMultiplier = isHome 
  ? (HOME_AWAY_EFFECTS[team]?.homeMultiplier || 1.05)
  : 1.0;
baseSOG *= homeAwayMultiplier;
`);

// 2. Streak effects
console.log('\n2️⃣  STREAK EFFECTS (Data-Fitted):');
console.log('-'.repeat(70));
console.log('Replace detectStreak function with:');
console.log(`
const LEARNED_STREAK = {
  hotMultiplier: ${params.streakEffects?.hotMultiplier || 1.15},
  coldMultiplier: ${params.streakEffects?.coldMultiplier || 0.85},
  hotThreshold: ${params.streakEffects?.hotThreshold || 4.0},
  coldThreshold: ${params.streakEffects?.coldThreshold || 1.0}
};

function detectStreak(recentGames) {
  if (!recentGames || recentGames.length < 3) return { factor: 1.0, type: 'neutral' };
  const last5 = recentGames.slice(0, 5);
  const avgShots = last5.reduce((sum, g) => sum + (g.shots || 0), 0) / last5.length;
  const isHot = avgShots >= LEARNED_STREAK.hotThreshold;
  const isCold = avgShots <= LEARNED_STREAK.coldThreshold;
  if (isHot) return { factor: LEARNED_STREAK.hotMultiplier, type: 'hot' };
  if (isCold) return { factor: LEARNED_STREAK.coldMultiplier, type: 'cold' };
  return { factor: 1.0, type: 'neutral' };
}
`);

// 3. TOI adjustment
console.log('\n3️⃣  TOI ADJUSTMENT (Power Law Fitted):');
console.log('-'.repeat(70));
console.log('Replace TOI adjustment section with:');
console.log(`
const TOI_POWER_LAW = {
  exponent: ${params.toiRelationship?.powerLaw?.exponent || 0.92},
  coefficient: ${params.toiRelationship?.powerLaw?.coefficient || 0.85}
};

const expectedTOI = calculateExpectedTOI(player);
const leagueAvgTOI = player.position === 'D' ? 20.0 : 16.0;
const toiRatio = expectedTOI / leagueAvgTOI;

// Use fitted power law instead of sqrt assumption
const toiFactor = Math.pow(toiRatio, TOI_POWER_LAW.exponent);
baseSOG *= toiFactor;
`);

// 4. ZINB dispersion
console.log('\n4️⃣  ZINB DISPERSION (MLE Fitted):');
console.log('-'.repeat(70));
console.log('Replace dispersion assignment with:');
console.log(`
const LEARNED_DISPERSION = {
  forward: ${params.dispersionParams?.forward || 2.4},
  defense: ${params.dispersionParams?.defense || 3.5}
};

let dispersion = player.position === 'D' 
  ? LEARNED_DISPERSION.defense 
  : LEARNED_DISPERSION.forward;
`);

// 5. PP boost
console.log('\n5️⃣  POWER PLAY BOOST (Data-Driven):');
console.log('-'.repeat(70));
console.log('Replace PP boost calculation with:');
console.log(`
const LEARNED_PP_BOOST = {
  pp1Multiplier: ${params.powerPlayBoost?.pp1Boost || 1.3},
  pp2Multiplier: ${params.powerPlayBoost?.pp2Boost || 1.15},
  baselineShots: ${params.powerPlayBoost?.baselineAvgShots || 2.5}
};

const ppUnit = determinePPUnit(player);
if (ppUnit === 'PP1') {
  baseSOG *= LEARNED_PP_BOOST.pp1Multiplier;
} else if (ppUnit === 'PP2') {
  baseSOG *= LEARNED_PP_BOOST.pp2Multiplier;
}
// Adjust for opponent PK strength
const pkAdjustment = 1.0 + ((1.0 - (oppDefense.penaltyKillPct || 0.8)) * 0.5);
baseSOG *= pkAdjustment;
`);

// Summary
console.log('\n' + '='.repeat(70));
console.log('✅ Code snippets generated!');
console.log('\n📋 MANUAL STEPS REQUIRED:');
console.log('   1. Open: netlify/functions/_lib/nhl-elite-projection-v4.cjs.js');
console.log('   2. Copy/paste the code snippets above');
console.log('   3. Test with: node netlify/functions/nhl-sog-scanner-elite-fast.js');
console.log('   4. Commit changes to git');
console.log('\n💡 TIP: Search for the old code in the file to find exact locations');

// Save as reference file
const referenceCode = `
/**
 * LEARNED PARAMETERS FOR NHL ELITE PROJECTION ENGINE
 * Generated: ${params.generatedAt}
 * Training games: ${params.trainingGames?.toLocaleString() || 'N/A'}
 */

// HOME/AWAY EFFECTS (Team-Specific)
const HOME_AWAY_EFFECTS = ${JSON.stringify(params.homeAwayEffects, null, 2)};

// STREAK EFFECTS (Data-Fitted)
const LEARNED_STREAK = {
  hotMultiplier: ${params.streakEffects?.hotMultiplier || 1.15},
  coldMultiplier: ${params.streakEffects?.coldMultiplier || 0.85},
  hotThreshold: ${params.streakEffects?.hotThreshold || 4.0},
  coldThreshold: ${params.streakEffects?.coldThreshold || 1.0}
};

// TOI POWER LAW (Fitted)
const TOI_POWER_LAW = {
  exponent: ${params.toiRelationship?.powerLaw?.exponent || 0.92},
  coefficient: ${params.toiRelationship?.powerLaw?.coefficient || 0.85}
};

// ZINB DISPERSION (MLE Fitted)
const LEARNED_DISPERSION = {
  forward: ${params.dispersionParams?.forward || 2.4},
  defense: ${params.dispersionParams?.defense || 3.5}
};

// POWER PLAY BOOST (Data-Driven)
const LEARNED_PP_BOOST = {
  pp1Multiplier: ${params.powerPlayBoost?.pp1Boost || 1.3},
  pp2Multiplier: ${params.powerPlayBoost?.pp2Boost || 1.15},
  baselineShots: ${params.powerPlayBoost?.baselineAvgShots || 2.5}
};

// VENUE EFFECTS (if available)
const VENUE_EFFECTS = ${JSON.stringify(params.venueEffects, null, 2)};
`;

const refPath = path.join(__dirname, '../../netlify/functions/_lib/learned-parameters-reference.js');
fs.writeFileSync(refPath, referenceCode);

console.log(`\n💾 Saved reference code to: ${refPath}`);
console.log('\n🚀 Ready to deploy ELITE data-driven model!\n');
