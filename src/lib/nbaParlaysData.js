/**
 * NBA Parlays Data Utilities
 * 
 * Handles data loading and parlay generation for the NBA Parlays page.
 * Uses seeded RNG for deterministic daily generation.
 */

// Seeded RNG for deterministic parlay generation
export function createSeededRNG(seed) {
  let state = seed;
  return function() {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

// Get today's seed based on date
export function getTodaySeed(clickCount = 0) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = ((seed << 5) - seed) + dateStr.charCodeAt(i);
    seed = seed & seed;
  }
  return Math.abs(seed) + clickCount;
}

// Shuffle array with seeded RNG
export function seededShuffle(array, rng) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Load V1 props data (Rebounds + Assists baseline model)
export async function loadV1Props() {
  try {
    const response = await fetch('/api/nba-player-props').catch(() => null);
    if (response?.ok) {
      const data = await response.json();
      return data.predictions || [];
    }
    const fallback = await fetch('/data/nba/nba-player-props-live.json');
    if (fallback.ok) {
      const data = await fallback.json();
      return data.predictions || [];
    }
    return [];
  } catch (error) {
    console.error('Error loading V1 props:', error);
    return [];
  }
}

// Load V2 props data (Phase 3.5 PRA model)
export async function loadV2Props() {
  try {
    const response = await fetch('/api/nba-props-v2').catch(() => null);
    if (response?.ok) {
      const data = await response.json();
      return { predictions: data.predictions || data.picks || [], metadata: data };
    }
    const fallback = await fetch('/data/nba/nba-props-v2-live.json');
    if (fallback.ok) {
      const data = await fallback.json();
      return { predictions: data.predictions || data.picks || [], metadata: data };
    }
    return { predictions: [], metadata: {} };
  } catch (error) {
    console.error('Error loading V2 props:', error);
    return { predictions: [], metadata: {} };
  }
}

// Load game predictions (Elite V2)
export async function loadGamePredictions() {
  try {
    const timestamp = Date.now();
    const response = await fetch(`/.netlify/functions/nba-predictions-elite-v2?_t=${timestamp}`);
    const data = await response.json();
    if (!data.ok || !data.predictions) return [];
    return data.predictions;
  } catch (error) {
    console.error('Error loading game predictions:', error);
    return [];
  }
}

// Create a key for matching picks across models
export function createPickKey(pick) {
  const player = pick.player?.toLowerCase().trim();
  const propType = pick.propType?.toLowerCase();
  const line = pick.vegasLine || pick.line;
  const side = pick.betSide?.toUpperCase();
  return `${player}|${propType}|${line}|${side}`;
}

// Normalize game key so both team perspectives map to same key
// e.g., "MEM-LAL" and "LAL-MEM" both become "LAL-MEM" (alphabetical order)
export function normalizeGameKey(team, opponent) {
  const t1 = (team || '').toUpperCase().trim();
  const t2 = (opponent || '').toUpperCase().trim();
  // Sort alphabetically to ensure consistent key
  return t1 < t2 ? `${t1}-${t2}` : `${t2}-${t1}`;
}

// Get hit rate value (handles both V1 and V2 formats)
export function getHitRate(pick, window) {
  if (pick.hitRates) {
    const key = `L${window}_hitRate`;
    return pick.hitRates[key] !== undefined ? pick.hitRates[key] / 100 : null;
  }
  const overKey = `L${window}_over_pct`;
  if (pick[overKey] !== undefined) return pick[overKey];
  return null;
}

// Check if pick meets Phase 3.5 criteria
export function meetsPhase35Criteria(pick) {
  const l5 = getHitRate(pick, 5);
  const l10 = getHitRate(pick, 10);
  const l20 = getHitRate(pick, 20);
  if (l5 === null || l5 <= 0.50) return false;
  return (l10 !== null && l10 >= 0.60) || (l20 !== null && l20 >= 0.60);
}

// Stricter Phase 3.5 criteria for SGP (L5>50 AND L10>=60 AND L20>=60)
export function meetsStrictPhase35Criteria(pick) {
  const l5 = getHitRate(pick, 5);
  const l10 = getHitRate(pick, 10);
  const l20 = getHitRate(pick, 20);
  if (l5 === null || l5 <= 0.50) return false;
  if (l10 === null || l10 < 0.60) return false;
  if (l20 === null || l20 < 0.60) return false;
  return true;
}

// Find aligned picks (both V1 and V2 agree)
export function findAlignedPicks(v1Predictions, v2Predictions) {
  const v1Keys = new Map();
  v1Predictions.forEach(pick => {
    v1Keys.set(createPickKey(pick), pick);
  });
  
  const aligned = [];
  v2Predictions.forEach(v2Pick => {
    const key = createPickKey(v2Pick);
    const v1Pick = v1Keys.get(key);
    if (v1Pick) {
      aligned.push({
        ...v2Pick,
        v1Edge: v1Pick.edge,
        v2Edge: v2Pick.edge,
        isAligned: true
      });
    }
  });
  
  return aligned.sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0));
}

// Find strong signals (aligned AND meets Phase 3.5)
export function findStrongSignals(v1Predictions, v2Predictions) {
  const aligned = findAlignedPicks(v1Predictions, v2Predictions);
  return aligned.filter(meetsPhase35Criteria);
}

// Score a prop pick for parlay inclusion (higher = better)
// PRIORITY ORDER: Role+minutes > Edge > L10/L20 > L5 (tiebreaker only)
export function scorePropPick(pick, saferMode = false) {
  let score = 0;
  
  // ===== PROP FILTERS (HARD RULES) =====
  const line = Number(pick.vegasLine || pick.line) || 0;
  const propType = pick.propType?.toLowerCase();
  const betSide = pick.betSide?.toUpperCase();
  
  // AVOID: Unders on lines <= 3.5 (MAJOR penalty)
  if (betSide === 'UNDER' && line <= 3.5) {
    score -= 50;
  }
  
  // AVOID: Assists unders in low ranges
  if (propType === 'assists' && betSide === 'UNDER' && line <= 4.5) {
    score -= 30;
  }
  
  // PRIORITIZE: Overs on 4.5+ (bonus)
  if (betSide === 'OVER' && line >= 4.5) {
    score += 15;
  }
  
  // PRIORITIZE: Unders on 6.5+ (safer cushion)
  if (betSide === 'UNDER' && line >= 6.5) {
    score += 20;
  }
  
  // ===== 1. ROLE + MINUTES CERTAINTY (highest priority) =====
  // Proxy via kelly stake (higher kelly = model more certain)
  const kellyStake = Number(pick.kellyStake) || 0;
  if (kellyStake >= 2.5) score += 25;  // High conviction
  else if (kellyStake >= 1.5) score += 15;
  else if (kellyStake >= 1.0) score += 8;
  
  // Confidence as role proxy
  const confidence = Number(pick.confidence) || 0;
  if (confidence >= 68) score += 15;
  else if (confidence >= 65) score += 8;
  
  // Stable rebound and points props tied to minutes (bonus)
  if ((propType === 'rebounds' || propType === 'points') && line >= 5.5) {
    score += 10; // These correlate well with minutes
  }
  
  // ===== 2. MODEL EDGE % (second priority) =====
  const edge = Number(pick.edge) || 0;
  if (edge >= 10) score += 35;      // PRIORITIZE: 10%+ edge is elite
  else if (edge >= 8) score += 25;
  else if (edge >= 5) score += 15;
  else if (edge >= 3) score += 8;
  
  // ===== 3. L10/L20 CONSISTENCY (third priority) =====
  const l10 = getHitRate(pick, 10);
  const l20 = getHitRate(pick, 20);
  
  if (l10 !== null && l10 >= 0.70) score += 20;
  else if (l10 !== null && l10 >= 0.60) score += 12;
  
  if (l20 !== null && l20 >= 0.70) score += 15;
  else if (l20 !== null && l20 >= 0.60) score += 8;
  
  // ===== 4. L5 AS TIEBREAKER ONLY =====
  const l5 = getHitRate(pick, 5);
  if (l5 !== null && l5 >= 0.80) score += 8;  // Only small bonus
  else if (l5 !== null && l5 >= 0.60) score += 3;
  // L5 alone should NEVER override edge or role certainty
  
  // ===== OTHER FACTORS =====
  // Prefer reasonable odds range
  const odds = Number(pick.odds) || -110;
  if (odds >= -160 && odds <= 130) score += 5;
  else if (odds < -200 || odds > 200) score -= 10;
  
  // Aligned pick bonus
  if (pick.isAligned) score += 15;
  
  // Safer mode adjustments
  if (saferMode && betSide === 'UNDER' && line <= 4.5) {
    score -= 15; // Extra penalty for risky unders
  }
  
  return score;
}

// Score a game leg for parlay inclusion
export function scoreGameLeg(pred, betType, saferMode = false) {
  let score = 0;
  
  const confidence = pred.prediction?.confidence || 0;
  const spread = Math.abs(pred.prediction?.spread?.prediction || 0);
  const vegasSpread = Math.abs(parseFloat(pred.vegasLines?.spread?.line) || 0);
  const winProb = pred.prediction?.winProbability?.favoritePercent || 0;
  const mlOdds = parseFloat(pred.vegasLines?.moneyline?.favorite) || -150;
  
  // Calculate edge from opportunities if available
  const mlOpp = pred.opportunities?.find(o => o.market === 'Moneyline');
  const spreadOpp = pred.opportunities?.find(o => o.market === 'Spread');
  const mlEdge = mlOpp?.edgePercent || 0;
  const spreadEdge = spreadOpp?.edgePercent || 0;
  
  // Check for STRONG label (high-conviction anchor candidate)
  const isStrong = pred.strength === 'STRONG' || confidence >= 70 || 
                   (winProb >= 68 && mlEdge >= 5) || mlEdge >= 8;
  
  // Base confidence score
  score += confidence * 0.5;
  
  if (betType === 'ML') {
    // ANCHOR LOGIC: Only anchor if win probability >= 66% or edge >= 8%
    if (winProb >= 66) score += 25;
    else if (winProb >= 60) score += 10;
    
    // Edge bonus (8%+ edge = value underdog play)
    if (mlEdge >= 8) score += 30;
    else if (mlEdge >= 5) score += 15;
    
    // ML preferred when spread is close
    if (spread <= 3 || vegasSpread <= 3) score += 15;
    if (saferMode) score += 10;
    
    // STRONG games get major boost
    if (isStrong) score += 25;
    
    // Penalty for heavily juiced ML (should use spread instead)
    if (mlOdds <= -240) score -= 40;
    else if (mlOdds <= -200) score -= 15;
    
  } else if (betType === 'spread') {
    // Only use spread if ML is too juiced and model has conviction
    if (mlOdds <= -240 && confidence >= 65) score += 25;
    if (spread >= 4 && confidence >= 65) score += 15;
    score += spreadEdge * 2;
    
    // If ML is reasonable, don't prefer spread
    if (mlOdds > -200) score -= 20;
  }
  
  return score;
}

// Check if a game qualifies as an SGP anchor
export function qualifiesAsAnchor(pred) {
  const winProb = pred.prediction?.winProbability?.favoritePercent || 0;
  const mlOpp = pred.opportunities?.find(o => o.market === 'Moneyline');
  const mlEdge = mlOpp?.edgePercent || 0;
  const isStrong = pred.strength === 'STRONG';
  const confidence = pred.prediction?.confidence || 0;
  
  // Get spread info for underdog spread anchors
  const spreadValue = Math.abs(pred.prediction?.spread?.prediction || 0);
  const vegasSpread = parseFloat(pred.vegasLines?.spread?.line) || 0;
  const isUnderdog = vegasSpread > 0; // Positive spread = underdog
  
  // ANCHOR CRITERIA:
  // 1. High confidence ML (66%+ win prob)
  if (winProb >= 66) return true;
  
  // 2. Game labeled STRONG
  if (isStrong) return true;
  
  // 3. Good edge with reasonable odds
  const mlOdds = parseFloat(pred.vegasLines?.moneyline?.favorite) || -150;
  if (mlEdge >= 8 && mlOdds > -300) return true;
  
  // 4. SPREAD ANCHOR: Model pick with large spread cushion
  // If confidence >= 60% (model likes the team) and spread is +6 or more,
  // the underdog covering is a strong anchor bet
  if (confidence >= 60 && isUnderdog && Math.abs(vegasSpread) >= 6) return true;
  
  // 5. Alternative: Model has moderate win prob (55%+) with big spread (8+)
  if (winProb >= 55 && isUnderdog && Math.abs(vegasSpread) >= 8) return true;
  
  return false;
}

// Determine bet type (ML vs Spread) for anchor
export function getAnchorBetType(pred) {
  const winProb = pred.prediction?.winProbability?.favoritePercent || 0;
  const mlOdds = parseFloat(pred.vegasLines?.moneyline?.favorite) || -150;
  const vegasSpread = parseFloat(pred.vegasLines?.spread?.line) || 0;
  const isUnderdog = vegasSpread > 0;
  const confidence = pred.prediction?.confidence || 0;
  
  // PREFER SPREAD when:
  // 1. Model pick is underdog with big spread cushion (safer than ML)
  if (isUnderdog && Math.abs(vegasSpread) >= 6 && winProb < 66) {
    return 'SPREAD';
  }
  
  // 2. ML is heavily juiced (worse than -240) - spread is safer
  if (mlOdds <= -240 && confidence >= 65) {
    return 'SPREAD';
  }
  
  // Default to ML for high confidence picks
  return 'ML';
}

// CORRELATION LOGIC: Score prop correlation with game anchor
export function scoreCorrelation(prop, anchor, gameTotal) {
  let bonus = 0;
  
  if (!anchor || !prop) return 0;
  
  const propType = prop.propType?.toLowerCase();
  const betSide = prop.betSide?.toUpperCase();
  const isOpponent = prop.team !== anchor.pick; // Prop player is on opponent team
  const favoriteWins = anchor.type === 'ML';
  
  // ===== PREFERRED CORRELATIONS =====
  
  // Team ML + opponent star UNDER points (opponent loses = less time)
  if (favoriteWins && isOpponent && propType === 'points' && betSide === 'UNDER') {
    const line = Number(prop.vegasLine || prop.line) || 0;
    if (line >= 15) bonus += 15; // Star player under
  }
  
  // Team ML + team rebound overs (winning team controls boards)
  if (favoriteWins && !isOpponent && propType === 'rebounds' && betSide === 'OVER') {
    bonus += 12;
  }
  
  // Over total + primary ball-handler assists OVER
  if (gameTotal === 'OVER' && propType === 'assists' && betSide === 'OVER') {
    const line = Number(prop.vegasLine || prop.line) || 0;
    if (line >= 5.5) bonus += 12; // Primary ball handler
  }
  
  // Under total + low-usage scoring unders
  if (gameTotal === 'UNDER' && propType === 'points' && betSide === 'UNDER') {
    bonus += 10;
  }
  
  // ===== DE-EMPHASIZED (avoid generic blowout logic) =====
  // Bench player overs: slight bonus only if other conditions met
  // Not giving automatic bonus for "blowout = bench minutes"
  
  return bonus;
}

// Check if 4th leg meets stability requirements
export function meetsStabilityForFourthLeg(pick) {
  const l10 = getHitRate(pick, 10);
  const l20 = getHitRate(pick, 20);
  const kellyStake = Number(pick.kellyStake) || 0;
  const confidence = Number(pick.confidence) || 0;
  const edge = Number(pick.edge) || 0;
  
  // 4th leg needs: role certainty (high kelly/confidence) AND strong splits
  const hasRoleCertainty = kellyStake >= 2.0 || confidence >= 67;
  const hasStrongSplits = (l10 !== null && l10 >= 0.60) && (l20 !== null && l20 >= 0.60);
  const hasGoodEdge = edge >= 8;
  
  // Must have role certainty AND (strong splits OR good edge)
  return hasRoleCertainty && (hasStrongSplits || hasGoodEdge);
}

// Check if safety alt-line should be applied
export function shouldApplySafetyAlt(pick) {
  const l5 = getHitRate(pick, 5);
  const l10 = getHitRate(pick, 10);
  const l20 = getHitRate(pick, 20);
  const line = Number(pick.vegasLine || pick.line) || 0;
  
  // Apply when L5 is weaker than L10/L20
  if (l5 !== null && l10 !== null && l5 < l10) return true;
  if (l5 !== null && l20 !== null && l5 < l20) return true;
  
  // Apply for unders on low lines
  if (pick.betSide === 'UNDER' && line <= 4.5) return true;
  
  // Apply when edge is borderline (< 3%)
  const edge = Number(pick.edge) || 0;
  if (edge < 3 && edge > 0) return true;
  
  return false;
}

// Apply safety alt-line to a pick
export function applySafetyAlt(pick) {
  const line = Number(pick.vegasLine || pick.line) || 0;
  const newLine = pick.betSide === 'OVER' ? line - 1 : line + 1;
  return {
    ...pick,
    originalLine: line,
    vegasLine: newLine,
    line: newLine,
    safetyAltApplied: true
  };
}

// Generate game prediction parlays (no totals)
export function generateGameParlays(predictions, rng, saferMode = false) {
  const parlays = [];
  
  // Filter to games with opportunities
  const gamesWithOpps = predictions.filter(p => 
    p.opportunities && p.opportunities.length > 0
  );
  
  // Collect valid legs (ML and Spread only, no totals)
  const validLegs = [];
  gamesWithOpps.forEach(pred => {
    const mlOpp = pred.opportunities?.find(o => o.market === 'Moneyline');
    const spreadOpp = pred.opportunities?.find(o => o.market === 'Spread');
    
    if (mlOpp) {
      validLegs.push({
        type: 'ML',
        game: pred.game,
        gameId: pred.homeTeam + pred.awayTeam,
        pick: mlOpp.pick,
        odds: mlOpp.odds,
        edge: mlOpp.edgePercent || mlOpp.edge,
        winProb: pred.prediction?.winProbability?.favoritePercent,
        score: scoreGameLeg(pred, 'ML', saferMode),
        pred
      });
    }
    
    if (spreadOpp) {
      validLegs.push({
        type: 'SPREAD',
        game: pred.game,
        gameId: pred.homeTeam + pred.awayTeam,
        pick: spreadOpp.pick,
        odds: spreadOpp.odds,
        edge: spreadOpp.edgePercent || spreadOpp.edge,
        score: scoreGameLeg(pred, 'spread', saferMode),
        pred
      });
    }
  });
  
  // Sort by score
  validLegs.sort((a, b) => b.score - a.score);
  
  // Shuffle with some randomness
  const shuffled = seededShuffle(validLegs, rng);
  
  // 3-leg parlay from recommended picks
  const threeLeg = selectDiverseLegs(shuffled, 3, saferMode);
  if (threeLeg.length >= 3) {
    parlays.push({
      name: 'Model 3-Leg (No Totals)',
      legs: threeLeg.slice(0, 3),
      reasoning: [
        'Uses only ML and spread bets (no totals)',
        saferMode ? 'Safer mode: prefers ML over close spreads' : 'Balanced ML/spread selection',
        'Top-scored legs by model confidence and edge'
      ]
    });
  }
  
  // 4-leg SGP-style parlay
  const fourLeg = selectDiverseLegs(shuffled, 4, saferMode);
  if (fourLeg.length >= 4) {
    // In safer mode, try to replace close spreads with ML
    let adjusted = [...fourLeg.slice(0, 4)];
    if (saferMode) {
      adjusted = adjusted.map(leg => {
        if (leg.type === 'SPREAD' && Math.abs(parseFloat(leg.pick)) <= 3) {
          const mlAlt = validLegs.find(l => l.gameId === leg.gameId && l.type === 'ML');
          if (mlAlt) return { ...mlAlt, safetySwap: true };
        }
        return leg;
      });
    }
    
    parlays.push({
      name: 'Model 4-Leg (Safer SGP-style)',
      legs: adjusted,
      reasoning: [
        'Can include 1-2 legs that are safer even if not top edge',
        saferMode ? 'Safer mode: close spreads replaced with ML' : 'Mix of high-confidence picks',
        'Prioritizes hit probability for profit boost usage'
      ]
    });
  }
  
  return parlays;
}

// Select diverse legs (avoid same game/player conflicts)
function selectDiverseLegs(legs, count, saferMode) {
  const selected = [];
  const usedGames = new Set();
  const usedPlayers = new Set();
  
  for (const leg of legs) {
    if (selected.length >= count) break;
    
    const gameId = leg.gameId || `${leg.team}-${leg.opponent}`;
    const playerId = leg.player?.toLowerCase();
    
    // Skip if same player already used
    if (playerId && usedPlayers.has(playerId)) continue;
    
    // Allow max 2 legs from same game
    const gameCount = [...selected].filter(s => 
      (s.gameId || `${s.team}-${s.opponent}`) === gameId
    ).length;
    if (gameCount >= 2) continue;
    
    selected.push(leg);
    if (gameId) usedGames.add(gameId);
    if (playerId) usedPlayers.add(playerId);
  }
  
  return selected;
}

// Generate confidence parlays (props + safe game legs)
export function generateConfidenceParlays(strongSignals, gamePredictions, rng, saferMode = false, allowSafetyAlt = true) {
  const parlays = [];
  
  // Score and sort props
  const scoredProps = strongSignals.map(pick => ({
    ...pick,
    type: 'PROP',
    gameId: `${pick.team}-${pick.opponent}`,
    score: scorePropPick(pick, saferMode)
  })).sort((a, b) => b.score - a.score);
  
  // Get safe game legs (ML from high confidence games)
  const safeGameLegs = [];
  gamePredictions.forEach(pred => {
    const winProb = pred.prediction?.winProbability?.favoritePercent || 0;
    const mlOpp = pred.opportunities?.find(o => o.market === 'Moneyline');
    
    // Safe ML: high win probability even if not "edge" pick
    if (winProb >= 60 && mlOpp) {
      safeGameLegs.push({
        type: 'ML',
        game: pred.game,
        gameId: pred.homeTeam + pred.awayTeam,
        pick: pred.prediction?.winProbability?.favoriteTeam,
        odds: mlOpp.odds,
        winProb,
        isSafeGameLeg: true,
        score: winProb + (mlOpp.edgePercent || 0)
      });
    }
  });
  
  // Combine and shuffle
  const allLegs = [...scoredProps, ...safeGameLegs];
  const shuffled = seededShuffle(allLegs, rng);
  
  // Generate 3 x 3-leg parlays
  for (let i = 0; i < 3; i++) {
    const offset = i * 4;
    let legs = selectDiverseLegs(shuffled.slice(offset), 3, saferMode);
    
    // Apply safety alt to at most 1 leg per parlay
    if (allowSafetyAlt && legs.length >= 3) {
      let safetyApplied = false;
      legs = legs.map(leg => {
        if (!safetyApplied && leg.type === 'PROP' && shouldApplySafetyAlt(leg)) {
          safetyApplied = true;
          return applySafetyAlt(leg);
        }
        return leg;
      });
    }
    
    if (legs.length >= 3) {
      parlays.push({
        name: `Confidence 3-Leg #${i + 1}`,
        legs: legs.slice(0, 3),
        reasoning: [
          'Mix of aligned props and safe game legs',
          allowSafetyAlt && legs.some(l => l.safetyAltApplied) ? 
            'Safety alt-line applied to 1 borderline leg' : 'No safety adjustments needed',
          'Designed for profit boost usage'
        ]
      });
    }
  }
  
  // Generate 2 x 4-leg parlays
  for (let i = 0; i < 2; i++) {
    const offset = 12 + (i * 5);
    let legs = selectDiverseLegs(shuffled.slice(offset), 4, saferMode);
    
    // Apply safety alt to at most 1 leg
    if (allowSafetyAlt && legs.length >= 4) {
      let safetyApplied = false;
      legs = legs.map(leg => {
        if (!safetyApplied && leg.type === 'PROP' && shouldApplySafetyAlt(leg)) {
          safetyApplied = true;
          return applySafetyAlt(leg);
        }
        return leg;
      });
    }
    
    if (legs.length >= 4) {
      parlays.push({
        name: `Confidence 4-Leg #${i + 1}`,
        legs: legs.slice(0, 4),
        reasoning: [
          'Higher leg count for bigger boost multipliers',
          'Props from aligned picks + safe ML legs',
          'At most 1 safety alt-line adjustment allowed'
        ]
      });
    }
  }
  
  return parlays;
}

// Generate SGP-style parlays (SAME GAME - all legs from one game)
export function generateSGPParlays(strongSignals, v2Props, gamePredictions, rng, saferMode = false) {
  const parlays = [];
  
  // Get Phase 3.5 POINTS picks that meet strict criteria
  const phase35Points = v2Props
    .filter(p => p.propType?.toLowerCase() === 'points' && meetsStrictPhase35Criteria(p))
    .map(pick => ({
      ...pick,
      type: 'PROP',
      source: 'Phase35',
      gameId: normalizeGameKey(pick.team, pick.opponent),
      score: scorePropPick(pick, saferMode)
    }));
  
  // Add aligned picks (all prop types)
  const alignedPicks = strongSignals
    .map(pick => ({
      ...pick,
      type: 'PROP',
      source: 'Aligned',
      gameId: normalizeGameKey(pick.team, pick.opponent),
      score: scorePropPick(pick, saferMode)
    }));
  
  // Combine all props
  const allProps = [...phase35Points, ...alignedPicks];
  
  // Group props by game
  const gamePropsMap = new Map();
  allProps.forEach(prop => {
    const gameKey = prop.gameId;
    if (!gamePropsMap.has(gameKey)) {
      gamePropsMap.set(gameKey, []);
    }
    gamePropsMap.get(gameKey).push(prop);
  });
  
  // Also add game ML legs to each game's pool (ONLY IF QUALIFIES AS ANCHOR)
  gamePredictions.forEach(pred => {
    // Use new anchor qualification logic
    if (!qualifiesAsAnchor(pred)) return;
    
    const winProb = pred.prediction?.winProbability?.favoritePercent || 0;
    const mlOpp = pred.opportunities?.find(o => o.market === 'Moneyline');
    const spreadOpp = pred.opportunities?.find(o => o.market === 'Spread');
    const mlEdge = mlOpp?.edgePercent || 0;
    
    // Determine bet type (ML vs Spread)
    const betType = getAnchorBetType(pred);
    const opp = betType === 'ML' ? mlOpp : spreadOpp;
    
    if (!opp) return;
    
    // Get normalized game key for this prediction
    const homeTeam = pred.homeTeam || pred.teams?.home?.abbreviation || '';
    const awayTeam = pred.awayTeam || pred.teams?.away?.abbreviation || '';
    const normalizedKey = normalizeGameKey(homeTeam, awayTeam);
    
    // Add to existing game or create new entry
    if (!gamePropsMap.has(normalizedKey)) {
      gamePropsMap.set(normalizedKey, []);
    }
    
    gamePropsMap.get(normalizedKey).push({
      type: betType,
      source: 'Game',
      game: pred.game,
      gameId: normalizedKey,
      pick: betType === 'ML' 
        ? pred.prediction?.winProbability?.favoriteTeam 
        : opp.pick,
      odds: opp.odds,
      winProb,
      edge: mlEdge,
      isAnchor: true,
      score: winProb + (mlEdge * 2) // Higher score for edges
    });
  });
  
  // Find games with enough legs for SGPs (3+ unique players)
  const eligibleGames = [];
  for (const [gameKey, props] of gamePropsMap.entries()) {
    // Get unique players in this game
    const uniquePlayers = new Set(props.filter(p => p.player).map(p => p.player?.toLowerCase()));
    const hasML = props.some(p => p.type === 'ML');
    
    // Need at least 3 different players OR 2 players + ML
    if (uniquePlayers.size >= 3 || (uniquePlayers.size >= 2 && hasML)) {
      // Score the game by average prop quality
      const avgScore = props.reduce((sum, p) => sum + (p.score || 0), 0) / props.length;
      eligibleGames.push({
        gameKey,
        props,
        uniquePlayers: uniquePlayers.size,
        hasML,
        avgScore
      });
    }
  }
  
  // Sort games by quality (more players, higher avg score)
  eligibleGames.sort((a, b) => {
    // Prefer games with more unique players
    if (b.uniquePlayers !== a.uniquePlayers) return b.uniquePlayers - a.uniquePlayers;
    return b.avgScore - a.avgScore;
  });
  
  // Shuffle with some randomness but keep best games first
  const shuffledGames = seededShuffle(eligibleGames, rng);
  
  // Generate SGPs from best games
  let sgpCount = 0;
  const maxSGPs = 3; // 2x 3-leg + 1x 4-leg
  
  for (const game of shuffledGames) {
    if (sgpCount >= maxSGPs) break;
    
    const { gameKey, props } = game;
    
    // Check if this game has a qualifying anchor
    const anchorLeg = props.find(p => p.isAnchor);
    
    // Select legs for this SGP - different players only
    const selectedLegs = [];
    const usedPlayers = new Set();
    let hasAnchorLeg = false;
    
    // Sort props by score
    const sortedProps = [...props].sort((a, b) => (b.score || 0) - (a.score || 0));
    
    // First, add anchor if available (prioritize anchored SGPs)
    if (anchorLeg) {
      selectedLegs.push(anchorLeg);
      hasAnchorLeg = true;
    }
    
    for (const prop of sortedProps) {
      // Skip if already added as anchor
      if (prop.isAnchor && hasAnchorLeg) continue;
      
      if (prop.type === 'ML' || prop.type === 'SPREAD') {
        // Only add game leg if we don't have one yet
        if (!hasAnchorLeg && selectedLegs.length < 4) {
          selectedLegs.push(prop);
          hasAnchorLeg = true;
        }
        continue;
      }
      
      const playerKey = prop.player?.toLowerCase();
      if (playerKey && !usedPlayers.has(playerKey)) {
        selectedLegs.push(prop);
        usedPlayers.add(playerKey);
      }
      
      if (selectedLegs.length >= 4) break;
    }
    
    // Determine leg count: 3-leg default, 4-leg only with tight gating
    let legCount = 3;
    const wantsFourLeg = sgpCount >= 2; // Third parlay can be 4-leg
    
    if (wantsFourLeg && selectedLegs.length >= 4) {
      // 4-LEG GATING: 4th leg must meet stability requirements
      const fourthLeg = selectedLegs[3];
      if (fourthLeg && (fourthLeg.isAnchor || meetsStabilityForFourthLeg(fourthLeg))) {
        legCount = 4;
      }
      // If 4th leg doesn't meet stability, fall back to 3-leg
    }
    
    if (selectedLegs.length >= legCount) {
      const legs = selectedLegs.slice(0, legCount);
      const gameDisplay = legs[0]?.game || `${legs[0]?.team} vs ${legs[0]?.opponent}`;
      const hasAnchor = legs.some(l => l.isAnchor);
      
      parlays.push({
        name: `SGP ${legCount}-Leg: ${gameDisplay}`,
        legs,
        game: gameDisplay,
        isSameGame: true,
        hasAnchor,
        sources: {
          aligned: legs.filter(l => l.source === 'Aligned').length,
          phase35: legs.filter(l => l.source === 'Phase35').length,
          game: legs.filter(l => l.source === 'Game').length
        },
        reasoning: [
          hasAnchor 
            ? `Anchored by ${legs.find(l => l.isAnchor)?.type} (${legs.find(l => l.isAnchor)?.winProb}% win prob)`
            : 'Props-only (no qualifying game anchor)',
          `All ${legCount} legs from the same game`,
          'Different players for each prop leg',
          'Strict filter: L5>50%, L10≥60%, L20≥60%'
        ]
      });
      
      sgpCount++;
    }
  }
  
  // If we didn't get enough SGPs, note it
  if (parlays.length === 0) {
    console.log('No games with enough qualifying props for SGPs');
  }
  
  return parlays;
}

// Master function to generate all parlays
export async function generateAllParlays(clickCount = 0, saferMode = false, allowSafetyAlt = true) {
  // Load all data sources
  const [v1Props, v2Data, gamePredictions] = await Promise.all([
    loadV1Props(),
    loadV2Props(),
    loadGamePredictions()
  ]);
  
  const v2Props = v2Data.predictions;
  const metadata = v2Data.metadata;
  
  // Create seeded RNG
  const seed = getTodaySeed(clickCount);
  const rng = createSeededRNG(seed);
  
  // Find aligned and strong signal picks
  const strongSignals = findStrongSignals(v1Props, v2Props);
  
  // Generate all parlay types
  const gameParlays = generateGameParlays(gamePredictions, rng, saferMode);
  const confidenceParlays = generateConfidenceParlays(strongSignals, gamePredictions, rng, saferMode, allowSafetyAlt);
  const sgpParlays = generateSGPParlays(strongSignals, v2Props, gamePredictions, rng, saferMode);
  
  return {
    gameParlays,
    confidenceParlays,
    sgpParlays,
    metadata: {
      ...metadata,
      generated: new Date().toISOString(),
      seed,
      saferMode,
      allowSafetyAlt,
      counts: {
        v1Props: v1Props.length,
        v2Props: v2Props.length,
        gamePredictions: gamePredictions.length,
        strongSignals: strongSignals.length
      }
    }
  };
}
