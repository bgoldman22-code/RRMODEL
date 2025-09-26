/**
 * Test the specific cases from the live data to debug model binding
 */

// Test functions (copied from main file)
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

  const modelImpliedHomeFav = model.homeSpread < -1;
  const modelSignOk = (modelImpliedHomeFav && model.homeSpread < 0) || 
                      (!modelImpliedHomeFav && model.homeSpread >= -1);

  if (!modelSignOk) {
    return {
      pickedTeamId: null,
      market: null, 
      model: null,
      edgePts: null,
      isBet: false,
      reason: "⚠ Model sign mismatch"
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

console.log('🔍 Testing Live Data Cases\n');

// Test Case 1: CLE @ DET (Problem case from live data)
// Live: CLE +9.5, Model shows "Cleveland -12.6"  
console.log('Test 1: CLE @ DET');
const game1 = { 
  homeId: 'DET', 
  awayId: 'CLE', 
  favoriteId: 'DET', // DET is favorite in spread market
  spreadAbs: 9.5 
};
const model1 = { homeSpread: 12.6 }; // If model thinks DET favored by 12.6

console.log('Market spreads:');
console.log('- CLE (away):', marketSpreadForTeam(game1, 'CLE'));
console.log('- DET (home):', marketSpreadForTeam(game1, 'DET'));

console.log('Model spreads:');
console.log('- CLE (away):', modelSpreadForTeam(game1, model1, 'CLE'));
console.log('- DET (home):', modelSpreadForTeam(game1, model1, 'DET'));

const result1 = pickBestSpreadSide(game1, model1);
console.log('Result:', result1);
console.log('');

// Test Case 2: What if model thinks CLE should be favored?
console.log('Test 2: CLE @ DET (Model thinks CLE favored)');
const model2 = { homeSpread: -12.6 }; // Model thinks CLE (away) favored by 12.6

console.log('Market spreads:');
console.log('- CLE (away):', marketSpreadForTeam(game1, 'CLE'));
console.log('- DET (home):', marketSpreadForTeam(game1, 'DET'));

console.log('Model spreads:');
console.log('- CLE (away):', modelSpreadForTeam(game1, model2, 'CLE'));
console.log('- DET (home):', modelSpreadForTeam(game1, model2, 'DET'));

const result2 = pickBestSpreadSide(game1, model2);
console.log('Result:', result2);
console.log('');

// Test Case 3: MIN @ PIT (from live data)
// Live: MIN +2.5, shows "Minnesota Pick 'em" in model
console.log('Test 3: MIN @ PIT');
const game3 = { 
  homeId: 'PIT', 
  awayId: 'MIN', 
  favoriteId: 'MIN', // MIN is favorite 
  spreadAbs: 2.5 
};
const model3 = { homeSpread: -0.1 }; // Model: essentially pick'em, slight PIT edge

console.log('Market spreads:');
console.log('- MIN (away):', marketSpreadForTeam(game3, 'MIN'));
console.log('- PIT (home):', marketSpreadForTeam(game3, 'PIT'));

console.log('Model spreads:');
console.log('- MIN (away):', modelSpreadForTeam(game3, model3, 'MIN'));
console.log('- PIT (home):', modelSpreadForTeam(game3, model3, 'PIT'));

const result3 = pickBestSpreadSide(game3, model3);
console.log('Result:', result3);
console.log('');