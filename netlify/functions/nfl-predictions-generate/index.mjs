// netlify/functions/nfl-predictions-generate/index.mjs

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics } from '../_lib/blobs-nfl.js';

// Tiered weights based on predictive value research
const WEIGHTS = {
  // Tier 1 - Highest predictive value (50% total)
  third_down: 0.20,
  rz_td: 0.15,
  turnover_diff: 0.15,
  
  // Tier 2 - Strong correlation (32% total)
  explosive_diff: 0.12,
  eds: 0.10,           // early down success
  pressure_diff: 0.10,
  
  // Tier 3 - Meaningful but situational (18% total)
  fourth_down_agg: 0.08,
  penalty_diff: 0.05,
  top_eff: 0.05        // time of possession efficiency
};

// Advanced feature weights (start conservative, can increase after backtesting)
const ADVANCED_WEIGHTS = {
  consistency: 0.02,
  form: 0.03,
  tempo: 0.01,
  formations: 0.01,
  script_adaptation: 0.01
};

// Utility functions
function z(val, mean = 0, std = 1) { 
  return std > 0 ? (val - mean) / std : 0; 
}

function clamp(x, lo, hi) { 
  return Math.max(lo, Math.min(hi, x)); 
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function americanToImplied(american) {
  const odds = Number(american);
  if (!odds || isNaN(odds)) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

// Core team scoring function using advanced metrics
function scoreTeamFromFeatures(teamData, league) {
  if (!teamData || !league) {
    return 0.5; // Neutral if no data
  }

  // Graceful defaults for all metric categories
  const sit = teamData?.situational || {};
  const press = teamData?.pressure || {};
  const to = teamData?.turnovers || {};
  const coach = teamData?.coaching || {};
  const disc = teamData?.discipline || {};
  const tempo = teamData?.tempo || {};
  const core = teamData?.core || {};
  const script = teamData?.script || {};
  const formations = teamData?.formations || {};

  // Calculate z-scores vs league (normalized features)
  const zThird = z(sit.third_down_off ?? 0, league.means.third_down_off, league.stds.third_down_off);
  const zRZ = z(sit.rz_td_off ?? 0, league.means.rz_td_off, league.stds.rz_td_off);
  const zTOdiff = z(to.turnover_diff ?? 0, league.means.turnover_diff, league.stds.turnover_diff);
  const zExpl = z(
    (sit.explosive_off ?? 0) - (sit.explosive_def ?? 0), 
    league.means.explosive_diff, 
    league.stds.explosive_diff
  );
  const zEDS = z(sit.eds ?? 0, league.means.eds, league.stds.eds);
  const zPress = z(press.pressure_diff ?? 0, league.means.pressure_diff, league.stds.pressure_diff);
  const z4th = z(coach.fourth_down_agg ?? 0, league.means.fourth_down_agg, league.stds.fourth_down_agg);
  const zPen = z(disc.penalty_diff ?? 0, league.means.penalty_diff, league.stds.penalty_diff);
  const zTOP = z(tempo.top_eff ?? 0, league.means.top_eff, league.stds.top_eff);

  // Core EPA backbone (prefer opponent-adjusted)
  const offEPA = core.off_adj_epa ?? core.off_epa ?? 0;
  const defEPA = -(core.def_adj_epa ?? core.def_epa ?? 0);

  // Advanced features (conservative weights initially)
  const consistency = teamData?.consistency?.off ?? 0.5;
  const form = teamData?.form?.off ?? 0;
  const paceAdj = clamp((tempo.pace ?? 30) / 30 - 1, -0.5, 0.5); // normalized around 30 plays/game
  const motionAdv = (formations.motion_rate ?? 0.4) - 0.4; // league average ~40%
  const scriptAdapt = script.trailing_epa ?? 0;

  // Weighted combination
  const coreScore = (offEPA * 0.25) + (defEPA * 0.25);
  
  const tierScore = 
    (WEIGHTS.third_down * zThird) +
    (WEIGHTS.rz_td * zRZ) +
    (WEIGHTS.turnover_diff * zTOdiff) +
    (WEIGHTS.explosive_diff * zExpl) +
    (WEIGHTS.eds * zEDS) +
    (WEIGHTS.pressure_diff * zPress) +
    (WEIGHTS.fourth_down_agg * z4th) +
    (WEIGHTS.penalty_diff * zPen) +
    (WEIGHTS.top_eff * zTOP);

  const advancedScore = 
    (ADVANCED_WEIGHTS.consistency * (consistency - 0.5)) +
    (ADVANCED_WEIGHTS.form * form) +
    (ADVANCED_WEIGHTS.tempo * paceAdj) +
    (ADVANCED_WEIGHTS.formations * motionAdv) +
    (ADVANCED_WEIGHTS.script_adaptation * scriptAdapt);

  const totalLinear = coreScore + tierScore + advancedScore;

  // Convert to probability and clamp for sanity
  const probability = sigmoid(totalLinear);
  return clamp(probability, 0.1, 0.9);
}

// Apply injury adjustments with conservative, bounded effects
function applyInjuryAdjustments(probability, teamCode, injuries) {
  const teamInjuries = injuries.teams?.[teamCode] || {};
  let delta = 0;

  // QB status impact
  switch (teamInjuries.qb_status) {
    case 'out':
      delta -= 0.03;
      break;
    case 'doubtful':
      delta -= 0.02;
      break;
    case 'questionable':
      delta -= 0.01;
      break;
    default:
      // probable or active - no adjustment
      break;
  }

  // Positional cluster impacts (small but meaningful)
  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;

  if (olOut >= 2) delta -= 0.005;
  if (olOut >= 3) delta -= 0.010; // Additional penalty for major OL depletion
  
  if (dbOut >= 2) delta -= 0.005;

  // Apply backup QB penalty if available
  if (teamInjuries.qb_status === 'out' && teamInjuries.qb_backup_adj_ppp) {
    delta += Math.max(teamInjuries.qb_backup_adj_ppp, -0.05); // Cap backup penalty
  }

  return clamp(probability + delta, 0.05, 0.95);
}

// Calculate spread prediction
function calculateSpreadPrediction(homeWinProb, awayWinProb, homeMetrics, awayMetrics) {
  console.log('=== SPREAD PREDICTION DEBUG ===');
  console.log('Win probabilities:', { homeWinProb, awayWinProb });
  
  // Convert win probability to point spread
  const probDiff = homeWinProb - awayWinProb;
  const predictedSpread = probDiff * 14; // Rough conversion: 50% prob diff ≈ 7 point spread
  
  // Factor in offensive/defensive efficiency
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  
  console.log('EPA values for spread:', { homeOffEPA, homeDefEPA, awayOffEPA, awayDefEPA });
  
  const epaSpread = (homeOffEPA - homeDefEPA) - (awayOffEPA - awayDefEPA);
  const adjustedSpread = predictedSpread + (epaSpread * 5); // Scale EPA to points
  
  const finalSpread = clamp(adjustedSpread, -21, 21); // Reasonable spread bounds
  console.log('Spread calculation:', { probDiff, predictedSpread, epaSpread, adjustedSpread, finalSpread });
  
  return finalSpread;
}

// Calculate total prediction
function calculateTotalPrediction(homeMetrics, awayMetrics) {
  console.log('=== TOTAL PREDICTION DEBUG ===');
  console.log('Home metrics core:', homeMetrics?.core);
  console.log('Away metrics core:', awayMetrics?.core);
  console.log('Home tempo:', homeMetrics?.tempo);
  console.log('Away tempo:', awayMetrics?.tempo);
  
  // Base scoring rates from EPA and pace
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  
  console.log('EPA values for total:', { homeOffEPA, awayOffEPA, homeDefEPA, awayDefEPA });
  
  // Convert EPA to points per play, then to game total
  const homePointsPerPlay = (homeOffEPA * 0.8) + 0.3; // Rough conversion
  const awayPointsPerPlay = (awayOffEPA * 0.8) + 0.3;
  
  console.log('Points per play:', { homePointsPerPlay, awayPointsPerPlay });
  
  // Factor in pace (plays per game)
  const homePace = homeMetrics?.tempo?.pace || 65;
  const awayPace = awayMetrics?.tempo?.pace || 65;
  const avgPace = (homePace + awayPace) / 2;
  
  console.log('Pace values:', { homePace, awayPace, avgPace });
  
  // Defensive adjustments
  const homeDefAdj = (homeDefEPA * 0.4); // Defense reduces opponent scoring
  const awayDefAdj = (awayDefEPA * 0.4);
  
  const homeProjected = Math.max(10, (homePointsPerPlay + awayDefAdj) * avgPace);
  const awayProjected = Math.max(10, (awayPointsPerPlay + homeDefAdj) * avgPace);
  
  console.log('Projected scores:', { homeProjected, awayProjected });
  
  const total = clamp(homeProjected + awayProjected, 30, 70); // Reasonable total bounds
  console.log('Final calculated total:', total);
  
  return total;
}

// Calculate confidence rating (1-100)
function calculateConfidence(modelProb, marketProb, edge) {
  // Base confidence from model certainty
  const modelCertainty = Math.abs(modelProb - 0.5) * 2; // 0 to 1 scale
  
  // Edge component (model vs market difference)
  const edgeComponent = edge ? Math.min(Math.abs(edge), 0.15) / 0.15 : 0;
  
  // Combine factors
  const rawConfidence = (modelCertainty * 0.7) + (edgeComponent * 0.3);
  
  // Convert to 1-100 scale, with minimum threshold
  return Math.max(50, Math.round(rawConfidence * 50 + 50));
}

// Main prediction function
async function generateAdvancedPredictions(games, season) {
  console.log('Attempting to load advanced metrics...');
  
  // Load advanced metrics and injury data
  let advancedMetrics = null;
  let injuries = null;
  
  try {
    advancedMetrics = await loadAdvancedMetrics(season);
    console.log('Raw advanced metrics result:', advancedMetrics);
    console.log('Advanced metrics type:', typeof advancedMetrics);
    console.log('Advanced metrics keys:', advancedMetrics ? Object.keys(advancedMetrics) : 'null');
    
    injuries = await loadInjuries();
    console.log('Injuries loaded:', !!injuries);
  } catch (error) {
    console.warn('Advanced metrics loading failed:', error);
    // Will fall back to basic prediction below
  }

  const validMetrics = validateAdvancedMetrics(advancedMetrics);
  
  if (!validMetrics) {
    console.warn('Advanced metrics not available or invalid, falling back to basic prediction');
    // Return basic predictions structure
    return games.map(game => ({
      ...game,
      predictions: {
        home_win_prob: 0.5,
        away_win_prob: 0.5,
        moneyline: {
          pick: null,
          confidence: 50,
          edge: 0
        },
        spread: {
          pick: null,
          confidence: 50,
          line: null,
          predicted: null,
          edge: 0
        },
        total: {
          pick: null,
          confidence: 50,
          line: null,
          predicted: null,
          edge: 0
        }
      },
      modelEnhancements: {
        metricsFreshness: null,
        injuriesAsOf: null,
        featuresUsed: [],
        notes: ["Advanced metrics not available - using fallback"]
      },
      teamStats: {
        home: { strength: 0.5 },
        away: { strength: 0.5 }
      }
    }));
  }

  const league = advancedMetrics?.league || { means: {}, stds: {} };

  return games.map(game => {
    const homeCode = game.home_team;
    const awayCode = game.away_team;

    console.log(`\n=== PREDICTING GAME: ${awayCode} @ ${homeCode} ===`);

    // Get team advanced metrics
    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);

    console.log('Home metrics available:', !!homeMetrics);
    console.log('Away metrics available:', !!awayMetrics);

    // Calculate base probabilities using advanced features
    let homeProb = scoreTeamFromFeatures(homeMetrics, league);
    let awayProb = scoreTeamFromFeatures(awayMetrics, league);

    console.log('Initial team probabilities:', { homeProb, awayProb });

    // Normalize probabilities to sum to 1
    const total = homeProb + awayProb;
    if (total > 0) {
      homeProb = homeProb / total;
      awayProb = awayProb / total;
    }

    // Apply home field advantage (research-backed)
    homeProb += 0.018;
    awayProb = 1 - homeProb;

    console.log('After home field advantage:', { homeProb, awayProb });

    // Apply injury adjustments if injury data is available
    if (injuries) {
      homeProb = applyInjuryAdjustments(homeProb, homeCode, injuries);
      awayProb = applyInjuryAdjustments(awayProb, awayCode, injuries);
    }

    // Final normalization
    const finalSum = homeProb + awayProb;
    const homeWinProb = finalSum ? homeProb / finalSum : 0.5;
    const awayWinProb = 1 - homeWinProb;

    console.log('Final win probabilities:', { homeWinProb, awayWinProb });

    // Get odds data from game object (should be populated by frontend)
    const oddsData = game.odds || {};
    console.log(`Odds data for ${homeCode} vs ${awayCode}:`, oddsData);
    
    // Moneyline predictions
    const mlPick = homeWinProb > 0.5 ? homeCode : awayCode;
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    const mlMarketProb = homeWinProb > 0.5 ? 
      americanToImplied(oddsData.ml_home) : 
      americanToImplied(oddsData.ml_away);
    const mlEdge = mlMarketProb ? mlModelProb - mlMarketProb : 0;
    const mlConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge);

    console.log('Moneyline prediction:', { mlPick, mlConfidence, mlEdge });

    // Spread predictions
    const predictedSpread = calculateSpreadPrediction(homeWinProb, awayWinProb, homeMetrics, awayMetrics);
    const marketSpread = oddsData.spread_line || 0;
    const spreadPick = predictedSpread > marketSpread ? homeCode : awayCode;
    const spreadEdge = Math.abs(predictedSpread - marketSpread);
    const spreadConfidence = calculateConfidence(0.6, 0.5, spreadEdge / 14); // Normalize spread edge

    console.log('Spread prediction:', { predictedSpread, marketSpread, spreadPick, spreadConfidence, spreadEdge });

    // Total predictions
    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics);
    const marketTotal = oddsData.total_line || 44;
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    const totalEdge = Math.abs(predictedTotal - marketTotal);
    const totalConfidence = calculateConfidence(0.6, 0.5, totalEdge / 10); // Normalize total edge

    console.log('Total prediction:', { predictedTotal, marketTotal, totalPick, totalConfidence, totalEdge });

    // Enhanced game object with all predictions
    return {
      ...game,
      predictions: {
        home_win_prob: Number(homeWinProb.toFixed(3)),
        away_win_prob: Number(awayWinProb.toFixed(3)),
        
        // Moneyline - nested structure
        moneyline: {
          pick: mlPick,
          confidence: mlConfidence,
          edge: Number((mlEdge * 100).toFixed(1))
        },
        
        // Spread - nested structure
        spread: {
          pick: spreadPick,
          confidence: spreadConfidence,
          line: marketSpread,
          predicted: Number(predictedSpread.toFixed(1)),
          edge: Number(spreadEdge.toFixed(1))
        },
        
        // Total - nested structure
        total: {
          pick: totalPick,
          confidence: totalConfidence,
          line: marketTotal,
          predicted: Number(predictedTotal.toFixed(1)),
          edge: Number(totalEdge.toFixed(1))
        }
      },
      modelEnhancements: {
        metricsFreshness: advancedMetrics?.asOf || null,
        injuriesAsOf: injuries?.asOf || null,
        featuresUsed: Object.keys(WEIGHTS),
        advancedFeaturesUsed: Object.keys(ADVANCED_WEIGHTS),
        notes: [
          "Tiered weights applied", 
          "EPA backbone = opponent-adjusted if present, else raw",
          "Home field advantage = +1.8%",
          "Injury adjustments applied"
        ]
      },
      teamStats: {
        home: {
          strength: Number(homeWinProb.toFixed(3)),
          thirdDown: homeMetrics?.situational?.third_down_off ?? null,
          redZoneTD: homeMetrics?.situational?.rz_td_off ?? null,
          pressureDiff: homeMetrics?.pressure?.pressure_diff ?? null,
          consistency: homeMetrics?.consistency?.off ?? null,
          form: homeMetrics?.form?.off ?? null
        },
        away: {
          strength: Number(awayWinProb.toFixed(3)),
          thirdDown: awayMetrics?.situational?.third_down_off ?? null,
          redZoneTD: awayMetrics?.situational?.rz_td_off ?? null,
          pressureDiff: awayMetrics?.pressure?.pressure_diff ?? null,
          consistency: awayMetrics?.consistency?.off ?? null,
          form: awayMetrics?.form?.off ?? null
        }
      }
    };
  });
}

// Netlify Function Handler
export default async (request, context) => {
  try {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Parse request for games data
    let games = [];
    let season = '2024';
    
    if (request.method === 'POST') {
      const body = await request.json();
      games = body.games || [];
      season = body.season || '2024';
    } else if (request.method === 'GET') {
      const url = new URL(request.url);
      season = url.searchParams.get('season') || '2024';
      
      // For GET requests, you might need to load games from another source
      games = []; // You'll need to implement game loading for GET requests
    }

    console.log(`Processing ${games.length} games for season ${season}`);
    
    // Call your advanced prediction function
    const predictions = await generateAdvancedPredictions(games, season);
    
    return new Response(JSON.stringify(predictions), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Prediction function error:', error);
    
    return new Response(JSON.stringify({
      error: 'Prediction generation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
