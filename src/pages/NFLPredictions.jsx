// src/pages/NFLPredictions.jsx
import React, { useEffect, useState } from 'react';
import { getCurrentNFLWeek } from '../utils/nflWeek.js';

/**
 * NFL Predictions Page with Live Odds Display and Parlay Suggestions
 * Shows real sportsbook lines alongside model predictions and responsible parlay suggestions
 */

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const fmtOdds = (odds) => odds > 0 ? `+${odds}` : `${odds}`;

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

async function fetchPredictions(week = 4, season = 2025, force = false) {
  const games = await fetchSchedule(week, season);
  
  if (games.length === 0) {
    throw new Error(`No games found for Week ${week}, ${season}`);
  }
  
  // Use nfl-predictions-generate for live R Pipeline + NFLVerse EPA model
  const url = `/.netlify/functions/nfl-predictions-generate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'cache-control': 'no-cache' 
    },
    body: JSON.stringify({
      season: season.toString(),
      games: games,
      refresh: force
    })
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const response = await res.json();
  
  // Handle nfl-predictions-generate response structure  
  const predictions = response.predictions || [];
  const parlaySuggestions = response.parlaySuggestions || [];
  const parlayMetadata = response.parlayMetadata || {};  return {
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
      model: 'R Pipeline + NFLVerse EPA' // nfl-predictions-generate always uses R Pipeline
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
function americanToDecimal(american) {
  if (american > 0) return (american / 100) + 1;
  return (100 / Math.abs(american)) + 1;
}

function decimalToImpliedProb(decimal) {
  return 1 / decimal;
}

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

function calculateDeriggedMLEdge(homeProb, homePrice, awayPrice) {
  if (!homePrice || !awayPrice) return null;
  
  try {
    const deriggedEdge = calculateDevigged2WayEdge(homeProb, homePrice, awayPrice);
    return {
      rawEdge: homeProb - decimalToImpliedProb(americanToDecimal(homePrice)),
      deriggedEdge: deriggedEdge,
      improvedBy: deriggedEdge - (homeProb - decimalToImpliedProb(americanToDecimal(homePrice)))
    };
  } catch (e) {
    return null;
  }
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
    edgePts: `+${result.edgePts.toFixed(1)}`,
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
                    <div className="text-xs text-gray-500">{leg.edge.toFixed(1)}% edge</div>
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
    try {
      const data = await fetchPredictions(week, season, force);
      setRows(Array.isArray(data.rows) ? data.rows : []);
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
    if (predictions && predictions.length > 0) {
      window.predictionsData = predictions;
      
      // Load the elite debugger functions
      if (!window.debugGameModel) {
        const script = document.createElement('script');
        script.src = '/debug-model-analysis.js';
        script.onload = () => {
          console.log('🔬 Elite Model Debugger loaded! Try: debugGameModel("BUF", "NO")');
        };
        document.head.appendChild(script);
      }
      
      console.log(`📊 Predictions data updated: ${predictions.length} games available for analysis`);
    }
  }, [predictions]);

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
            🔒 Picks are automatically locked at kickoff with closing odds for accurate performance tracking.
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
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={7}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={7}>No predictions available for Week {week}, {season}.</td></tr>
            ) : (
              rows.map((r, idx) => {
                const kickoff = r.start ? new Date(r.start).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                }) : '—';
                
                const ml = r.predictions?.moneyline;
                const spread = r.predictions?.spread;
                const total = r.predictions?.total;
                const odds = r.odds || {};
                
                // ELITE PRO: Calculate TRUE devigged edges (replace vigged backend calculations)
                let enhancedML = ml || {};
                if (ml && odds.moneyline?.home_price && odds.moneyline?.away_price) {
                  const homeWinProb = ml.pick === r.home_team ? ((ml.confidence || 0) / 100) : (1 - (ml.confidence || 0) / 100);
                  const derigInfo = calculateDeriggedMLEdge(homeWinProb, odds.moneyline.home_price, odds.moneyline.away_price);
                  
                  if (derigInfo) {
                    // Calculate Kelly unit sizing for ML bet
                    const mlOdds = ml.pick === r.home_team ? odds.moneyline.home_price : odds.moneyline.away_price;
                    const mlDecimalOdds = mlOdds ? americanToDecimal(mlOdds) : 2.0; // Default to even odds
                    const modelProbML = (ml.confidence || 0) / 100;
                    const kellyUnitsML = kellyUnits(modelProbML, mlDecimalOdds);
                    
                    enhancedML = {
                      ...ml,
                      // CRITICAL FIX: Replace vigged edge with true devigged edge
                      edge: parseFloat((derigInfo.deriggedEdge * 100).toFixed(1)), // This is now the TRUE edge
                      rawEdge: (derigInfo.rawEdge * 100).toFixed(1),
                      deriggedEdge: (derigInfo.deriggedEdge * 100).toFixed(1), 
                      edgeImprovement: (derigInfo.improvedBy * 100).toFixed(1),
                      isEliteCalc: true,
                      // Update bet decision based on TRUE devigged edge
                      bet: Math.abs(derigInfo.deriggedEdge) > 0.05, // 5% true edge threshold
                      // KELLY UNIT SIZING
                      kellyUnits: kellyUnitsML,
                      betRecommendation: kellyUnitsML > 0 ? `BET ${kellyUnitsML.toFixed(1)}U` : "NO BET"
                    };
                  }
                }
                
                // ELITE PRO: Calculate devigged spread edges when we have both sides
                let enhancedSpread = spread || {};
                if (spread && odds.spread?.home_price && odds.spread?.away_price) {
                  try {
                    // Convert spread odds to probabilities and devig
                    const homeSpreadDecimal = americanToDecimal(odds.spread.home_price);
                    const awaySpreadDecimal = americanToDecimal(odds.spread.away_price);
                    const homeSpreadImplied = decimalToImpliedProb(homeSpreadDecimal);
                    const awaySpreadImplied = decimalToImpliedProb(awaySpreadDecimal);
                    
                    const { prob1: homeSpreadFair } = devig(homeSpreadImplied, awaySpreadImplied);
                    
                    // Calculate model's implied spread probability based on its prediction
                    const modelSpreadProb = spread.pick === r.home_team ? 0.6 : 0.4; // Rough conversion
                    const deriggedSpreadEdge = modelSpreadProb - homeSpreadFair;
                    
                    if (Math.abs(deriggedSpreadEdge) > 0.02) { // 2% edge threshold for spreads
                      // Calculate Kelly unit sizing for spread bet
                      const spreadOdds = spread.pick === r.home_team ? odds.spread.home_price : odds.spread.away_price;
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
                        betRecommendation: kellyUnitsSpread > 0 ? `BET ${kellyUnitsSpread.toFixed(1)}U` : "NO BET"
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
                    betRecommendation: kellyUnitsML > 0 ? `BET ${kellyUnitsML.toFixed(1)}U` : "NO BET"
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
                    betRecommendation: kellyUnitsSpread > 0 ? `BET ${kellyUnitsSpread.toFixed(1)}U` : "NO BET"
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
                    betRecommendation: kellyUnitsTotal > 0 ? `BET ${kellyUnitsTotal.toFixed(1)}U` : "NO BET"
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

                const PickBadge = ({ pick, confidence, type, modelValue, marketValue, betRecommendation, edge, pickedTeam, unitInfo, bestBook, lockedPick }) => (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm">{pick}</div>
                      {/* Lock indicator - shows if pick is locked with closing odds */}
                      {lockedPick && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-600 text-white font-medium">
                          🔒 LOCKED
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        betRecommendation === 'BET' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {betRecommendation}
                      </span>
                      {betRecommendation === 'BET' && unitInfo && (
                        <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800 font-medium">
                          {unitInfo.units}U
                        </span>
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
                    {betRecommendation === 'BET' && unitInfo && (
                      <div className="text-xs text-orange-600 font-medium">
                        {unitInfo.tier}: {unitInfo.reasoning}
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
                    {/* Show best-book information ONLY if not locked */}
                    {bestBook && betRecommendation === 'BET' && !lockedPick && (
                      <div className="text-xs text-green-600 font-medium">
                        Best: {bestBook.bookmaker || 'N/A'}
                        {bestBook.price !== undefined ? ` ${fmtOdds(bestBook.price)}` : ''}
                        {bestBook.line !== undefined ? ` ${bestBook.line > 0 ? '+' : ''}${bestBook.line}` : ''}
                        {bestBook.edge_pct !== undefined ? ` (${Number(bestBook.edge_pct).toFixed(1)}% edge)` : ''}
                        {bestBook.edge_points !== undefined ? ` (${Number(bestBook.edge_points).toFixed(1)} pts)` : ''}
                      </div>
                    )}
                    {/* Show locked pick details when available */}
                    {lockedPick && (
                      <div className="text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded">
                        <div className="font-medium">🔒 Locked at kickoff ({new Date(lockedPick.locked_at).toLocaleTimeString()})</div>
                        {lockedPick.closing_book && (
                          <div>Book: {lockedPick.closing_book}</div>
                        )}
                        {lockedPick.closing_line && (
                          <div>Closing: {lockedPick.closing_line}</div>
                        )}
                        {lockedPick.closing_total !== undefined && (
                          <div>Closing: {lockedPick.closing_total} {lockedPick.pick && lockedPick.pick.charAt(0).toUpperCase()}</div>
                        )}
                        {lockedPick.closing_odds !== undefined && (
                          <div>Closing odds: {fmtOdds(lockedPick.closing_odds)}</div>
                        )}
                        {lockedPick.trigger_source && (
                          <div className="text-[10px] text-gray-500">
                            Source: {lockedPick.trigger_source === 'kickoff' ? 'Auto (kickoff)' : 'Batch safety'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );

                return (
                  <tr key={r.gameId || idx} className="border-t border-neutral-200 hover:bg-neutral-25">
                    <td className="px-4 py-3 font-medium">{fmt(r.matchup)}</td>
                    <td className="px-4 py-3">{kickoff}</td>
                    
                    <td className="px-4 py-3">
                      {enhancedML ? (
                        <div className="space-y-2">
                          <PickBadge 
                            pick={enhancedML.pick}
                            confidence={enhancedML.confidence}
                            betRecommendation={enhancedML.betRecommendation || enhancedML.displayNote || "BET"}
                            edge={enhancedML.edge} // Now always the corrected edge (devigged when possible)
                            type="ml"
                            unitInfo={enhancedML?.kellyUnits > 0 ? { units: enhancedML.kellyUnits.toFixed(1) } : null}
                            bestBook={enhancedML.best_book}
                            lockedPick={r.locked_picks?.moneyline}
                          />
                          {enhancedML.isEliteCalc && (
                            <div className="text-xs text-green-600 font-medium">
                              ✅ Devigged: {enhancedML.edge}% (Was: {enhancedML.rawEdge}% vigged)
                            </div>
                          )}
                          {/* Show display book prices from structured odds */}
                          {(odds.display?.h2h || odds.moneyline) && (
                            <div className="text-xs text-gray-500">
                              <div>{r.away_team}: {fmtOdds(odds.display?.h2h?.away || odds.moneyline?.away) || '—'}</div>
                              <div>{r.home_team}: {fmtOdds(odds.display?.h2h?.home || odds.moneyline?.home) || '—'}</div>
                              {odds.display_book && (
                                <div className="text-gray-400 text-[10px]">via {odds.display_book}</div>
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
                        betRecommendation={enhancedSpread?.betRecommendation || spread?.betRecommendation || spread?.displayNote || (spread?.pick ? "BET" : "NO BET")}
                        edge={spreadDisplay.edgePts + " pts"}
                        type="spread"
                        unitInfo={enhancedSpread?.kellyUnits > 0 ? { units: enhancedSpread.kellyUnits.toFixed(1) } : null}
                        modelValue={spreadDisplay.modelText}   // ✅ always shown: pick POV or neutral POV
                        marketValue={spreadDisplay.bookText}   // ✅ always shown: pick POV or neutral POV
                        pickedTeam={spread?.pick}
                        bestBook={spread?.best_book}
                        lockedPick={r.locked_picks?.spread}
                      />
                      {/* Show devig status for spreads */}
                      {enhancedSpread?.isDevigged && (
                        <div className="text-xs text-green-600 font-medium mt-1">
                          ✅ Spread devigged: {enhancedSpread.edge}% (Was: {enhancedSpread.rawSpreadEdge}%)
                        </div>
                      )}
                      {/* Show display book for transparency */}
                      {r.odds?.display_book && (
                        <div className="text-gray-400 text-[10px] mt-1">via {r.odds.display_book}</div>
                      )}
                    </td>
                    
                    <td className="px-4 py-3">
                      {enhancedTotal ? (
                        <>
                          <PickBadge 
                            pick={enhancedTotal.pick === 'over' ? 'Over' : enhancedTotal.pick === 'under' ? 'Under' : 'Push'}
                            confidence={enhancedTotal.confidence}
                            betRecommendation={enhancedTotal.betRecommendation || enhancedTotal.displayNote || "BET"}
                            edge={enhancedTotal.edge}
                            type="total"
                            unitInfo={enhancedTotal?.kellyUnits > 0 ? { units: enhancedTotal.kellyUnits.toFixed(1) } : null}
                            modelValue={enhancedTotal.predicted ? `${enhancedTotal.predicted}` : null}
                            marketValue={(() => {
                              // Use display book total if available
                              if (odds.display?.total?.over?.line) {
                                return `${odds.display.total.over.line}`;
                              }
                              return enhancedTotal.line ? `${enhancedTotal.line}` : null;
                            })()}
                            bestBook={enhancedTotal.best_book}
                            lockedPick={r.locked_picks?.total}
                          />
                          {/* Show display book for transparency */}
                          {r.odds?.display_book && (
                            <div className="text-gray-400 text-[10px] mt-1">via {r.odds.display_book}</div>
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
                        {bestEdge > 0 ? `${bestEdge.toFixed(1)}%` : '—'}
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
