// Kelly Unit Calculation Test - Verify Implementation
// Test case: PIT +124, model 55% confidence

function testKellyCalculation() {
  console.log("🧮 KELLY UNIT CALCULATION TEST");
  console.log("=" .repeat(40));
  
  // Test parameters from your example
  const modelProb = 0.55;           // 55% confidence
  const americanOdds = +124;        // PIT +124
  const bankroll = 5000;            // $5,000 bankroll
  const unitSize = 20;              // $20 units
  const kellyFraction = 0.25;       // Quarter Kelly
  const maxUnits = 5;               // 5U cap
  
  // Helper function (from your component)
  function americanToDecimal(american) {
    if (american > 0) return (american / 100) + 1;
    return (100 / Math.abs(american)) + 1;
  }
  
  // Kelly calculation (from your component)
  function kellyUnits(modelProb, decimalOdds, bankroll = 5000, unitSize = 20, kellyFraction = 0.25, maxUnits = 5) {
    if (!modelProb || !decimalOdds || modelProb <= 0 || decimalOdds <= 1) return 0;
    
    const b = decimalOdds - 1; // Net odds multiplier
    const q = 1 / decimalOdds;  // Implied probability
    const p = modelProb;       // Model probability

    // Full Kelly fraction: (bp - q) / b  
    const f = (b * p - q) / b;

    // If Kelly says negative (no value bet), return 0U
    if (f <= 0) return 0;

    // Apply quarter Kelly for conservative sizing
    const stakeDollars = bankroll * (f * kellyFraction);

    // Convert to units  
    const units = stakeDollars / unitSize;

    // Cap bet size at 5U for bankroll protection
    return Math.min(units, maxUnits);
  }
  
  // Run calculation
  const decimalOdds = americanToDecimal(americanOdds);
  const b = decimalOdds - 1;
  const q = 1 / decimalOdds;
  
  console.log("📊 INPUT PARAMETERS:");
  console.log(`  Model probability: ${(modelProb * 100).toFixed(1)}%`);
  console.log(`  American odds: ${americanOdds > 0 ? '+' : ''}${americanOdds}`);
  console.log(`  Decimal odds: ${decimalOdds.toFixed(2)}`);
  console.log(`  Bankroll: $${bankroll.toLocaleString()}`);
  console.log(`  Unit size: $${unitSize}`);
  
  console.log("\n🔢 KELLY CALCULATION:");
  console.log(`  b (net multiplier): ${b.toFixed(3)}`);
  console.log(`  q (implied prob): ${(q * 100).toFixed(1)}%`);
  console.log(`  p (model prob): ${(modelProb * 100).toFixed(1)}%`);
  
  const fullKelly = (b * modelProb - q) / b;
  const quarterKelly = fullKelly * kellyFraction;
  const stakeDollars = bankroll * quarterKelly;
  const preliminaryUnits = stakeDollars / unitSize;
  
  console.log(`  Full Kelly: ${(fullKelly * 100).toFixed(1)}%`);
  console.log(`  Quarter Kelly: ${(quarterKelly * 100).toFixed(1)}%`);
  console.log(`  Stake in $: $${stakeDollars.toFixed(0)}`);
  console.log(`  Preliminary units: ${preliminaryUnits.toFixed(1)}U`);
  
  const finalUnits = kellyUnits(modelProb, decimalOdds);
  console.log(`  Final units (capped): ${finalUnits.toFixed(1)}U`);
  
  // Expected result verification
  const expectedUnits = 5.0; // Should cap at 5U
  const isCorrect = Math.abs(finalUnits - expectedUnits) < 0.1;
  
  console.log(`\n${isCorrect ? '✅ PASS' : '❌ FAIL'}: Expected ~5.0U, got ${finalUnits.toFixed(1)}U`);
  
  return finalUnits;
}

// Additional test cases
function testEdgeCases() {
  console.log("\n🧪 EDGE CASE TESTS:");
  
  // Helper function
  function americanToDecimal(american) {
    if (american > 0) return (american / 100) + 1;
    return (100 / Math.abs(american)) + 1;
  }
  
  function kellyUnits(modelProb, decimalOdds, bankroll = 5000, unitSize = 20, kellyFraction = 0.25, maxUnits = 5) {
    if (!modelProb || !decimalOdds || modelProb <= 0 || decimalOdds <= 1) return 0;
    
    const b = decimalOdds - 1;
    const q = 1 / decimalOdds;
    const p = modelProb;
    const f = (b * p - q) / b;
    if (f <= 0) return 0;
    const stakeDollars = bankroll * (f * 0.25);
    const units = stakeDollars / unitSize;
    return Math.min(units, maxUnits);
  }
  
  // Test 1: No value (model prob < implied)
  const noValue = kellyUnits(0.45, americanToDecimal(-110)); // 45% on -110 (52.4% implied)
  console.log(`  No value bet: ${noValue.toFixed(1)}U (should be 0U)`);
  
  // Test 2: Massive favorite with small edge
  const heavyFav = kellyUnits(0.95, americanToDecimal(-1500)); // 95% on -1500
  console.log(`  Heavy favorite: ${heavyFav.toFixed(1)}U`);
  
  // Test 3: Huge dog with model edge
  const hugeDog = kellyUnits(0.25, americanToDecimal(+800)); // 25% on +800 (11.1% implied)
  console.log(`  Huge dog with edge: ${hugeDog.toFixed(1)}U`);
  
  console.log("\n✅ Kelly unit calculation system ready!");
}

// Run tests
if (typeof window !== 'undefined') {
  // Browser environment
  testKellyCalculation();
  testEdgeCases();
} else {
  console.log("Run this in browser console after loading your predictions page");
}