/**
 * Unit tests for favorite-based spread logic
 * Prevents regressions in spread sign calculations and edge detection
 */

// Import the functions (adjust path as needed)
// For now, copying the functions locally for testing

function spreadLabel(n) {
  if (n == null) return "—";
  if (Math.abs(n) < 0.25) return "Pick 'em";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

function marketSpreadForTeam(game, teamId) {
  if (game.favoriteId == null || game.spreadAbs == null) return null;
  return teamId === game.favoriteId ? -game.spreadAbs : +game.spreadAbs;
}

function modelSpreadForTeam(game, model, teamId) {
  return teamId === game.homeId ? model.homeSpread : -model.homeSpread;
}

function pickBestSpreadSide(game, model) {
  const teams = [game.homeId, game.awayId];

  if (game.favoriteId == null || game.spreadAbs == null) {
    return { 
      pickedTeamId: null, 
      market: null, 
      model: null, 
      edgePts: null, 
      isBet: false, 
      reason: "No market spread" 
    };
  }

  const scored = teams.map(teamId => {
    const mkt = marketSpreadForTeam(game, teamId);
    const mdl = modelSpreadForTeam(game, model, teamId);
    const edge = mkt - mdl;
    return { teamId, mkt, mdl, edge };
  });

  scored.sort((a, b) => b.edge - a.edge);
  const best = scored[0];

  const isBet = Number.isFinite(best.edge) && best.edge > 0.5;

  return {
    pickedTeamId: best.teamId,
    market: best.mkt,
    model: best.mdl,
    edgePts: best.edge,
    isBet,
    reason: isBet ? "Value vs model" : "No value"
  };
}

// Test helper
function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`❌ ${message}`);
    console.error(`Expected:`, expected);
    console.error(`Actual:`, actual);
  } else {
    console.log(`✅ ${message}`);
  }
}

// Test Suite
console.log('🧪 Testing Favorite-Based Spread Logic\n');

// Test 1: MIN @ PIT (favorite = MIN, spreadAbs = 2.5)
console.log('Test 1: MIN @ PIT');
const game1 = { homeId: 'PIT', awayId: 'MIN', favoriteId: 'MIN', spreadAbs: 2.5 };
const model1 = { homeSpread: -0.2 }; // PIT slight favorite in model

// Market spreads
assertEquals(marketSpreadForTeam(game1, 'MIN'), -2.5, 'MIN market spread (favorite)');
assertEquals(marketSpreadForTeam(game1, 'PIT'), +2.5, 'PIT market spread (dog)');

// Model spreads  
assertEquals(modelSpreadForTeam(game1, model1, 'PIT'), -0.2, 'PIT model spread (home)');
assertEquals(modelSpreadForTeam(game1, model1, 'MIN'), +0.2, 'MIN model spread (away)');

// Edge calculation
const result1 = pickBestSpreadSide(game1, model1);
assertEquals(result1.pickedTeamId, 'PIT', 'Should pick PIT');
assertEquals(result1.market, 2.5, 'PIT market line');
assertEquals(result1.model, -0.2, 'PIT model line');  
assertEquals(Math.round(result1.edgePts * 10) / 10, 2.7, 'PIT edge = +2.7 pts');
assertEquals(result1.isBet, true, 'Should be a bet (edge > 0.5)');

console.log('');

// Test 2: DET vs CLE (favorite = DET, spreadAbs = 9.5, DET is home)  
console.log('Test 2: DET @ CLE');
const game2 = { homeId: 'DET', awayId: 'CLE', favoriteId: 'DET', spreadAbs: 9.5 };
const model2 = { homeSpread: +12.6 }; // Model says CLE should be favored by 12.6

// Market spreads
assertEquals(marketSpreadForTeam(game2, 'DET'), -9.5, 'DET market spread (favorite)');
assertEquals(marketSpreadForTeam(game2, 'CLE'), +9.5, 'CLE market spread (dog)');

// Model spreads
assertEquals(modelSpreadForTeam(game2, model2, 'DET'), +12.6, 'DET model spread (home)');
assertEquals(modelSpreadForTeam(game2, model2, 'CLE'), -12.6, 'CLE model spread (away)');

// Edge calculation - should pick CLE with massive edge
const result2 = pickBestSpreadSide(game2, model2);
assertEquals(result2.pickedTeamId, 'CLE', 'Should pick CLE');
assertEquals(result2.market, 9.5, 'CLE market line');
assertEquals(result2.model, -12.6, 'CLE model line');
assertEquals(Math.round(result2.edgePts * 10) / 10, 22.1, 'CLE edge = +22.1 pts');
assertEquals(result2.isBet, true, 'Should be a bet (huge edge)');

console.log('');

// Test 3: Pick 'em game
console.log('Test 3: Pick \'em Game');  
const game3 = { homeId: 'BUF', awayId: 'MIA', favoriteId: 'BUF', spreadAbs: 0.5 };
const model3 = { homeSpread: -0.1 }; // Very close game in model too

const result3 = pickBestSpreadSide(game3, model3);
assertEquals(result3.pickedTeamId, 'MIA', 'Should pick MIA (tiny edge)');
assertEquals(result3.market, 0.5, 'MIA market line');
assertEquals(result3.model, 0.1, 'MIA model line'); 
assertEquals(Math.round(result3.edgePts * 10) / 10, 0.4, 'MIA edge = +0.4 pts');
assertEquals(result3.isBet, false, 'Should NOT bet (edge < 0.5 threshold)');

console.log('');

// Test 4: Missing odds data
console.log('Test 4: Missing Odds Data');
const game4 = { homeId: 'KC', awayId: 'LV', favoriteId: null, spreadAbs: null };
const model4 = { homeSpread: -3.2 };

const result4 = pickBestSpreadSide(game4, model4);
assertEquals(result4.pickedTeamId, null, 'Should have no pick');
assertEquals(result4.market, null, 'Should have no market data');
assertEquals(result4.isBet, false, 'Should not be a bet');
assertEquals(result4.reason, 'No market spread', 'Should show no market reason');

console.log('');

// Test 5: Spread label formatting
console.log('Test 5: Spread Label Formatting');
assertEquals(spreadLabel(3.5), '+3.5', 'Positive spread');
assertEquals(spreadLabel(-7.0), '-7.0', 'Negative spread');
assertEquals(spreadLabel(0.1), "Pick 'em", 'Near-zero spread');
assertEquals(spreadLabel(-0.2), "Pick 'em", 'Near-zero negative');
assertEquals(spreadLabel(null), '—', 'Null spread');

console.log('\n🎉 All tests completed!');