// src/pages/PredictionsTest.jsx
// Enhanced Split View UI with Line Movement & Injury Visualization
// Test page for bgroundrobin.com/predictionstest

import React, { useState, useEffect } from 'react';
import { Sparklines, SparklinesLine } from 'react-sparklines';
import { loadPredictionsWithPolling } from '../lib/fetchPredictions.js';
import { getCurrentNFLWeek } from '../utils/nflWeek.js';

const PredictionsTest = () => {
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading predictions...');
  const [selectedGame, setSelectedGame] = useState(null);
  const [clvStats, setCLVStats] = useState(null);
  const [week, setWeek] = useState(null);
  const season = 2025;

  useEffect(() => {
    const currentWeek = getCurrentNFLWeek();
    setWeek(currentWeek);
  }, []);

  useEffect(() => {
    if (week) {
      fetchPredictions();
      fetchCLVStats();
    }
  }, [week]);

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      setLoadingMessage('Loading predictions...');
      
      const data = await loadPredictionsWithPolling({ 
        season, 
        week,
        games: [], // Will be auto-fetched by polling utility
        onProgress: (progress) => {
          if (progress.stage === 'polling') {
            setLoadingMessage(progress.message || `Warming cache… retry ${progress.attempt}/${progress.maxRetries}`);
          } else if (progress.stage === 'fallback') {
            setLoadingMessage(progress.message || 'Generating fresh predictions (15-20s)…');
          } else if (progress.stage === 'ready') {
            setLoadingMessage('Loaded from cache');
          }
        }
      });
      
      // Normalize response structure - add week and season if missing
      const normalizedData = {
        ...data,
        week: data.week || week,
        season: data.season || season
      };
      
      setPredictions(normalizedData);
      if (normalizedData.predictions?.length > 0) {
        setSelectedGame(normalizedData.predictions[0]);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching predictions:', error);
      setLoadingMessage('Error loading predictions: ' + error.message);
      setLoading(false);
    }
  };

  const fetchCLVStats = async () => {
    try {
      const response = await fetch('/.netlify/functions/nfl-clv-track?weeks=6');
      const data = await response.json();
      setCLVStats(data);
    } catch (error) {
      console.error('Error fetching CLV:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#101520] flex items-center justify-center">
        <div className="text-white text-xl">{loadingMessage}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#101520] text-[#F9FAFB]">
      {/* Header */}
      <header className="bg-[#1C2433] border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">NFL Predictions</h1>
              <p className="text-sm text-gray-400 mt-1">
                Enhanced Split View • Week {predictions?.week} • {predictions?.season}
              </p>
            </div>
            {clvStats && (
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="text-xs text-gray-400">Avg CLV</div>
                  <div className={`text-lg font-bold ${clvStats.avg_clv_bps > 0 ? 'text-[#00CC66]' : 'text-red-400'}`}>
                    {clvStats.avg_clv_bps > 0 ? '+' : ''}{clvStats.avg_clv_bps.toFixed(0)} bps
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400">Win Rate</div>
                  <div className="text-lg font-bold text-white">
                    {(clvStats.positive_clv_rate * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400">Closed Bets</div>
                  <div className="text-lg font-bold text-white">
                    {clvStats.closed_bets}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Panel - Game List (30%) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-[#1C2433] rounded-lg p-4 border border-gray-800">
              <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                Week {predictions?.week} Games ({predictions?.predictions?.length || 0})
              </h2>
              <div className="space-y-2">
                {predictions?.predictions?.map((game, idx) => (
                  <GameCard 
                    key={idx} 
                    game={game} 
                    isSelected={selectedGame === game}
                    onClick={() => setSelectedGame(game)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel - Market Details (70%) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedGame && (
              <>
                {/* Top Action Card */}
                <TopActionCard game={selectedGame} />
                
                {/* Market Cards */}
                <MarketCardsSection game={selectedGame} />
                
                {/* Deep Dive Stats */}
                <DeepDiveStats game={selectedGame} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Game Card Component (Left Panel)
const GameCard = ({ game, isSelected, onClick }) => {
  const hasInjuries = game.modelEnhancements?.injuryAnalysis?.home?.impactedPlayers?.length > 0 ||
                      game.modelEnhancements?.injuryAnalysis?.away?.impactedPlayers?.length > 0;
  
  const bestEdge = Math.max(
    game.predictions?.moneyline?.edge || 0,
    game.predictions?.spread?.edge || 0,
    game.predictions?.total?.edge || 0
  );

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-all ${
        isSelected 
          ? 'bg-[#203040] border-2 border-[#00CC66]' 
          : 'bg-[#1C2433] border border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">
            {game.away_team} @ {game.home_team}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {new Date(game.start || game.commence_time).toLocaleDateString('en-US', { 
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
            })}
          </div>
        </div>
        {hasInjuries && (
          <span className="text-red-400 text-lg ml-2">🏥</span>
        )}
      </div>
      
      {bestEdge > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs font-bold text-[#00CC66]">
            {bestEdge.toFixed(1)}% edge
          </span>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-400">
            Best pick available
          </span>
        </div>
      )}
    </button>
  );
};

// Top Action Card
const TopActionCard = ({ game }) => {
  const markets = [
    { type: 'ML', data: game.predictions?.moneyline, label: 'Moneyline' },
    { type: 'Spread', data: game.predictions?.spread, label: 'Spread' },
    { type: 'Total', data: game.predictions?.total, label: 'Total' }
  ];

  // Find best pick
  const bestPick = markets.reduce((best, market) => {
    if (!market.data) return best;
    const edge = market.data.edge || 0;
    const units = market.data.recommended_units || 0;
    const score = edge * units;
    return score > (best.score || 0) ? { ...market, score } : best;
  }, {});

  if (!bestPick.data) return null;

  const pick = bestPick.data;

  return (
    <div className="bg-gradient-to-br from-[#203040] to-[#1C2433] rounded-xl p-6 border-2 border-[#00CC66]/30">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-[#00CC66] font-semibold mb-1 uppercase tracking-wide">
            🎯 Top Pick
          </div>
          <div className="text-2xl font-bold text-white">
            {game.away_team} @ {game.home_team}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {new Date(game.start || game.commence_time).toLocaleDateString('en-US', { 
              weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
            })}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-[#00CC66]">
            {pick.edge?.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400 mt-1">Edge</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-[#1C2433] rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-[#00CC66]">
            {pick.recommended_units?.toFixed(1)}U
          </div>
          <div className="text-xs text-gray-400 mt-1">Wager</div>
        </div>
        <div className="bg-[#1C2433] rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-white">
            {pick.confidence?.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400 mt-1">Confidence</div>
        </div>
        <div className="bg-[#1C2433] rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-white">
            {bestPick.label}
          </div>
          <div className="text-xs text-gray-400 mt-1">Market</div>
        </div>
      </div>

      <button className="w-full bg-[#00CC66] hover:bg-[#00DD77] text-white font-bold py-3 rounded-lg transition-colors">
        BET NOW - {pick.pick} {bestPick.type === 'Spread' && `(${pick.line})`}
      </button>
    </div>
  );
};

// Market Cards Section
const MarketCardsSection = ({ game }) => {
  return (
    <div className="space-y-4">
      <MoneylineCard game={game} />
      <SpreadCard game={game} />
      <TotalCard game={game} />
    </div>
  );
};

// Moneyline Card
const MoneylineCard = ({ game }) => {
  const pick = game.predictions?.moneyline;
  if (!pick || pick.confidence < 60) return null;

  const lineMovement = game.line_movement?.moneyline;
  
  // Get the odds for the picked team - try multiple paths
  let pickOdds;
  const isHome = pick.pick === game.home_team;
  
  if (game.odds?.display?.h2h) {
    pickOdds = isHome ? game.odds.display.h2h.home : game.odds.display.h2h.away;
  } else if (game.odds?.moneyline) {
    pickOdds = isHome ? game.odds.moneyline.home : game.odds.moneyline.away;
  }
  
  // Format odds for display (handle both +/- American odds)
  const formatOdds = (odds) => {
    if (!odds) return 'N/A';
    const num = Number(odds);
    if (isNaN(num)) return odds;
    return num > 0 ? `+${num}` : num.toString();
  };
  
  const formattedOdds = formatOdds(pickOdds);
  
  // Get best book info for deep link
  const bestBook = pick.best_book?.bookmaker || 'Sportsbook';

  return (
    <div className="bg-[#1C2433] rounded-lg p-5 border border-gray-800">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Moneyline</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Model Pick:</span>
            <span className="text-base font-bold text-white">{pick.pick}</span>
          </div>
        </div>
        {lineMovement && (
          <MovementBadge movement={lineMovement} />
        )}
      </div>

      {/* Sparkline */}
      {lineMovement?.timestamps?.length > 5 && (
        <div className="mb-4 h-12">
          <Sparklines data={lineMovement.implied_probabilities} height={48}>
            <SparklinesLine color="#00CC66" />
          </Sparklines>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <MetricBox label="Wager" value={pick.recommended_units ? `${pick.recommended_units.toFixed(1)}U` : '1.0U'} highlight />
        <MetricBox label="Confidence" value={`${pick.confidence?.toFixed(1)}%`} />
        <MetricBox label="Edge" value={`${pick.edge?.toFixed(1)}%`} highlight />
        <MetricBox label="Live Line" value={formattedOdds} />
      </div>

      {pick.unit_reasoning && (
        <div className="text-xs text-gray-400 mb-3 p-2 bg-[#101520] rounded">
          <span className="font-semibold">Sizing:</span> {pick.unit_reasoning}
        </div>
      )}

      <a 
        href={`https://www.actionnetwork.com/nfl/betting-odds`}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full bg-[#00CC66] hover:bg-[#00DD77] text-white font-bold py-2.5 rounded-lg transition-colors text-center cursor-pointer"
      >
        BET NOW @ {bestBook} - {pick.pick} ({formattedOdds})
      </a>
    </div>
  );
};

// Spread Card
const SpreadCard = ({ game }) => {
  const pick = game.predictions?.spread;
  if (!pick || pick.confidence < 60 || pick.pick === 'push') return null;

  const modelSpread = game.predictions?.elite?.projected_spread;
  const marketSpread = pick.line;
  const discrepancy = modelSpread && marketSpread ? Math.abs(modelSpread - marketSpread) : null;

  return (
    <div className="bg-[#1C2433] rounded-lg p-5 border border-gray-800">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Spread</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Model Pick:</span>
            <span className="text-base font-bold text-white">
              {pick.pick} {pick.line >= 0 ? '+' : ''}{pick.line}
            </span>
          </div>
        </div>
      </div>

      {discrepancy && discrepancy > 5 && (
        <div className="mb-4 p-3 bg-[#00CC66]/10 border border-[#00CC66]/30 rounded-lg">
          <div className="text-sm font-semibold text-[#00CC66] mb-1">
            ⚡ Large Discrepancy Detected
          </div>
          <div className="text-xs text-gray-300">
            Model projects <span className="font-bold">{modelSpread?.toFixed(1)}</span> pts, 
            market is at <span className="font-bold">{marketSpread}</span> pts 
            ({discrepancy.toFixed(1)} pt difference)
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <MetricBox label="Wager" value={pick.recommended_units ? `${pick.recommended_units.toFixed(1)}U` : '1.0U'} highlight />
        <MetricBox label="Confidence" value={`${pick.confidence?.toFixed(1)}%`} />
        <MetricBox label="Edge" value={`${pick.edge?.toFixed(1)}%`} highlight />
        <MetricBox label="Live Line" value={pick.line ? `${pick.line >= 0 ? '+' : ''}${pick.line}` : 'N/A'} />
      </div>

      <a 
        href={`https://www.actionnetwork.com/nfl/betting-odds`}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full bg-[#00CC66] hover:bg-[#00DD77] text-white font-bold py-2.5 rounded-lg transition-colors text-center cursor-pointer"
      >
        BET NOW @ {pick.best_book?.bookmaker || 'Sportsbook'} - {pick.pick} {pick.line >= 0 ? '+' : ''}{pick.line}
      </a>
    </div>
  );
};

// Total Card
const TotalCard = ({ game }) => {
  const pick = game.predictions?.total;
  if (!pick || pick.confidence < 58) return null;

  return (
    <div className="bg-[#1C2433] rounded-lg p-5 border border-gray-800">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Total</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Model Pick:</span>
            <span className="text-base font-bold text-white">
              {pick.pick.toUpperCase()} {pick.line}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <MetricBox label="Wager" value={pick.recommended_units ? `${pick.recommended_units.toFixed(1)}U` : '1.0U'} highlight />
        <MetricBox label="Confidence" value={`${pick.confidence?.toFixed(1)}%`} />
        <MetricBox label="Edge" value={`${pick.edge?.toFixed(1)}%`} highlight />
        <MetricBox label="Line" value={pick.line ? pick.line.toString() : 'N/A'} />
      </div>

      <a 
        href={`https://www.actionnetwork.com/nfl/betting-odds`}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full bg-[#00CC66] hover:bg-[#00DD77] text-white font-bold py-2.5 rounded-lg transition-colors text-center cursor-pointer"
      >
        BET NOW @ {pick.best_book?.bookmaker || 'Sportsbook'} - {pick.pick.toUpperCase()} {pick.line}
      </a>
    </div>
  );
};

// Deep Dive Stats
const DeepDiveStats = ({ game }) => {
  // Use team strength (win probability) as the primary metric
  // EPA data is embedded in the model's strength calculation
  const homeEPA = game.teamStats?.home?.strength || 0;
  const awayEPA = game.teamStats?.away?.strength || 0;

  const homeInjuries = game.teamStats?.home?.injuryImpact?.adjustments || [];
  const awayInjuries = game.teamStats?.away?.injuryImpact?.adjustments || [];

  return (
    <div className="bg-[#1C2433] rounded-lg p-5 border border-gray-800">
      <h3 className="text-lg font-bold text-white mb-4">Deep Dive Stats</h3>
      
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-sm text-gray-400 mb-2">{game.away_team} (Away)</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-300">EPA</span>
              <span className="text-sm font-bold text-white">{awayEPA.toFixed(3)}</span>
            </div>
            {awayInjuries.length > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-300">Injuries</span>
                <span className="text-sm font-bold text-red-400">{awayInjuries.length} players</span>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-400 mb-2">{game.home_team} (Home)</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-300">EPA</span>
              <span className="text-sm font-bold text-white">{homeEPA.toFixed(3)}</span>
            </div>
            {homeInjuries.length > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-300">Injuries</span>
                <span className="text-sm font-bold text-red-400">{homeInjuries.length} players</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm pt-4 border-t border-gray-700">
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-[#00CC66]">✓</span> Live Odds Feed
        </div>
        <div className="text-gray-400">
          Last updated: {new Date(game.odds?.source_snapshot_at || game.odds?.last_update || Date.now()).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

// Helper Components
const MovementBadge = ({ movement }) => {
  if (!movement?.drift_bps) return null;

  const isUp = movement.drift_bps > 0;
  const isFlat = Math.abs(movement.drift_bps) < 10;

  return (
    <div className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${
      isFlat ? 'bg-gray-700 text-gray-300' : 
      isUp ? 'bg-green-900/30 text-[#00CC66]' : 
      'bg-red-900/30 text-red-400'
    }`}>
      <span>{isFlat ? '↔' : isUp ? '↑' : '↓'}</span>
      <span>{Math.abs(movement.drift_bps)} bps</span>
    </div>
  );
};

const MetricBox = ({ label, value, highlight = false }) => (
  <div className="bg-[#101520] rounded p-2.5 text-center">
    <div className={`text-base font-bold ${highlight ? 'text-[#00CC66]' : 'text-white'}`}>
      {value}
    </div>
    <div className="text-xs text-gray-400 mt-0.5">{label}</div>
  </div>
);

export default PredictionsTest;
