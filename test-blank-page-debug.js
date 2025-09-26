// Blank Page Debug Test - Run in Browser Console
// This helps identify what's causing runtime errors

console.log("🔍 BLANK PAGE DEBUGGER - Testing for runtime errors...");

// Test 1: Check if basic functions exist
try {
  console.log("✅ Testing americanToDecimal...");
  const testDecimal = (124 > 0) ? (124 / 100) + 1 : (100 / Math.abs(124)) + 1;
  console.log(`   americanToDecimal(+124) = ${testDecimal}`);
} catch (e) {
  console.error("❌ americanToDecimal failed:", e);
}

// Test 2: Check Kelly function safety
try {
  console.log("✅ Testing kellyUnits function...");
  
  // Mock Kelly function (copy from component)
  function kellyUnits(modelProb, decimalOdds, bankroll = 5000, unitSize = 20, kellyFraction = 0.25, maxUnits = 5) {
    if (!modelProb || !decimalOdds || modelProb <= 0 || decimalOdds <= 1) return 0;
    
    const b = decimalOdds - 1;
    const q = 1 / decimalOdds;
    const p = modelProb;
    const f = (b * p - q) / b;
    
    if (f <= 0) return 0;
    
    const stakeDollars = bankroll * (f * kellyFraction);
    const units = stakeDollars / unitSize;
    
    return Math.min(units, maxUnits);
  }
  
  // Test with various inputs
  console.log(`   Normal case: ${kellyUnits(0.55, 2.24)}`);
  console.log(`   Undefined confidence: ${kellyUnits(undefined, 2.24)}`);
  console.log(`   Zero confidence: ${kellyUnits(0, 2.24)}`);
  console.log(`   NaN confidence: ${kellyUnits(NaN, 2.24)}`);
  console.log(`   Bad odds: ${kellyUnits(0.55, undefined)}`);
} catch (e) {
  console.error("❌ kellyUnits failed:", e);
}

// Test 3: Check confidence division safety
try {
  console.log("✅ Testing confidence calculations...");
  
  const mockML = { confidence: undefined, pick: 'BUF' };
  const safeConf = (mockML.confidence || 0) / 100;
  console.log(`   Undefined confidence: ${safeConf}`);
  
  const mockML2 = { confidence: 75, pick: 'BUF' };
  const safeConf2 = (mockML2.confidence || 0) / 100;
  console.log(`   Normal confidence: ${safeConf2}`);
  
  // Test homeWinProb calculation
  const homeWinProb = mockML.pick === 'BUF' ? ((mockML.confidence || 0) / 100) : (1 - (mockML.confidence || 0) / 100);
  console.log(`   homeWinProb with undefined: ${homeWinProb}`);
} catch (e) {
  console.error("❌ Confidence calculation failed:", e);
}

// Test 4: Check enhanced object access
try {
  console.log("✅ Testing enhanced object safety...");
  
  let enhancedML = undefined;
  
  // Test safe access
  const units1 = enhancedML?.kellyUnits > 0 ? enhancedML.kellyUnits : 0;
  console.log(`   Safe access to undefined: ${units1}`);
  
  // Test fallback initialization
  enhancedML = undefined || {};
  const units2 = enhancedML?.kellyUnits > 0 ? enhancedML.kellyUnits : 0;
  console.log(`   After fallback init: ${units2}`);
} catch (e) {
  console.error("❌ Enhanced object access failed:", e);
}

// Test 5: Check actual predictions data if available
if (window.predictionsData) {
  console.log("✅ Testing with actual predictions data...");
  try {
    const game = window.predictionsData[0];
    if (game) {
      console.log(`   First game: ${game.away_team} @ ${game.home_team}`);
      console.log(`   ML confidence: ${game.predictions?.moneyline?.confidence}`);
      console.log(`   Spread confidence: ${game.predictions?.spread?.confidence}`);
      console.log(`   Has odds: ${!!game.odds}`);
    }
  } catch (e) {
    console.error("❌ Predictions data test failed:", e);
  }
} else {
  console.log("ℹ️ No predictions data available for testing");
}

console.log(`
🎯 RESULTS:
- If all tests show ✅, the blank page issue should be resolved
- If you see ❌ errors, those indicate remaining issues
- Check browser Network tab for API failures
- Check browser Console for additional errors

💡 NEXT STEPS:
1. Refresh your predictions page
2. Check if Kelly units display correctly  
3. Look for "BET X.XU" instead of just "BET"
4. Verify devigged edges show properly
`);