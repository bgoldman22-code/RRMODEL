/**
 * Test exact live data scenarios to debug the mismatch
 */

// Copy the actual functions 
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
  // model.homeSpread: positive = home favored by X, negative = away favored by X
  // Return the spread from the perspective of teamId (negative = favored, positive = underdog)
  if (teamId === game.homeId) {
    return -model.homeSpread; // If home favored by 12.6, return -12.6 for home team  
  } else {
    return model.homeSpread; // If home favored by 12.6, return +12.6 for away team
  }
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

  // Check both teams for value and pick the one with better edge
  const scored = teams.map(teamId => {
    const mkt = marketSpreadForTeam(game, teamId);
    const mdl = modelSpreadForTeam(game, model, teamId);
    const edge = mkt - mdl; // positive => value
    return { teamId, mkt, mdl, edge };
  });

  console.log('Scores:', scored);

  // Choose the team with the larger edge
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
}function spreadDisplayFromPick({ homeAbbr, awayAbbr, favoriteId, spreadAbs, modelHomeMargin, TEAM_NAME }) {
  const game = { 
    homeId: homeAbbr, 
    awayId: awayAbbr, 
    favoriteId, 
    spreadAbs: Number.isFinite(spreadAbs) ? spreadAbs : null 
  };
  
  const model = { homeSpread: modelHomeMargin };
  const result = pickBestSpreadSide(game, model);
  
  if (result.pickedTeamId == null) {
    return {
      pickText: "Odds Unavailable",
      bookText: "Line: No market data",
      modelText: `Model: Home ${spreadLabel(modelHomeMargin)} / Away ${spreadLabel(-modelHomeMargin)}`
    };
  }

  if (!result.isBet) {
    return {
      pickText: "No Value",
      bookText: `Best Line: ${TEAM_NAME[result.pickedTeamId] || result.pickedTeamId} ${spreadLabel(result.market)}`,
      modelText: `Model: ${TEAM_NAME[result.pickedTeamId] || result.pickedTeamId} ${spreadLabel(result.model)}`
    };
  }

  const pickName = TEAM_NAME[result.pickedTeamId] || result.pickedTeamId;
  
  return {
    pickText: pickName,
    bookText: `Line: ${pickName} ${spreadLabel(result.market)}`,
    modelText: `Model: ${pickName} ${spreadLabel(result.model)}`
  };
}

// Test with exact live data
const TEAM_NAME = {
  'CLE': 'Cleveland Browns',
  'DET': 'Detroit Lions',
  'MIN': 'Minnesota Vikings', 
  'PIT': 'Pittsburgh Steelers'
};

console.log('🔍 Live Data Debugging\n');

// CLE @ DET: Live shows "Cleveland Browns +9.5 | Model: Cleveland Browns -12.6"
// This suggests backend sent model_home_margin = +12.6 but display shows wrong sign
console.log('Case: CLE @ DET');
console.log('Live display shows: "Cleveland Browns +9.5 | Model: Cleveland Browns -12.6"');
console.log('This means: backend sent model_home_margin = ??? \n');

// Test A: If backend sent +12.6 (DET favored by 12.6)
const testA = spreadDisplayFromPick({
  homeAbbr: 'DET',
  awayAbbr: 'CLE', 
  favoriteId: 'DET', // DET is spread favorite
  spreadAbs: 9.5,
  modelHomeMargin: +12.6, // Backend says DET favored by 12.6
  TEAM_NAME
});

console.log('Test A (backend sends +12.6):');
console.log('Result:', testA);
console.log('Expected: Should pick CLE with +22.1 edge');
console.log('');

// Test B: If backend sent -12.6 (CLE favored by 12.6) 
const testB = spreadDisplayFromPick({
  homeAbbr: 'DET',
  awayAbbr: 'CLE',
  favoriteId: 'DET', // DET is spread favorite
  spreadAbs: 9.5,
  modelHomeMargin: -12.6, // Backend says CLE favored by 12.6
  TEAM_NAME
});

console.log('Test B (backend sends -12.6):');
console.log('Result:', testB);
console.log('Expected: Should pick DET with smaller edge');
console.log('');

// Test your exact examples
console.log('=== YOUR EXAMPLES ===');

// Case 1: Model thinks DET wins by 12.6, market has DET -9.5  
console.log('Case 1: Model thinks DET wins by 12.6');
const case1 = spreadDisplayFromPick({
  homeAbbr: 'DET',
  awayAbbr: 'CLE', 
  favoriteId: 'DET', // DET -9.5
  spreadAbs: 9.5,
  modelHomeMargin: +12.6, // DET favored by 12.6
  TEAM_NAME
});
console.log('Result:', case1);
console.log('Expected: Pick DET, show "DET -9.5" and "DET -12.6"');
console.log('');

// Case 2: Model thinks CLE loses by only 4, market has CLE +9.5
console.log('Case 2: Model thinks CLE loses by only 4'); 
const case2 = spreadDisplayFromPick({
  homeAbbr: 'DET',
  awayAbbr: 'CLE',
  favoriteId: 'DET', // DET -9.5 
  spreadAbs: 9.5,
  modelHomeMargin: +4.0, // DET favored by 4
  TEAM_NAME
});
console.log('Result:', case2);  
console.log('Expected: Pick CLE, show "CLE +9.5" and "CLE +4.0"');
console.log('');

// Case 3: Model thinks CLE wins by 4, market has CLE +9.5
console.log('Case 3: Model thinks CLE wins by 4');
const case3 = spreadDisplayFromPick({
  homeAbbr: 'DET', 
  awayAbbr: 'CLE',
  favoriteId: 'DET', // DET -9.5
  spreadAbs: 9.5,
  modelHomeMargin: -4.0, // CLE favored by 4
  TEAM_NAME
});
console.log('Result:', case3);
console.log('Expected: Pick CLE, show "CLE +9.5" and "CLE -4.0"');
console.log('');