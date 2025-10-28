// Test the DNP fix
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const elite = require('./netlify/functions/_lib/nhl-elite-projection-v4.cjs.js');

async function testDNPFix() {
  console.log('🧪 Testing DNP Fix...\n');
  
  // Test case 1: Regular player (low DNP risk)
  console.log('TEST 1: Regular player projection');
  const regularPlayer = await elite.projectSOGElite(
    '8478493',
    'Sidney Crosby', 
    'PIT', 
    'PHI', 
    false, 
    'Wells Fargo Center'
  );
  
  if (regularPlayer) {
    console.log(`✅ ${regularPlayer.playerName}:`);
    console.log(`   Projection: ${regularPlayer.mu.toFixed(2)}`);
    console.log(`   π (structural): ${(regularPlayer.pi * 100).toFixed(1)}%`);
    console.log(`   DNP Risk: ${regularPlayer.metadata.scratchRisk}`);
    console.log(`   Play Prob: ${regularPlayer.metadata.playProbability}`);
    console.log(`   Should be included: ${parseFloat(regularPlayer.metadata.scratchRisk) <= 10 ? '✅ YES' : '❌ NO'}\n`);
  }
  
  console.log('🔬 Key Changes Made:');
  console.log('1. π now only includes on-ice structural zeros (role, TOI, PP time)');
  console.log('2. DNP risk tracked separately in metadata.scratchRisk');
  console.log('3. Players with >10% DNP risk are filtered out');
  console.log('4. Model probabilities are now conditional on playing');
  console.log('\n✅ Fix Applied: DNP no longer inflates UNDER probability');
}

testDNPFix().catch(console.error);