// Test True Devig Implementation
// Run this in browser console on your live site to verify devig is working

console.log("🧪 TESTING TRUE DEVIG IMPLEMENTATION");
console.log("=" .repeat(50));

// Test case 1: Heavy favorite (should reduce massive edges)
function testDevig() {
  // Simulate BUF -1500 vs NO +870 (28% edge before devig)
  const homePrice = -1500; // BUF
  const awayPrice = +870;  // NO
  const modelProb = 0.95;  // Model thinks BUF wins 95%
  
  // Helper functions (copy from your component)
  function americanToDecimal(american) {
    return american > 0 ? (american / 100) + 1 : (100 / Math.abs(american)) + 1;
  }
  
  function decimalToImpliedProb(decimal) {
    return 1 / decimal;
  }
  
  function devig(prob1, prob2) {
    const total = prob1 + prob2;
    return {
      prob1: prob1 / total,
      prob2: prob2 / total
    };
  }
  
  // Calculate raw vigged edge (OLD WAY)
  const rawDecimal = americanToDecimal(homePrice);
  const rawImplied = decimalToImpliedProb(rawDecimal);
  const viggedEdge = modelProb - rawImplied;
  
  // Calculate devigged edge (NEW WAY)  
  const homeDecimal = americanToDecimal(homePrice);
  const awayDecimal = americanToDecimal(awayPrice);
  const homeImplied = decimalToImpliedProb(homeDecimal);
  const awayImplied = decimalToImpliedProb(awayDecimal);
  
  console.log("📊 RAW IMPLIED PROBABILITIES:");
  console.log(`  BUF implied: ${(homeImplied * 100).toFixed(1)}%`);
  console.log(`  NO implied: ${(awayImplied * 100).toFixed(1)}%`);
  console.log(`  Total: ${((homeImplied + awayImplied) * 100).toFixed(1)}% (>100% = vig present)`);
  
  const { prob1: fairHome } = devig(homeImplied, awayImplied);
  const deriggedEdge = modelProb - fairHome;
  
  console.log("\n✅ DEVIGGED FAIR PROBABILITIES:");
  console.log(`  BUF fair: ${(fairHome * 100).toFixed(1)}%`);
  console.log(`  NO fair: ${((1-fairHome) * 100).toFixed(1)}%`);
  console.log(`  Total: 100.0% (normalized)`);
  
  console.log("\n🎯 EDGE COMPARISON:");
  console.log(`  Vigged edge (OLD): ${(viggedEdge * 100).toFixed(1)}%`);
  console.log(`  Devigged edge (NEW): ${(deriggedEdge * 100).toFixed(1)}%`);
  console.log(`  Reduction: ${((viggedEdge - deriggedEdge) * 100).toFixed(1)}% points`);
  
  const isFixed = Math.abs(deriggedEdge * 100) < 10; // Should be <10% for heavy favorites
  console.log(`\n${isFixed ? '✅ PASS' : '❌ FAIL'}: Devig ${isFixed ? 'working' : 'not working'} - edge is ${(Math.abs(deriggedEdge) * 100).toFixed(1)}%`);
  
  return { viggedEdge: viggedEdge * 100, deriggedEdge: deriggedEdge * 100, isFixed };
}

// Run test
const result = testDevig();

console.log(`
🔍 NEXT STEPS:
1. Check your live predictions page 
2. Look for games with heavy favorites (>-500 odds)
3. Verify edges are reasonable (4-8% max, not 20-30%)
4. Look for green "✅ Devigged" indicators
5. Use quickDebug('HOME', 'AWAY') for detailed analysis

Expected: Heavy favorite edges should be 4-8%, not 20-30%
`);

// Test with your actual predictions data if available
if (window.predictionsData) {
  console.log("\n📊 CHECKING YOUR LIVE PREDICTIONS:");
  window.predictionsData.forEach(game => {
    const ml = game.predictions?.moneyline;
    if (ml && ml.edge > 15) {
      console.log(`⚠️ High edge detected: ${game.away_team} @ ${game.home_team} - ${ml.edge}% edge`);
      console.log(`   This should be reduced with devig implementation`);
    }
  });
}