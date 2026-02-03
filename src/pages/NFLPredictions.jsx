// src/pages/NFLPredictions.jsx
import React, { useEffect, useState } from 'react';
import { getCurrentNFLWeek } from '../utils/nflWeek.js';
import { loadPredictionsWithPolling } from '../lib/fetchPredictions.js';
import { autoLockStartedGames, mergeLockedPicks, getLockedGamesSummary } from '../utils/lockManager.js';

// iOS detection and file sharing helpers (for dynamic HTML exports)
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const canShareFiles = () => {
  return navigator.share && navigator.canShare;
};

// Helper to save canvas as PNG with iOS share sheet support
const saveCanvasAsPNG = async (canvas, filename) => {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  
  if (isIOS() && canShareFiles()) {
    const file = new File([blob], filename, { type: 'image/png' });
    
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: filename.replace('.png', ''),
        });
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failed, falling back to download:', err);
        } else {
          return;
        }
      }
    }
  }
  
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL();
  link.click();
};

/**
 * NFL Predictions Page with Live Odds Display and Parlay Suggestions
 * Shows real sportsbook lines alongside model predictions and responsible parlay suggestions
 */

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const fmtOdds = (odds) => odds > 0 ? `+${odds}` : `${odds}`;

// SAFE FORMATTERS - Prevent undefined/NaN from causing blank pages
const nz = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);
const fmtPct = (p, digits = 1) => Number.isFinite(p) ? `${(p * 100).toFixed(digits)}%` : '—';
const fmtDec = (x, digits = 1) => Number.isFinite(x) ? x.toFixed(digits) : '—';
const fmtPts = (x, digits = 1) => Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(digits)} pts` : '—';

// BET RECOMMENDATION HELPER with color coding
const getBetRecommendation = (kellyUnits) => {
  if (!Number.isFinite(kellyUnits) || kellyUnits <= 0) {
    return { text: "NO BET", color: "text-red-600" };
  }
  
  const units = kellyUnits.toFixed(1);
  if (kellyUnits >= 2.0) {
    return { text: `BET ${units}U`, color: "text-green-600 font-semibold" }; // HEAVY bets (2U+) = green
  } else if (kellyUnits >= 0.5) {
    return { text: `BET ${units}U`, color: "text-yellow-600 font-medium" }; // Medium bets (.5-1.99U) = yellow
  } else {
    return { text: "NO BET", color: "text-red-600" }; // Small bets (<0.5U) = red/no bet
  }
};

// PROPER DEVIG IMPLEMENTATION 
function impliedFromAmerican(odds) {
  if (!Number.isFinite(odds)) return undefined;
  return odds > 0 ? 100 / (odds + 100) : (-odds) / ((-odds) + 100);
}

function devigPair(pA_raw, pB_raw) {
  const k = pA_raw + pB_raw;
  if (!Number.isFinite(k) || k <= 0) return [undefined, undefined];
  return [pA_raw / k, pB_raw / k];
}

function edgeProb(modelProb, fairProb) {
  if (!Number.isFinite(modelProb) || !Number.isFinite(fairProb)) return undefined;
  return modelProb - fairProb; // in probability (0..1)
}

// Calculate proper devigged ML edge with both sides
function calculateDeriggedMLEdge(homeOdds, awayOdds, modelProbHome, modelProbAway) {
  const pHome_raw = impliedFromAmerican(homeOdds);
  const pAway_raw = impliedFromAmerican(awayOdds);
  
  if (!pHome_raw || !pAway_raw) return null;
  
  const [fairHome, fairAway] = devigPair(pHome_raw, pAway_raw);
  
  if (!fairHome || !fairAway) return null;
  
  const edgeHome = edgeProb(modelProbHome, fairHome);
  const edgeAway = edgeProb(modelProbAway, fairAway);
  
  return {
    fairHome,
    fairAway,
    edgeHome,
    edgeAway,
    debug: {
      rawHome: pHome_raw,
      rawAway: pAway_raw,
      rawSum: pHome_raw + pAway_raw,
      fairSum: fairHome + fairAway
    }
  };
};

// Legacy function for compatibility
function americanToDecimal(american) {
  if (!Number.isFinite(american)) return 2.0;
  if (american > 0) return (american / 100) + 1;
  return (100 / Math.abs(american)) + 1;
}

function decimalToImpliedProb(decimal) {
  return 1 / decimal;
}

async function fetchSchedule(week = 4, season = 2025) {
  const scheduleUrl = `/.netlify/functions/nfl-schedule-get?week=${week}&season=${season}`;
  const scheduleRes = await fetch(scheduleUrl);
  if (!scheduleRes.ok) throw new Error(`Failed to get schedule: ${scheduleRes.status}`);
  const scheduleData = await scheduleRes.json();
  
  const games = (scheduleData.matchups || []).map(game => ({
    home_team: getTeamAbbreviation(game.homeTeam),
    away_team: getTeamAbbreviation(game.awayTeam), 
    game_id: game.id || `${game.homeTeam}-${game.awayTeam}`,
    start: game.kickoff
  }));
  
  return games;
}

async function fetchPredictions(week = 4, season = 2025, force = false, onProgress = null) {
  const games = await fetchSchedule(week, season);
  
  if (games.length === 0) {
    throw new Error(`No games found for Week ${week}, ${season}`);
  }
  
  // Use smart polling with cache (fast path) and fallback to generator (slow path)
  const response = await loadPredictionsWithPolling({ 
    season, 
    week, 
    games,
    onProgress 
  });
  
  // Handle nfl-predictions-generate response structure  
  const predictions = response.predictions || [];
  const parlaySuggestions = response.parlaySuggestions || [];
  const parlayMetadata = response.parlayMetadata || {};
  
  return {
    rows: predictions.map(pred => ({
      gameId: pred.game_id,
      matchup: `${pred.away_team} @ ${pred.home_team}`,
      start: pred.start,
      predictions: pred.predictions,
      odds: pred.odds,
      home_team: pred.home_team,
      away_team: pred.away_team,
      teamStats: pred.teamStats,
      modelEnhancements: pred.modelEnhancements,
      locked_picks: pred.locked_picks
    })),
    parlaySuggestions: parlaySuggestions,
    parlayMetadata: parlayMetadata,
    meta: {
      week: week,
      season: season,
      games: predictions.length,
      model: 'R Pipeline + NFLVerse EPA'
    }
  };
}

function getTeamAbbreviation(fullName) {
  const nameMap = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Los Angeles Rams": "LAR", "Los Angeles Chargers": "LAC",
    "Las Vegas Raiders": "LV", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "Seattle Seahawks": "SEA", "San Francisco 49ers": "SF", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
    // Fallbacks for common abbreviations
    "LA": "LAR", // Default LA to Rams
    "LAR": "LAR", "LAC": "LAC" // Handle abbreviation inputs
  };
  return nameMap[fullName] || fullName;
}

// Check if team is significantly affected by injuries (3+ points total impact)
function hasSignificantInjuryImpact(teamStats) {
  if (!teamStats?.injuryImpact) return false;
  
  const totalImpact = Math.abs(teamStats.injuryImpact.totalImpact || 0);
  const adjustmentCount = (teamStats.injuryImpact.adjustments || []).length;
  
  // Significant if 3+ points impact OR 3+ injury adjustments
  return totalImpact >= 3 || adjustmentCount >= 3;
}

// Drop-in spread display function - always from picked team's POV
const TEAM_NAME = {
  ARI:"Arizona Cardinals", ATL:"Atlanta Falcons", BAL:"Baltimore Ravens",
  BUF:"Buffalo Bills", CAR:"Carolina Panthers", CHI:"Chicago Bears",
  CIN:"Cincinnati Bengals", CLE:"Cleveland Browns", DAL:"Dallas Cowboys",
  DEN:"Denver Broncos", DET:"Detroit Lions", GB:"Green Bay Packers",
  HOU:"Houston Texans", IND:"Indianapolis Colts", JAX:"Jacksonville Jaguars",
  KC:"Kansas City Chiefs", LV:"Las Vegas Raiders", LAC:"Los Angeles Chargers",
  LAR:"Los Angeles Rams", MIA:"Miami Dolphins", MIN:"Minnesota Vikings",
  NE:"New England Patriots", NO:"New Orleans Saints", NYG:"New York Giants",
  NYJ:"New York Jets", PHI:"Philadelphia Eagles", PIT:"Pittsburgh Steelers",
  SEA:"Seattle Seahawks", SF:"San Francisco 49ers", TB:"Tampa Bay Buccaneers",
  TEN:"Tennessee Titans", WAS:"Washington Commanders"
};

// ELITE PRO UTILITIES: DEVIG & VALIDATION

function devig(prob1, prob2, method = 'multiplicative') {
  const total = prob1 + prob2;
  if (total <= 1) return { prob1, prob2 }; // Already fair
  
  if (method === 'multiplicative') {
    return {
      prob1: prob1 / total,
      prob2: prob2 / total
    };
  } else if (method === 'additive') {
    const excess = total - 1;
    return {
      prob1: prob1 - (excess * prob1 / total),
      prob2: prob2 - (excess * prob2 / total)  
    };
  }
  return { prob1, prob2 };
}

// KELLY CRITERION UNIT SIZING
// Bankroll = $5,000, Unit size = $20, Bankroll = 250U
// Quarter Kelly with 5U cap for proper bankroll management
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

function calculateDevigged2WayEdge(modelProb, price1, price2) {
  // Convert American odds to probabilities
  const decimal1 = americanToDecimal(price1);
  const decimal2 = americanToDecimal(price2);
  const rawProb1 = decimalToImpliedProb(decimal1);
  const rawProb2 = decimalToImpliedProb(decimal2);
  
  // Remove vig
  const { prob1: fairProb1 } = devig(rawProb1, rawProb2);
  
  // Calculate true edge
  return modelProb - fairProb1;
}

// CLEAN SPREAD DISPLAY HELPERS (Favorite-Based Logic)
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

function validateModelData(game, model, mlPrices = null) {
  const warnings = [];
  
  // 1. Model Sign Sanity Check
  if (Math.abs(model.homeSpread) > 21) {
    warnings.push("EXTREME_SPREAD"); // Model predicting 3+ TD margin
  }
  
  // 2. Favorite Conflict Detection
  if (mlPrices && game.favoriteId && game.spreadAbs > 1.0) {
    const mlHomeFav = mlPrices.home < mlPrices.away;
    const spreadHomeFav = game.favoriteId === game.homeId;
    
    if (mlHomeFav !== spreadHomeFav) {
      warnings.push("FAVORITE_CONFLICT");
    }
  }
  
  // 3. Spread-ML Alignment Check  
  if (mlPrices && Math.abs(model.homeSpread) > 7) {
    const modelFavorsHome = model.homeSpread < 0;
    const mlFavorsHome = mlPrices.home < mlPrices.away;
    
    if (modelFavorsHome !== mlFavorsHome) {
      warnings.push("ML_SPREAD_MISMATCH");
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings,
    shouldSuppress: warnings.includes("EXTREME_SPREAD") || warnings.includes("FAVORITE_CONFLICT")
  };
}

function pickBestSpreadSide(game, model, mlPrices = null) {
  const teams = [game.homeId, game.awayId];

  // If the odds feed is missing, bail cleanly
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

  // ELITE PRO CHECK: Validate model data integrity
  const validation = validateModelData(game, model, mlPrices);
  if (validation.shouldSuppress) {
    return {
      pickedTeamId: null,
      market: null, 
      model: null,
      edgePts: null,
      isBet: false,
      reason: `⚠ Data issue: ${validation.warnings.join(', ')}`
    };
  }

  // Check both teams for value and pick the one with better edge
  const scored = teams.map(teamId => {
    const mkt = marketSpreadForTeam(game, teamId);
    const mdl = modelSpreadForTeam(game, model, teamId);
    const edge = mkt - mdl; // positive => value
    return { teamId, mkt, mdl, edge };
  });

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
}

// Legacy helpers for compatibility
const round1 = (x) => Math.round(x * 10) / 10;
const normalizeZero = (x) => (Object.is(x, -0) ? 0 : x);
const fmtNum = (x) => {
  if (!Number.isFinite(x)) return '—';
  const v = normalizeZero(round1(x));
  return v > 0 ? `+${v.toFixed(1)}` : `${v.toFixed(1)}`;
};
const fmtPickem = (v) => (Math.abs(v) < 0.25 ? " (Pick 'em)" : "");
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// Safe line extraction to avoid NaN display
const getHomeLine = (r, spread) => {
  // Use actual home_line if available, otherwise convert favorite's line to home perspective
  if (r?.odds?.display?.spread?.home_line !== undefined) {
    return Number.isFinite(Number(r.odds.display.spread.home_line)) ? Number(r.odds.display.spread.home_line) : 0;
  }
  
  // Fallback: convert favorite's line to home perspective
  const favoriteLine = spread?.line;
  const favorite = r?.odds?.spread?.favorite || spread?.favorite;
  
  if (Number.isFinite(Number(favoriteLine))) {
    if (favorite === 'home') {
      return -Math.abs(Number(favoriteLine)); // Home favored, so negative
    } else if (favorite === 'away') {
      return Math.abs(Number(favoriteLine)); // Away favored, so home gets positive
    }
  }
  
  return 0;
};

// Removed toPickPOV - replaced with clean spreadToPickedPerspective helper

// CLEAN SPREAD DISPLAY: Use favorite-based logic to pick best side and display
function spreadDisplayFromPick({
  homeAbbr, awayAbbr, favoriteId, spreadAbs,
  modelHomeMargin,  // model's home spread (negative = home favored)
  confidence,
  edgePct,
  TEAM_NAME
}) {
  const game = { 
    homeId: homeAbbr, 
    awayId: awayAbbr, 
    favoriteId, 
    spreadAbs: Number.isFinite(spreadAbs) ? spreadAbs : null 
  };
  
  const model = { homeSpread: modelHomeMargin };
  
  // Use the clean logic to pick the best side
  const result = pickBestSpreadSide(game, model);
  
  // Handle missing odds feed or validation failures
  if (result.pickedTeamId == null) {
    const isDataIssue = result.reason?.includes("⚠");
    return {
      pickText: isDataIssue ? "Data Issue" : "Odds Unavailable", 
      bookText: isDataIssue ? result.reason : "Line: No market data",
      modelText: `Model: Home ${spreadLabel(modelHomeMargin)} / Away ${spreadLabel(-modelHomeMargin)}`,
      confidence: confidence ?? "—",
      edgePts: "—"
    };
  }

  // Handle no-bet cases (negative or insufficient edge)
  if (!result.isBet) {
    return {
      pickText: "No Value",
      bookText: `Best Line: ${TEAM_NAME[result.pickedTeamId] || result.pickedTeamId} ${spreadLabel(result.market)}`,
      modelText: `Model: ${TEAM_NAME[result.pickedTeamId] || result.pickedTeamId} ${spreadLabel(result.model)}`,
      confidence: confidence ?? "—",
      edgePts: result.edgePts?.toFixed(1) || "—"
    };
  }

  // Show the picked team with positive edge
  const pickName = TEAM_NAME[result.pickedTeamId] || result.pickedTeamId;
  
  return {
    pickText: pickName,
    bookText: `Line: ${pickName} ${spreadLabel(result.market)}`,
    modelText: `Model: ${pickName} ${spreadLabel(result.model)}`,
    confidence: confidence ?? "—",
    edgePts: Number.isFinite(result.edgePts) ? `+${result.edgePts.toFixed(1)}` : "—",
    isEliteLevel: true // Flag for pro-level calculation
  };
}

// LEGACY: Keep old function during transition (not used anymore)
function buildSpreadDisplay({
  home, away,
  marketHomeLine,      // number, e.g. -2.5 (home favored by 2.5)
  modelHomeMargin,     // number, e.g. +0.2 (model: home by 0.2)
  spreadPick,          // "PIT" | "MIN" | "push" | null
  confidence,          // number or "—"
  edgePct              // number or "—"
}) {
  // Default "no bet" / invalid states
  if (!spreadPick || spreadPick.toLowerCase() === "push") {
    return {
      displayPick: "Pick 'em",
      bookLine: "—",
      modelLine: "—",
      edgePoints: "—",
      confidence: confidence ?? "—",
      edgePct: edgePct ?? "—"
    };
  }

  const picked = spreadPick; // abbr
  const pickedFull = TEAM_NAME[picked] || picked;

  // Convert to picked-team POV
  const teamLine = picked === home ? marketHomeLine : -marketHomeLine;
  const teamModel = picked === home ? modelHomeMargin : -modelHomeMargin;

  // Format lines
  const bookText = isNum(teamLine)
    ? (Math.abs(teamLine) < 0.25
        ? `${pickedFull} +0.0 (Pick 'em)`
        : `${pickedFull} ${fmtNum(teamLine)}`)
    : "—";

  const modelText = isNum(teamModel)
    ? (Math.abs(teamModel) < 0.25
        ? `${pickedFull} +0.0 (Pick 'em)`
        : `${pickedFull} ${fmtNum(teamModel)}`)
    : "—";

  // Edge in points (absolute diff)
  const edgePoints = (isNum(teamLine) && isNum(teamModel))
    ? Number(Math.abs(teamLine - teamModel).toFixed(1))
    : "—";

  return {
    displayPick: pickedFull,          // e.g., "Pittsburgh Steelers"
    bookLine: `Line: ${bookText}`,    // e.g., "Line: Pittsburgh Steelers +2.5"
    modelLine: `Model: ${modelText}`, // e.g., "Model: Pittsburgh Steelers +0.0 (Pick 'em)"
    edgePoints,                        // e.g., 2.5
    confidence: confidence ?? "—",
    edgePct: edgePct ?? "—"
  };
}

// Parlay suggestion component
function ParlaySuggestions({ parlaySuggestions, parlayMetadata }) {
  if (!parlaySuggestions || parlaySuggestions.length === 0) {
    return (
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Parlay Suggestions</h3>
        <p className="text-gray-600">No qualifying picks for parlay suggestions this week.</p>
      </div>
    );
  }

  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case 'LOW': return 'bg-green-100 text-green-800';
      case 'MODERATE': return 'bg-yellow-100 text-yellow-800';
      case 'HIGH': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getEstimatedOdds = (legs) => {
    // Rough odds estimation based on confidence levels
    const avgConfidence = legs.reduce((sum, leg) => sum + leg.confidence, 0) / legs.length;
    const legCount = legs.length;
    
    // Conservative odds estimation (lower than actual due to correlation)
    if (legCount === 2) {
      if (avgConfidence > 70) return "+180 to +220";
      if (avgConfidence > 65) return "+200 to +250";
      return "+220 to +280";
    } else if (legCount === 3) {
      if (avgConfidence > 70) return "+400 to +500";
      if (avgConfidence > 65) return "+450 to +600";
      return "+500 to +700";
    } else {
      return "+800 to +2000";
    }
  };

  return (
    <div className="mt-8 p-6 bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">Parlay Suggestions</h3>
        <div className="text-sm text-gray-600">
          {parlayMetadata?.totalComponents || 0} qualifying components
        </div>
      </div>
      
      <div className="grid gap-4">
        {parlaySuggestions.map((parlay, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h4 className="font-medium">{parlay.type.replace(/_/g, ' ').toUpperCase()}</h4>
                <span className={`px-2 py-1 text-xs rounded-full ${getRiskColor(parlay.risk_level)}`}>
                  {parlay.risk_level} RISK
                </span>
                <span className="text-sm text-gray-600">
                  Suggested: {parlay.recommended_unit}U
                </span>
              </div>
              <div className="text-right text-sm">
                <div className="font-medium">Avg Confidence: {Math.round(parlay.avg_confidence)}%</div>
                <div className="text-gray-600">Est Odds: {getEstimatedOdds(parlay.legs)}</div>
              </div>
            </div>
            
            <div className="space-y-2">
              {parlay.legs && parlay.legs.map((leg, legIdx) => (
                <div key={legIdx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{leg.matchup}</div>
                    <div className="text-sm text-gray-600">{leg.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{leg.confidence}%</div>
                    <div className="text-xs text-gray-500">{Number.isFinite(leg.edge) ? `${leg.edge.toFixed(1)}% edge` : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
            
            {parlay.description && (
              <div className="mt-2 text-sm text-gray-700 font-medium">
                Combined: {parlay.description}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Responsible gambling disclaimer */}
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h4 className="font-semibold text-yellow-800 mb-2">Responsible Parlay Guidelines</h4>
        <div className="text-sm text-yellow-700 space-y-1">
          <p>• {parlayMetadata?.responsibleGambling?.riskWarning}</p>
          <p>• {parlayMetadata?.responsibleGambling?.bankrollManagement}</p>
          <p>• Maximum recommended unit on any parlay: {parlayMetadata?.responsibleGambling?.maxRecommendedUnit || 0.5}U</p>
          <p>• These suggestions are for entertainment and analysis purposes only</p>
        </div>
      </div>
    </div>
  );
}

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [parlaySuggestions, setParlaySuggestions] = useState([]);
  const [parlayMetadata, setParlayMetadata] = useState({});
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading predictions...');
  const [error, setError] = useState(null);
  const [week, setWeek] = useState(4); // Will be updated to current week
  const season = 2025;

  // Initialize with current NFL week (use date calculation, not TD data)
  useEffect(() => {
    const initializeWeek = async () => {
      try {
        // For game predictions, use date-based calculation instead of TD data
        const currentWeek = getCurrentNFLWeek(); // Use date calculation directly
        setWeek(currentWeek);
      } catch (error) {
        console.warn('Could not determine current NFL week, using default');
      }
    };
    initializeWeek();
  }, []);

  const load = async (force = false) => {
    setLoading(true); 
    setError(null);
    setLoadingMessage('Loading predictions...');
    
    try {
      const data = await fetchPredictions(week, season, force, (progress) => {
        // Update loading message based on polling stage
        if (progress.stage === 'polling') {
          setLoadingMessage(progress.message || `Warming cache… retry ${progress.attempt}/${progress.maxRetries}`);
        } else if (progress.stage === 'fallback') {
          setLoadingMessage(progress.message || 'Generating fresh predictions (15-20s)…');
        } else if (progress.stage === 'ready') {
          setLoadingMessage('Loaded from cache');
        }
      });
      
      // 🔒 AUTO-LOCK: Lock any games that have already started
      const lockedPicks = autoLockStartedGames(season, week, data.rows);
      
      // 🔒 MERGE: Replace predictions with locked versions for started games
      const mergedRows = mergeLockedPicks(season, week, data.rows);
      
      // Log locked games summary
      const lockSummary = getLockedGamesSummary(season, week);
      if (lockSummary.count > 0) {
        console.log(`🔒 ${lockSummary.count} game(s) locked for Week ${week}`);
        lockSummary.games.forEach(g => {
          console.log(`   ${g.gameId}: Locked at ${new Date(g.lockedAt).toLocaleString()} ${g.autoLocked ? '(auto)' : ''}`);
        });
      }
      
      setRows(Array.isArray(mergedRows) ? mergedRows : []);
      setParlaySuggestions(data.parlaySuggestions || []);
      setParlayMetadata(data.parlayMetadata || {});
      setMeta(data.meta || null);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, [week]);
  
  // 🔬 ELITE DEBUGGER: Expose predictions data for console analysis
  useEffect(() => {
    if (rows && rows.length > 0) {
      window.predictionsData = rows;
      
      // Load the elite debugger functions
      // Store predictions data globally for debugging
      window.predictionsData = rows;
      
      // Add debug functions directly to window
      if (!window.debugGameModel) {
        window.debugGameModel = function(homeTeam, awayTeam) {
          console.log(`🔬 ELITE MODEL ANALYSIS: ${awayTeam} @ ${homeTeam}`);
          console.log("=".repeat(60));
          
          const gameData = window.predictionsData?.find(g => 
            g.home_team === homeTeam && g.away_team === awayTeam
          );
          
          if (!gameData) {
            console.error("❌ Game not found. Available games:");
            window.predictionsData?.forEach(g => 
              console.log(`   ${g.away_team} @ ${g.home_team}`)
            );
            return;
          }
          
          console.log("📊 RAW GAME DATA:");
          console.table(gameData);
          
          // Weather Analysis
          console.log("\n🌤️ WEATHER IMPACT ANALYSIS:");
          const weather = gameData.weather || gameData.conditions || {};
          if (weather.wind_mph !== undefined) {
            console.log(`💨 Wind: ${weather.wind_mph} mph ${weather.wind_mph > 15 ? "🚨 HIGH WIND" : "✅ Normal"}`);
          }
          if (weather.temperature !== undefined) {
            console.log(`🌡️ Temperature: ${weather.temperature}°F ${weather.temperature < 32 ? "🥶 FREEZING" : weather.temperature > 90 ? "🔥 HOT" : "✅ Normal"}`);
          }
          
          // Injury Analysis
          console.log("\n🏥 INJURY IMPACT ANALYSIS:");
          const homeInjuries = gameData.injuries?.home || gameData.home_injuries || [];
          const awayInjuries = gameData.injuries?.away || gameData.away_injuries || [];
          
          if (homeInjuries.length > 0) {
            console.log(`🏠 ${homeTeam} INJURIES:`, homeInjuries);
          } else {
            console.log(`🏠 ${homeTeam}: No significant injuries`);
          }
          
          if (awayInjuries.length > 0) {
            console.log(`✈️ ${awayTeam} INJURIES:`, awayInjuries);
          } else {
            console.log(`✈️ ${awayTeam}: No significant injuries`);
          }
          
          // Model Analysis
          console.log("\n⚙️ MODEL COMPONENTS:");
          const predictions = gameData.predictions || {};
          if (predictions.spread) {
            console.log("📏 SPREAD:", predictions.spread);
          }
          if (predictions.moneyline) {
            console.log("� MONEYLINE:", predictions.moneyline);
          }
          if (predictions.total) {
            console.log("🎲 TOTAL:", predictions.total);
          }
          
          // Team Stats
          if (gameData.teamStats) {
            console.log("\n📊 TEAM STATS:");
            console.log(`${homeTeam}:`, gameData.teamStats.home);
            console.log(`${awayTeam}:`, gameData.teamStats.away);
          }
        };
        
        // Enhanced injury debug - check all possible data sources
        window.debugInjuries = function(homeTeam, awayTeam) {
          const game = window.predictionsData?.find(g => g.home_team === homeTeam && g.away_team === awayTeam);
          if (!game) {
            console.error("Game not found");
            return;
          }
          
          console.log(`🏥 COMPREHENSIVE INJURY ANALYSIS: ${awayTeam} @ ${homeTeam}`);
          console.log("=".repeat(50));
          
          // Check all possible injury data locations
          console.log("🔍 INJURY DATA SOURCES:");
          console.log("game.injuries:", game.injuries);
          console.log("game.home_injuries:", game.home_injuries);
          console.log("game.away_injuries:", game.away_injuries);
          console.log("game.playerNews:", game.playerNews);
          console.log("game.inactives:", game.inactives);
          console.log("game.injuryReport:", game.injuryReport);
          console.log("game.playerStatus:", game.playerStatus);
          
          // Check QB-specific status
          console.log("\n🏈 QB STATUS CHECK:");
          console.log("game.qb_status:", game.qb_status);
          console.log("game.starting_qbs:", game.starting_qbs);
          
          // Check model enhancements for injury adjustments
          console.log("\n⚙️ MODEL INJURY ADJUSTMENTS:");
          const enhancements = game.modelEnhancements;
          if (enhancements) {
            console.log("Enhanced features:", enhancements.enhancedFeatures);
            console.log("Fixes applied:", enhancements.fixesApplied);
            console.log("Diagnostics:", enhancements.diagnostics);
            
            // Look for injury-related enhancements
            if (enhancements.enhancedFeatures?.injuryAdjustments) {
              console.log("🚨 INJURY ADJUSTMENTS FOUND:", enhancements.enhancedFeatures.injuryAdjustments);
            }
            
            // Check for QB injury flags
            if (enhancements.enhancedFeatures?.qbInjuryRisk) {
              console.log("🚨 QB INJURY RISK:", enhancements.enhancedFeatures.qbInjuryRisk);
            }
          }
          
          // Check team stats for injury impact
          console.log("\n📊 INJURY IMPACT ON STATS:");
          if (game.teamStats?.home?.injuryImpact) {
            console.log("Home injury impact:", game.teamStats.home.injuryImpact);
          }
          if (game.teamStats?.away?.injuryImpact) {
            console.log("Away injury impact:", game.teamStats.away.injuryImpact);
          }
          
          // Check if confidence was reduced due to injuries
          console.log("\n🎯 CONFIDENCE ANALYSIS:");
          const predictions = game.predictions || {};
          console.log("ML confidence:", predictions.moneyline?.confidence);
          console.log("Spread confidence:", predictions.spread?.confidence);
          console.log("Total confidence:", predictions.total?.confidence);
          
          if (predictions.moneyline?.confidence < 60) {
            console.log("⚠️ LOW ML CONFIDENCE - May indicate injury uncertainty");
          }
          
          // Summary
          console.log("\n📋 INJURY DATA STATUS:");
          const hasInjuryData = game.injuries || game.home_injuries || game.away_injuries || 
                               game.playerNews || game.inactives || game.injuryReport;
          console.log(`Injury data available: ${hasInjuryData ? "YES" : "NO"}`);
          
          if (!hasInjuryData) {
            console.log("🔴 ISSUE: No injury data found in any standard location");
            console.log("🔧 Recommendation: Check R pipeline injury data integration");
          }
        };
        
        // Quick weather debug
        window.debugWeather = function(homeTeam, awayTeam) {
          const game = window.predictionsData?.find(g => g.home_team === homeTeam && g.away_team === awayTeam);
          if (!game) {
            console.error("Game not found");
            return;
          }
          
          console.log(`🌤️ WEATHER REPORT: ${awayTeam} @ ${homeTeam}`);
          console.log(game.weather || game.conditions || "No weather data");
        };
        
        // Check R Pipeline data structure
        window.debugRPipeline = function(homeTeam, awayTeam) {
          const game = window.predictionsData?.find(g => g.home_team === homeTeam && g.away_team === awayTeam);
          if (!game) {
            console.error("Game not found");
            return;
          }
          
          console.log(`🔬 R PIPELINE DATA ANALYSIS: ${awayTeam} @ ${homeTeam}`);
          console.log("=".repeat(60));
          
          console.log("📦 COMPLETE GAME OBJECT STRUCTURE:");
          console.log("Top-level keys:", Object.keys(game));
          
          // Check each major section
          console.log("\n📊 PREDICTIONS STRUCTURE:");
          if (game.predictions) {
            Object.keys(game.predictions).forEach(key => {
              console.log(`${key}:`, Object.keys(game.predictions[key] || {}));
            });
          }
          
          console.log("\n💰 ODDS STRUCTURE:");
          if (game.odds) {
            console.log("Odds keys:", Object.keys(game.odds));
            console.log("Full odds:", game.odds);
          }
          
          console.log("\n📈 TEAM STATS STRUCTURE:");
          if (game.teamStats) {
            console.log("Home stats keys:", Object.keys(game.teamStats.home || {}));
            console.log("Away stats keys:", Object.keys(game.teamStats.away || {}));
            console.log("Full team stats:", game.teamStats);
          }
          
          console.log("\n🚀 MODEL ENHANCEMENTS:");
          if (game.modelEnhancements) {
            console.log("Enhancement keys:", Object.keys(game.modelEnhancements));
            console.log("Full enhancements:", game.modelEnhancements);
          }
          
          console.log("\n🔍 SEARCHING FOR INJURY KEYWORDS:");
          const gameStr = JSON.stringify(game);
          const injuryKeywords = ['injury', 'injured', 'questionable', 'doubtful', 'out', 'inactive', 'qb_status', 'daniels'];
          
          injuryKeywords.forEach(keyword => {
            if (gameStr.toLowerCase().includes(keyword)) {
              console.log(`✅ Found "${keyword}" in game data`);
              // Try to extract context
              const regex = new RegExp(`.{0,50}${keyword}.{0,50}`, 'gi');
              const matches = gameStr.match(regex);
              if (matches) {
                console.log(`   Context:`, matches.slice(0, 3));
              }
            } else {
              console.log(`❌ "${keyword}" not found`);
            }
          });
        };
        
        console.log('🔬 Elite Model Debugger loaded!');
        console.log('📝 Available functions:');
        console.log('  debugGameModel("ATL", "WAS") - Complete game analysis');
        console.log('  debugInjuries("ATL", "WAS")  - Enhanced injury check'); 
        console.log('  debugWeather("ATL", "WAS")   - Weather analysis');
        console.log('  debugRPipeline("ATL", "WAS") - R Pipeline data structure');
      }
      
      console.log(`📊 Predictions data updated: ${rows.length} games available for analysis`);
    }
  }, [rows]);

  // Export to PNG function
  const exportToPNG = async () => {
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      // Create export container
      const exportDiv = document.createElement('div');
      exportDiv.style.cssText = 'position:fixed;left:-9999px;top:0;background:white;padding:40px;width:1400px;';
      
      // Build table HTML
      let tableHTML = `
        <div style="font-size:32px;font-weight:bold;text-align:center;margin-bottom:30px;color:#000;">
          ■ NFL Week ${week} Model Predictions — Full Slate
        </div>
        <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
          <thead style="background:#1e3a5f;color:white;">
            <tr>
              <th style="padding:12px 10px;text-align:left;font-weight:bold;border:1px solid #2c4a6f;">Matchup</th>
              <th style="padding:12px 10px;text-align:left;font-weight:bold;border:1px solid #2c4a6f;">Moneyline</th>
              <th style="padding:12px 10px;text-align:left;font-weight:bold;border:1px solid #2c4a6f;">Spread</th>
              <th style="padding:12px 10px;text-align:left;font-weight:bold;border:1px solid #2c4a6f;">Total</th>
              <th style="padding:12px 10px;text-align:center;font-weight:bold;border:1px solid #2c4a6f;">Best Edge</th>
              <th style="padding:12px 10px;text-align:center;font-weight:bold;border:1px solid #2c4a6f;">EPA (Home/Away)</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      rows.forEach((r, idx) => {
        const homeTeam = r.home_team || 'HOME';
        const awayTeam = r.away_team || 'AWAY';
        
        // Get predictions from the correct structure
        const ml = r.predictions?.moneyline || {};
        const spread = r.predictions?.spread || {};
        const total = r.predictions?.total || {};
        
        // Format Moneyline
        let mlText = 'NO BET';
        if (ml.bet && ml.pick) {
          const units = ml.kellyUnits || ml.recommended_units || 0;
          const bestBook = ml.best_book || {};
          const price = bestBook.price || ml.odds || 0;
          const priceStr = price > 0 ? `+${price}` : price;
          mlText = `${ml.pick} ML (BET ${units.toFixed(1)}U, ${priceStr})`;
        }
        
        // Format Spread
        let spreadText = 'NO BET';
        if (spread.bet && spread.pick) {
          const units = spread.kellyUnits || spread.recommended_units || 0;
          const line = spread.line || 0;
          const lineStr = line > 0 ? `+${line}` : line;
          spreadText = `${spread.pick} ${lineStr} (BET ${units.toFixed(1)}U)`;
        }
        
        // Format Total
        let totalText = 'NO BET';
        if (total.bet && total.pick) {
          const units = total.kellyUnits || total.recommended_units || 0;
          const line = total.line || 0;
          totalText = `${total.pick} ${line} (BET ${units.toFixed(1)}U)`;
        }
        
        // Find best edge
        const edges = [];
        if (ml.edge) edges.push(Math.abs(ml.edge));
        if (spread.edge) edges.push(Math.abs(spread.edge));
        if (total.edge) edges.push(Math.abs(total.edge));
        const bestEdge = edges.length > 0 ? Math.max(...edges) : 0;
        
        // Get EPA values from teamStats
        const homeEPA = r.teamStats?.home?.score || r.teamStats?.home?.epa || r.home_epa || 0;
        const awayEPA = r.teamStats?.away?.score || r.teamStats?.away?.epa || r.away_epa || 0;
        
        const rowStyle = idx % 2 === 0 ? 'background:white;' : 'background:#f8f9fa;';
        tableHTML += `
          <tr style="${rowStyle}">
            <td style="padding:10px;border:1px solid #ccc;font-weight:600;">${awayTeam} @ ${homeTeam}</td>
            <td style="padding:10px;border:1px solid #ccc;">${mlText}</td>
            <td style="padding:10px;border:1px solid #ccc;">${spreadText}</td>
            <td style="padding:10px;border:1px solid #ccc;">${totalText}</td>
            <td style="padding:10px;border:1px solid #ccc;text-align:center;font-weight:bold;">${bestEdge.toFixed(1)}%</td>
            <td style="padding:10px;border:1px solid #ccc;text-align:center;">${homeEPA.toFixed(3)} / ${awayEPA.toFixed(3)}</td>
          </tr>
        `;
      });
      
      tableHTML += '</tbody></table>';
      exportDiv.innerHTML = tableHTML;
      document.body.appendChild(exportDiv);
      
      // Capture
      const canvas = await html2canvas(exportDiv, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        width: 1400,
        windowWidth: 1400
      });
      
      // Remove temp div
      document.body.removeChild(exportDiv);
      
      // Download (with iOS share sheet support)
      await saveCanvasAsPNG(canvas, `NFL_Week${week}_Model_Picks.png`);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed: ' + error.message);
    }
  };

  // PickBadge Component - moved outside map for proper JSX structure
  const PickBadge = ({ pick, confidence, type, modelValue, marketValue, betRecommendation, edge, pickedTeam, unitInfo, bestBook }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="font-medium text-sm">{pick}</div>
        <span className={`text-xs px-2 py-1 rounded font-medium ${
          betRecommendation?.text?.includes('BET') ? 
            (betRecommendation.color?.includes('text-green') ? 'bg-green-100 text-green-800' :
             betRecommendation.color?.includes('text-yellow') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800')
            : 'bg-red-100 text-red-800'
        }`}>
          {betRecommendation?.text || betRecommendation || 'NO BET'}
        </span>
        {(betRecommendation?.text?.includes('BET') || betRecommendation === 'BET') && unitInfo && (
          bestBook?.deep_link ? (
            <a 
              href={bestBook.deep_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800 font-medium hover:bg-orange-200 transition-colors cursor-pointer inline-flex items-center gap-1"
              title={`Place ${unitInfo.units}U bet at ${bestBook.bookmaker || 'sportsbook'}`}
            >
              🎯 Place
            </a>
          ) : (
            <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800 font-medium">
              {unitInfo.units}U
            </span>
          )
        )}
      </div>
      <div className={`text-xs px-2 py-1 rounded ${
        confidence >= 70 ? 'bg-blue-100 text-blue-800' :
        confidence >= 60 ? 'bg-yellow-100 text-yellow-800' :
        'bg-gray-100 text-gray-800'
      }`}>
        {confidence}% conf
      </div>
      {edge !== undefined && (
        <div className="text-xs text-purple-600 font-medium">
          {typeof edge === 'number' ? `${edge.toFixed(1)}% edge` : edge}
        </div>
      )}
      {(betRecommendation?.text?.includes('BET') || betRecommendation === 'BET') && unitInfo && unitInfo.tier && (
        <div className="text-xs text-orange-600 font-medium">
          {unitInfo.tier}: {unitInfo.reasoning || 'Bet sizing'}
        </div>
      )}
      {/* ALWAYS show market and model lines, even for NO BET */}
      {marketValue && (
        <div className="text-xs text-gray-600">
          {marketValue}
        </div>
      )}
      {modelValue && (
        <div className="text-xs text-blue-600">
          {modelValue}
        </div>
      )}
      {/* Show best-book information for BET recommendations */}
      {bestBook && (betRecommendation?.text?.includes('BET') || betRecommendation === 'BET') && (
        <div className="text-xs text-green-600 font-medium">
          Best: {bestBook.bookmaker || 'N/A'}
          {bestBook.price !== undefined ? ` ${fmtOdds(bestBook.price)}` : ''}
          {bestBook.line !== undefined ? ` ${bestBook.line > 0 ? '+' : ''}${bestBook.line}` : ''}
          {bestBook.edge_pct !== undefined ? ` (${Number(bestBook.edge_pct).toFixed(1)}% edge)` : ''}
          {bestBook.edge_points !== undefined ? ` (${Number(bestBook.edge_points).toFixed(1)} pts)` : ''}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">NFL Predictions</h1>
          {meta && (
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                Week {meta.week}, {meta.season} • {meta.games} games • Model: {meta.model}
              </p>
              {meta.model === 'R Pipeline + NFLVerse EPA' && (
                <p className="text-xs text-green-600 font-medium">
                  🚀 Advanced R Pipeline + NFLVerse EPA Model Active
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm">Week:</label>
            <select 
              value={week} 
              onChange={(e) => setWeek(Number(e.target.value))}
              className="px-2 py-1 border rounded"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>
          <button
            className="px-3 py-2 rounded-xl bg-green-600 text-white hover:opacity-90"
            onClick={exportToPNG}
            disabled={loading || rows.length === 0}
          >
            📥 Export PNG
          </button>
          <button
            className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90"
            onClick={() => load(true)}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">Error: {error}</div>
      )}

      <div className="overflow-auto rounded-2xl border border-neutral-200">
        <table className="min-w-full text-sm">
          <caption className="px-4 py-2 text-xs text-gray-600 text-left">
            📊 Display prices shown from priority book selection (FanDuel, DraftKings, BetMGM, etc.). 
            Edges computed using the best available price across all supported books (line-shopped).
            � All picks + closing odds are captured in CSV snapshots for post-week CLV analysis.
          </caption>
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Matchup</th>
              <th className="px-4 py-3 text-left font-medium">Kickoff</th>
              <th className="px-4 py-3 text-left font-medium">Moneyline</th>
              <th className="px-4 py-3 text-left font-medium">Spread</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">Best Edge</th>
              <th className="px-4 py-3 text-left font-medium">Team Stats</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={7}>{loadingMessage}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={7}>No predictions available for Week {week}, {season}.</td></tr>
            ) : (
              rows.map((r, idx) => {
                // ⏰ CLIENT-SIDE LOCK: Check if game has started
                const gameStartTime = r.start ? new Date(r.start) : null;
                const now = new Date();
                const hasGameStarted = gameStartTime && now > gameStartTime;
                
                const kickoff = r.start ? new Date(r.start).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                }) : '—';
                
                const ml = r.predictions?.moneyline;
                const spread = r.predictions?.spread;
                const total = r.predictions?.total;
                const odds = r.odds || {};
                
                // ELITE PRO: Calculate TRUE devigged edges (replace vigged backend calculations)
                let enhancedML = ml || {};
                // Use odds.moneyline.home/away (not home_price/away_price)
                if (ml && odds.moneyline?.home && odds.moneyline?.away) {
                  // Get model probabilities for both sides
                  const modelProbHome = ml.pick === r.home_team ? ((ml.confidence || 0) / 100) : (1 - (ml.confidence || 0) / 100);
                  const modelProbAway = 1 - modelProbHome;
                  
                  // Calculate proper devigged edge with both sides
                  const derigInfo = calculateDeriggedMLEdge(odds.moneyline.home, odds.moneyline.away, modelProbHome, modelProbAway);
                  
                  if (derigInfo) {
                    // Determine which side we're betting and get the correct edge
                    const bettingSide = ml.pick;
                    const isHomeBet = bettingSide === r.home_team;
                    const modelProb = isHomeBet ? modelProbHome : modelProbAway;
                    const fairProb = isHomeBet ? derigInfo.fairHome : derigInfo.fairAway;
                    const trueEdge = isHomeBet ? derigInfo.edgeHome : derigInfo.edgeAway;
                    
                    // Calculate Kelly unit sizing for ML bet
                    const mlOdds = isHomeBet ? odds.moneyline.home : odds.moneyline.away;
                    const mlDecimalOdds = mlOdds ? americanToDecimal(mlOdds) : 2.0;
                    const kellyUnitsML = kellyUnits(modelProb, mlDecimalOdds); // Use model prob for Kelly
                    
                    enhancedML = {
                      ...ml,
                      // TRUE DEVIGGED EDGE in percentage
                      edge: Number.isFinite(trueEdge) ? parseFloat((trueEdge * 100).toFixed(1)) : 0,
                      modelProb: (modelProb * 100).toFixed(1),
                      fairProb: (fairProb * 100).toFixed(1),
                      rawImplied: ((isHomeBet ? derigInfo.debug.rawHome : derigInfo.debug.rawAway) * 100).toFixed(1),
                      isEliteCalc: true,
                      // Debug info for verification
                      debugDerig: `Raw: ${derigInfo.debug.rawSum.toFixed(3)} → Fair: ${derigInfo.debug.fairSum.toFixed(3)}`,
                      // Update bet decision based on TRUE devigged edge
                      bet: Number.isFinite(trueEdge) && Math.abs(trueEdge) > 0.05, // 5% true edge threshold
                      // KELLY UNIT SIZING
                      kellyUnits: kellyUnitsML,
                      betRecommendation: getBetRecommendation(kellyUnitsML)
                    };
                  }
                }
                
                // ELITE PRO: Calculate devigged spread edges when we have both sides
                let enhancedSpread = spread || {};
                // Use odds.display.spread.home_price/away_price (not odds.spread.home_price)
                if (spread && odds.display?.spread?.home_price && odds.display?.spread?.away_price) {
                  try {
                    // Convert spread odds to probabilities and devig
                    const homeSpreadDecimal = americanToDecimal(odds.display.spread.home_price);
                    const awaySpreadDecimal = americanToDecimal(odds.display.spread.away_price);
                    const homeSpreadImplied = decimalToImpliedProb(homeSpreadDecimal);
                    const awaySpreadImplied = decimalToImpliedProb(awaySpreadDecimal);
                    
                    const { prob1: homeSpreadFair } = devig(homeSpreadImplied, awaySpreadImplied);
                    
                    // Calculate model's implied spread probability based on its prediction
                    const modelSpreadProb = spread.pick === r.home_team ? 0.6 : 0.4; // Rough conversion
                    const deriggedSpreadEdge = modelSpreadProb - homeSpreadFair;
                    
                    if (Math.abs(deriggedSpreadEdge) > 0.02) { // 2% edge threshold for spreads
                      // Calculate Kelly unit sizing for spread bet
                      const spreadOdds = spread.pick === r.home_team ? odds.display.spread.home_price : odds.display.spread.away_price;
                      const spreadDecimalOdds = spreadOdds ? americanToDecimal(spreadOdds) : 1.91; // Default to -110
                      const modelProbSpread = (spread.confidence || 0) / 100;
                      const kellyUnitsSpread = kellyUnits(modelProbSpread, spreadDecimalOdds);
                      
                      enhancedSpread = {
                        ...spread,
                        edge: parseFloat((deriggedSpreadEdge * 100).toFixed(1)), // Replace with devigged
                        rawSpreadEdge: spread.edge,
                        isDevigged: true,
                        bet: Math.abs(deriggedSpreadEdge) > 0.05, // 5% devigged edge for bet
                        // KELLY UNIT SIZING
                        kellyUnits: kellyUnitsSpread,
                        betRecommendation: getBetRecommendation(kellyUnitsSpread)
                      };
                    }
                  } catch (e) {
                    // Keep original spread if devig fails
                  }
                }
                
                // FALLBACK KELLY SIZING: Add unit sizing for non-enhanced bets
                if (ml && (!enhancedML || !enhancedML.kellyUnits)) {
                  // Use backend odds or default odds for Kelly calculation
                  const fallbackMLOdds = ml.odds || (ml.edge > 0 ? -110 : +100); // Default odds if none available
                  const mlDecimalOdds = americanToDecimal(fallbackMLOdds);
                  const modelProbML = (ml.confidence || 0) / 100;
                  const kellyUnitsML = kellyUnits(modelProbML, mlDecimalOdds);
                  
                  enhancedML = {
                    ...enhancedML,
                    kellyUnits: kellyUnitsML,
                    betRecommendation: getBetRecommendation(kellyUnitsML)
                  };
                }
                
                if (spread && (!enhancedSpread || !enhancedSpread.kellyUnits)) {
                  // Use backend spread odds or default -110
                  const fallbackSpreadOdds = spread.odds || -110;
                  const spreadDecimalOdds = americanToDecimal(fallbackSpreadOdds);
                  const modelProbSpread = (spread.confidence || 0) / 100;
                  const kellyUnitsSpread = kellyUnits(modelProbSpread, spreadDecimalOdds);
                  
                  enhancedSpread = {
                    ...enhancedSpread,
                    kellyUnits: kellyUnitsSpread,
                    betRecommendation: getBetRecommendation(kellyUnitsSpread)
                  };
                }
                
                // TOTALS KELLY SIZING
                let enhancedTotal = total || {};
                if (total && total.confidence > 0) {
                  // Use total odds or default -110
                  const totalOdds = odds.display?.total?.over?.price || odds.display?.total?.under?.price || total.odds || -110;
                  const totalDecimalOdds = americanToDecimal(totalOdds);
                  const modelProbTotal = (total.confidence || 0) / 100;
                  const kellyUnitsTotal = kellyUnits(modelProbTotal, totalDecimalOdds);
                  
                  enhancedTotal = {
                    ...total,
                    kellyUnits: kellyUnitsTotal,
                    betRecommendation: getBetRecommendation(kellyUnitsTotal)
                  };
                }
                
                // Calculate best TRUE edge (all devigged when possible)
                const mlEdgeForComparison = Math.abs(enhancedML?.edge || 0); // Now truly devigged
                const spreadEdgeForComparison = enhancedSpread?.isDevigged ? 
                  Math.abs(enhancedSpread.edge) : 
                  Math.abs(spread?.edge || 0);
                  
                const bestEdge = Math.max(
                  mlEdgeForComparison,
                  spreadEdgeForComparison,
                  total?.edge ? Math.abs(total.edge) : (total?.confidence > 60 ? (total.confidence - 50) : 0)
                );

                // CLEAN SOLUTION: Use favorite-based logic to automatically pick best side
                const favoriteString = r?.odds?.spread?.favorite || spread?.favorite; // 'home' or 'away'
                const favoriteTeamId = favoriteString === 'home' ? r.home_team : r.away_team;
                const spreadAbs = Math.abs(Number(r?.odds?.spread?.line || spread?.line || 0));
                
                const spreadDisplay = spreadDisplayFromPick({
                  homeAbbr: r.home_team,
                  awayAbbr: r.away_team,
                  favoriteId: favoriteTeamId, // actual team ID like 'PIT'
                  spreadAbs: spreadAbs > 0 ? spreadAbs : null, // absolute spread value
                  modelHomeMargin: Number(spread?.model_home_margin ?? 0),
                  confidence: spread?.confidence,
                  edgePct: enhancedSpread?.edge || spread?.edge, // Use devigged edge when available
                  TEAM_NAME
                });

                return (
                  <tr key={r.gameId || idx} className={`border-t border-neutral-200 hover:bg-neutral-25 ${r.isLocked ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {r.isLocked && (
                          <span className="text-blue-600" title={`Picks locked at ${new Date(r.lockedAt).toLocaleString()}${r.autoLocked ? ' (auto-locked when game started)' : ''}`}>
                            🔒
                          </span>
                        )}
                        <span>{fmt(r.matchup)}</span>
                        {hasSignificantInjuryImpact(r.teamStats?.away) && (
                          <span className="text-xs" title={`${r.away_team} significantly affected by injuries (${Math.abs(r.teamStats.away.injuryImpact?.totalImpact || 0).toFixed(1)} pts)`}>
                            🏥
                          </span>
                        )}
                        {hasSignificantInjuryImpact(r.teamStats?.home) && (
                          <span className="text-xs" title={`${r.home_team} significantly affected by injuries (${Math.abs(r.teamStats.home.injuryImpact?.totalImpact || 0).toFixed(1)} pts)`}>
                            🏥
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{kickoff}</td>
                    
                    <td className="px-4 py-3">
                      {enhancedML ? (
                        <div className="space-y-2">
                          <PickBadge 
                            pick={enhancedML.pick}
                            confidence={enhancedML.confidence}
                            betRecommendation={enhancedML.betRecommendation || getBetRecommendation(0)}
                            edge={enhancedML.edge} // Now always the corrected edge (devigged when possible)
                            type="ml"
                            unitInfo={Number.isFinite(enhancedML?.kellyUnits) && enhancedML.kellyUnits > 0 ? { units: enhancedML.kellyUnits.toFixed(1) } : null}
                            bestBook={enhancedML.best_book}
                          />
                          {enhancedML.isEliteCalc && (
                            <div className="text-xs text-green-600 font-medium space-y-1">
                              <div>✅ TRUE Edge: {enhancedML.edge}% (Model: {enhancedML.modelProb}% - Fair: {enhancedML.fairProb}%)</div>
                              <div className="text-gray-500">Raw Implied: {enhancedML.rawImplied}% | {enhancedML.debugDerig}</div>
                            </div>
                          )}
                          {/* Show display book prices from structured odds */}
                          {(odds.display?.h2h || odds.moneyline) && (
                            <div className="text-xs text-gray-500">
                              <div>{r.away_team}: {fmtOdds(odds.display?.h2h?.away || odds.moneyline?.away) || '—'}</div>
                              <div>{r.home_team}: {fmtOdds(odds.display?.h2h?.home || odds.moneyline?.home) || '—'}</div>
                              {odds.display_book && (
                                <div className="text-gray-400 text-[10px]">
                                  via {odds.display_book}
                                  {r.usingClosingOdds && (
                                    <span className="text-blue-600 ml-1">(Closing)</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    
                    <td className="px-4 py-3">
                      {/* ALWAYS show spread info, even for NO BET - crucial for review/backtesting */}
                      <PickBadge 
                        pick={spreadDisplay.pickText}
                        confidence={spreadDisplay.confidence}
                        betRecommendation={enhancedSpread?.betRecommendation || (spread?.betRecommendation ? getBetRecommendation(0) : getBetRecommendation(0))}
                        edge={spreadDisplay.edgePts + " pts"}
                        type="spread"
                        unitInfo={Number.isFinite(enhancedSpread?.kellyUnits) && enhancedSpread.kellyUnits > 0 ? { units: enhancedSpread.kellyUnits.toFixed(1) } : null}
                        modelValue={spreadDisplay.modelText}   // ✅ always shown: pick POV or neutral POV
                        marketValue={spreadDisplay.bookText}   // ✅ always shown: pick POV or neutral POV
                        pickedTeam={spread?.pick}
                        bestBook={spread?.best_book}
                      />
                      {/* Show devig status for spreads */}
                      {enhancedSpread?.isDevigged && (
                        <div className="text-xs text-green-600 font-medium mt-1">
                          ✅ Spread devigged: {enhancedSpread.edge}% (Was: {enhancedSpread.rawSpreadEdge}%)
                        </div>
                      )}
                      {/* Show display book for transparency */}
                      {r.odds?.display_book && (
                        <div className="text-gray-400 text-[10px] mt-1">
                          via {r.odds.display_book}
                          {r.usingClosingOdds && (
                            <span className="text-blue-600 ml-1">(Closing)</span>
                          )}
                        </div>
                      )}
                    </td>
                    
                    <td className="px-4 py-3">
                      {enhancedTotal ? (
                        <>
                          <PickBadge 
                            pick={enhancedTotal.pick === 'over' ? 'Over' : enhancedTotal.pick === 'under' ? 'Under' : 'Push'}
                            confidence={enhancedTotal.confidence}
                            betRecommendation={enhancedTotal.betRecommendation || getBetRecommendation(0)}
                            edge={enhancedTotal.edge}
                            type="total"
                            unitInfo={Number.isFinite(enhancedTotal?.kellyUnits) && enhancedTotal.kellyUnits > 0 ? { units: enhancedTotal.kellyUnits.toFixed(1) } : null}
                            modelValue={enhancedTotal.predicted ? `${enhancedTotal.predicted}` : null}
                            marketValue={(() => {
                              // Use display book total if available
                              if (odds.display?.total?.over?.line) {
                                return `${odds.display.total.over.line}`;
                              }
                              return enhancedTotal.line ? `${enhancedTotal.line}` : null;
                            })()}
                            bestBook={enhancedTotal.best_book}
                          />
                          {/* Show display book for transparency */}
                          {r.odds?.display_book && (
                            <div className="text-gray-400 text-[10px] mt-1">
                              via {r.odds.display_book}
                              {r.usingClosingOdds && (
                                <span className="text-blue-600 ml-1">(Closing)</span>
                              )}
                            </div>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    
                    <td className="px-4 py-3">
                      <span className={`font-medium ${
                        bestEdge > 10 ? 'text-green-600' : 
                        bestEdge > 5 ? 'text-yellow-600' : 
                        'text-gray-600'
                      }`}>
                        {bestEdge > 0 && Number.isFinite(bestEdge) ? `${bestEdge.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-1">
                        <div>Home: EPA {r.teamStats?.home?.strength?.toFixed(3) || '—'}</div>
                        <div>Away: EPA {r.teamStats?.away?.strength?.toFixed(3) || '—'}</div>
                        <div>Form: {r.teamStats?.home?.form?.toFixed(3) || '—'}</div>
                        {(r.modelEnhancements?.oddsIntegrated || r.odds?.moneyline?.home) && (
                          <div className="text-green-600">Live odds ✓</div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Parlay Suggestions Section */}
      {!loading && <ParlaySuggestions parlaySuggestions={parlaySuggestions} parlayMetadata={parlayMetadata} />}
      
      {rows.length > 0 && (
        <div className="mt-4 text-xs text-gray-500">
          <p><strong>Pick:</strong> Model's recommended bet with confidence percentage.</p>
          <p><strong>Line:</strong> Displayed from the perspective of the picked team. <strong>Model:</strong> Model's prediction.</p>
          <p><strong>Edge:</strong> Model probability vs market probability difference.</p>
          <p><strong>Live odds ✓:</strong> Real sportsbook data integrated for this game.</p>
        </div>
      )}

      {/* Debug Panel for Elite Analysis */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-bold text-yellow-800 mb-2">🔬 Elite Model Debugger</h3>
          <p className="text-sm text-yellow-700 mb-2">
            Open browser console and try: <code className="bg-yellow-100 px-1 rounded">debugGameModel('BUF', 'NO')</code>
          </p>
          <button 
            onClick={() => console.log('📊 Available games:', rows.map(r => `${r.away_team} @ ${r.home_team}`))}
            className="text-xs bg-yellow-200 hover:bg-yellow-300 px-2 py-1 rounded"
          >
            List Games in Console
          </button>
        </div>
      )}

      {/* Entertainment disclaimer */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
        <p className="text-sm text-blue-700">
          <strong>Disclaimer:</strong> This tool is for entertainment and educational purposes only. 
          Sports betting involves risk and should only be done with money you can afford to lose. 
          Please gamble responsibly.
        </p>
      </div>
    </div>
  );
}
