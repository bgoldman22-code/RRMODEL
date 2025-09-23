// src/pages/NFLPredictions.jsx
import React, { useEffect, useState } from 'react';
import { getCurrentNFLWeekFromData } from '../utils/nflWeek.js';

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
  
  const url = `/.netlify/functions/nfl-predictions-generate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'cache-control': 'no-cache' 
    },
    body: JSON.stringify({
      season: season.toString(),
      games: games
    })
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const response = await res.json();
  
  // FIXED: Handle the new response structure with predictions and parlay suggestions
  const predictions = response.predictions || response; // Fallback if response is still the old format
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
      modelEnhancements: pred.modelEnhancements
    })),
    parlaySuggestions: parlaySuggestions,
    parlayMetadata: parlayMetadata,
    meta: {
      week: week,
      season: season,
      games: predictions.length,
      model: 'enhanced_v12_calibrated'
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
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
  };
  return nameMap[fullName] || fullName;
}

function formatSpreadDisplay(spread, homeTeam, awayTeam, odds) {
  if (!spread) {
    return {
      displayPick: '—',
      displayLine: '—'
    };
  }
  
  const marketLine = spread.line || 0;
  
  const TEAM_NAME_MAPPING = {
    'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens',
    'BUF': 'Buffalo Bills', 'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
    'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns', 'DAL': 'Dallas Cowboys',
    'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
    'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars',
    'KC': 'Kansas City Chiefs', 'LV': 'Las Vegas Raiders', 'LAC': 'Los Angeles Chargers',
    'LAR': 'Los Angeles Rams', 'MIA': 'Miami Dolphins', 'MIN': 'Minnesota Vikings',
    'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
    'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers',
    'SF': 'San Francisco 49ers', 'SEA': 'Seattle Seahawks', 'TB': 'Tampa Bay Buccaneers',
    'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders'
  };

  // Determine which team the line favors based on the spread value
  // Negative spread = home team favored, Positive spread = away team favored
  const lineFavorsHome = marketLine < 0;
  const lineFavoredTeam = lineFavorsHome ? homeTeam : awayTeam;
  const lineFavoredTeamFull = TEAM_NAME_MAPPING[lineFavoredTeam] || lineFavoredTeam;
  
  // For display purposes, always show the favored team with the spread
  const displayLine = lineFavorsHome ? 
    `${lineFavoredTeamFull} ${marketLine}` : 
    `${lineFavoredTeamFull} +${Math.abs(marketLine)}`;
  
  return {
    displayPick: spread?.pick || 'Push',
    displayLine: marketLine ? displayLine : '—',
    lineFavoredTeam: lineFavoredTeam
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

  // Initialize with current NFL week
  useEffect(() => {
    const initializeWeek = async () => {
      try {
        const currentWeek = await getCurrentNFLWeekFromData();
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">NFL Predictions</h1>
          {meta && (
            <p className="text-sm text-gray-600">
              Week {meta.week}, {meta.season} • {meta.games} games • Model: {meta.model}
            </p>
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
                
                const bestEdge = Math.max(
                  Math.abs(ml?.edge || 0),
                  spread?.confidence > 60 ? (spread.confidence - 50) : 0,
                  total?.confidence > 60 ? (total.confidence - 50) : 0
                );

                const spreadDisplay = formatSpreadDisplay(spread, r.home_team, r.away_team, odds);

                const PickBadge = ({ pick, confidence, type, modelValue, marketValue, betRecommendation, edge, pickedTeam }) => (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm">{pick}</div>
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        betRecommendation === 'BET' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {betRecommendation}
                      </span>
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
                    {marketValue && (
                      <div className="text-xs text-gray-600">
                        Line: {marketValue}
                      </div>
                    )}
                    {modelValue && marketValue && (
                      <div className="text-xs text-blue-600">
                        Model: {(() => {
                          if (type === 'spread') {
                            // For spreads, show which team the model actually favors
                            if (spread?.model_home_margin !== undefined) {
                              const margin = spread.model_home_margin;
                              if (Math.abs(margin) < 0.5) {
                                return 'Pick \'em';
                              }
                              const favoredTeam = margin > 0 ? r.home_team : r.away_team;
                              return `${favoredTeam} -${Math.abs(margin).toFixed(1)}`;
                            } else if (spread?.predicted !== undefined) {
                              // Use predicted spread to determine favored team
                              const margin = spread.predicted;
                              if (Math.abs(margin) < 0.5) {
                                return 'Pick \'em';
                              }
                              const favoredTeam = margin > 0 ? r.home_team : r.away_team;
                              return `${favoredTeam} -${Math.abs(margin).toFixed(1)}`;
                            } else {
                              return `${modelValue}`;
                            }
                          } else {
                            return `${modelValue} ${pick}`;
                          }
                        })()}
                      </div>
                    )}
                  </div>
                );

                return (
                  <tr key={r.gameId || idx} className="border-t border-neutral-200 hover:bg-neutral-25">
                    <td className="px-4 py-3 font-medium">{fmt(r.matchup)}</td>
                    <td className="px-4 py-3">{kickoff}</td>
                    
                    <td className="px-4 py-3">
                      {ml ? (
                        <div className="space-y-2">
                          <PickBadge 
                            pick={ml.pick}
                            confidence={ml.confidence}
                            betRecommendation={ml.betRecommendation || ml.displayNote || "BET"}
                            edge={ml.edge}
                            type="ml"
                          />
                          {(odds.moneyline?.home || odds.moneyline?.away) && (
                            <div className="text-xs text-gray-500">
                              <div>{r.away_team}: {fmtOdds(odds.moneyline.away) || '—'}</div>
                              <div>{r.home_team}: {fmtOdds(odds.moneyline.home) || '—'}</div>
                            </div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    
                    <td className="px-4 py-3">
                      {spread ? (
                        <PickBadge 
                          pick={spreadDisplay.displayPick}
                          confidence={spread.confidence}
                          betRecommendation={spread.betRecommendation || spread.displayNote || "BET"}
                          edge={spread.edge}
                          type="spread"
                          modelValue={spread.predicted ? `${spread.predicted > 0 ? '+' : ''}${spread.predicted}` : null}
                          marketValue={spreadDisplay.displayLine}
                          pickedTeam={spread.pick}
                        />
                      ) : '—'}
                    </td>
                    
                    <td className="px-4 py-3">
                      {total ? (
                        <PickBadge 
                          pick={total.pick === 'over' ? 'Over' : total.pick === 'under' ? 'Under' : 'Push'}
                          confidence={total.confidence}
                          betRecommendation={total.betRecommendation || total.displayNote || "BET"}
                          edge={total.edge}
                          type="total"
                          modelValue={total.predicted ? `${total.predicted}` : null}
                          marketValue={total.line ? `${total.line}` : null}
                        />
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
