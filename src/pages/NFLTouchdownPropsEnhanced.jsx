// src/pages/NFLTouchdownPropsEnhanced.jsx
// Enhanced NFL TD Props Interface with R Pipeline Integration
import React, { useEffect, useState, useMemo } from 'react';
import useNFLTDPredictionsEnhanced, {
  useTopAnytimeTD,
  useTopMultipleTD,
  useTopFirstTD,
  useValueOpportunities,
  PredictionUtils,
  EnhancedPredictionCard
} from '../hooks/useNFLTDPredictionsEnhanced';
import { getCurrentNFLWeekFromData } from '../utils/nflWeek.js';

const NFLTouchdownPropsEnhanced = () => {
  const [week, setWeek] = useState(4); // Will be updated to current week
  const [selectedMarket, setSelectedMarket] = useState('anytime'); // anytime, first, multiple
  const [filterLevel, setFilterLevel] = useState('all'); // all, high_confidence, value
  const [sortBy, setSortBy] = useState('probability'); // probability, confidence, value
  const [selectedPosition, setSelectedPosition] = useState('all'); // all, QB, RB, WR, TE
  const [selectedTeam, setSelectedTeam] = useState('all'); // all, specific team
  const [viewMode, setViewMode] = useState('comprehensive'); // comprehensive, cards, summary
  const season = 2024;

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

  // Main predictions hook with comprehensive options
  const {
    data: predictions,
    metadata,
    loading,
    error,
    refresh,
    isStale,
    isFresh,
    hasData,
    isEmpty
  } = useNFLTDPredictionsEnhanced({
    type: 'all',
    week: week,
    min_confidence: filterLevel === 'high_confidence' ? 'high' : 'low',
    min_value_score: filterLevel === 'value' ? 0.6 : 0.0,
    position: selectedPosition !== 'all' ? selectedPosition : null,
    team: selectedTeam !== 'all' ? selectedTeam : null,
    auto_refresh: true,
    refresh_interval: 5 * 60 * 1000
  });

  // Specialized hooks for market-specific data
  const topAnytimeQuery = useTopAnytimeTD({ top_n: 15 });
  const topMultipleQuery = useTopMultipleTD({ top_n: 15 });
  const topFirstQuery = useTopFirstTD({ top_n: 15 });
  const valueQuery = useValueOpportunities({ min_value_score: 0.6, top_n: 20 });

  // Enhanced filtering and sorting logic with R pipeline data
  const processedPredictions = useMemo(() => {
    if (!predictions?.predictions) return [];

    let filtered = [...predictions.predictions];
    
    // Market-specific filtering
    filtered = filtered.filter(player => {
      const marketProb = player[`${selectedMarket}_td_prob`];
      const marketConfidence = player[`${selectedMarket}_confidence`];
      const marketValue = player[`${selectedMarket}_value_score`];
      
      if (!marketProb) return false;
      
      // Filter by confidence/value thresholds
      if (filterLevel === 'high_confidence' && marketConfidence !== 'high') return false;
      if (filterLevel === 'value' && marketValue < 0.6) return false;
      
      // Minimum probability thresholds by market
      const minProb = selectedMarket === 'anytime' ? 0.05 : 
                    selectedMarket === 'first' ? 0.01 : 0.01;
      if (marketProb < minProb) return false;
      
      return true;
    });
    
    // Sort by selected criteria using R pipeline data
    filtered.sort((a, b) => {
      const aProp = a[`${selectedMarket}_td_prob`];
      const bProp = b[`${selectedMarket}_td_prob`];
      const aConf = a[`${selectedMarket}_confidence`];
      const bConf = b[`${selectedMarket}_confidence`];
      const aValue = a[`${selectedMarket}_value_score`];
      const bValue = b[`${selectedMarket}_value_score`];
      
      if (sortBy === 'probability') return bProp - aProp;
      if (sortBy === 'confidence') {
        const confValues = { high: 3, medium: 2, low: 1, neutral: 0 };
        return (confValues[bConf] || 0) - (confValues[aConf] || 0);
      }
      if (sortBy === 'value') return (bValue || 0) - (aValue || 0);
      return 0;
    });
    
    return filtered;
  }, [predictions, selectedMarket, filterLevel, sortBy]);

  // Enhanced stats calculations
  const enhancedStats = useMemo(() => {
    if (!processedPredictions.length) return {};

    return {
      total: processedPredictions.length,
      highConfidence: processedPredictions.filter(p => p[`${selectedMarket}_confidence`] === 'high').length,
      highProbability: processedPredictions.filter(p => p[`${selectedMarket}_td_prob`] >= 0.25).length,
      valueOpportunities: processedPredictions.filter(p => p[`${selectedMarket}_value_score`] >= 0.6).length,
      byPosition: {
        QB: processedPredictions.filter(p => p.position === 'QB').length,
        RB: processedPredictions.filter(p => p.position === 'RB').length,
        WR: processedPredictions.filter(p => p.position === 'WR').length,
        TE: processedPredictions.filter(p => p.position === 'TE').length,
      },
      avgProbability: processedPredictions.reduce((sum, p) => 
        sum + (p[`${selectedMarket}_td_prob`] || 0), 0) / processedPredictions.length || 0,
    };
  }, [processedPredictions, selectedMarket]);

  // Enhanced Confidence Badge Component
  const EnhancedConfidenceBadge = ({ player, market }) => {
    const confidence = player[`${market}_confidence`];
    const probability = player[`${market}_td_prob`];
    const valueScore = player[`${market}_value_score`];
    
    const confidenceFormat = PredictionUtils.formatConfidence(confidence);
    const valueFormat = PredictionUtils.formatValueScore(valueScore);
    
    return (
      <div className="space-y-1">
        <div 
          className={`text-xs px-2 py-1 rounded border font-medium`}
          style={{ backgroundColor: confidenceFormat.bgColor, color: confidenceFormat.color }}
        >
          {confidenceFormat.text}
        </div>
        <div className="text-xs text-gray-600">
          {PredictionUtils.formatProbability(probability)}
        </div>
        <div 
          className={`text-xs px-1 py-0.5 rounded font-medium`}
          style={{ color: valueFormat.color }}
        >
          {valueFormat.text}
        </div>
      </div>
    );
  };

  // Enhanced Odds Display Component
  const EnhancedOddsDisplay = ({ player, market }) => {
    const odds = player[`${market}_odds_american`];
    const probability = player[`${market}_td_prob`];
    const valueScore = player[`${market}_value_score`];
    
    return (
      <div className="text-sm">
        <div className="font-medium">
          {PredictionUtils.formatOdds(odds)}
        </div>
        <div className="text-gray-500 text-xs">
          {(1/probability).toFixed(1)}x payout
        </div>
        <div className={`text-xs font-medium mt-1 ${
          valueScore >= 0.7 ? 'text-green-600' : 
          valueScore >= 0.5 ? 'text-blue-600' : 'text-gray-500'
        }`}>
          {valueScore >= 0.6 ? '💰 VALUE' : ''}
        </div>
      </div>
    );
  };

  // Enhanced Player Insights Component
  const EnhancedPlayerInsights = ({ player, market }) => {
    const recentTDRate = player.recent_td_rate || 0;
    const usageShare = player.usage_share || 0;
    const explosiveness = player.explosiveness || 0;
    const matchupAdvantage = player.matchup_advantage;
    
    const getMatchupColor = (advantage) => {
      const colors = {
        excellent: 'text-green-600 bg-green-50',
        good: 'text-blue-600 bg-blue-50',
        average: 'text-gray-600 bg-gray-50',
        below_average: 'text-orange-600 bg-orange-50',
        poor: 'text-red-600 bg-red-50'
      };
      return colors[advantage] || colors.average;
    };
    
    return (
      <div className="text-xs space-y-1">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="font-medium">Usage:</span>
            <div>{PredictionUtils.formatProbability(usageShare)}</div>
          </div>
          <div>
            <span className="font-medium">TD Rate:</span>
            <div>{PredictionUtils.formatProbability(recentTDRate)}</div>
          </div>
          <div>
            <span className="font-medium">Explosive:</span>
            <div>{PredictionUtils.formatProbability(explosiveness)}</div>
          </div>
        </div>
        
        {matchupAdvantage && (
          <div className={`px-2 py-1 rounded text-xs font-medium ${getMatchupColor(matchupAdvantage)}`}>
            {matchupAdvantage.replace('_', ' ').toUpperCase()} matchup
          </div>
        )}
      </div>
    );
  };

  // Summary Cards View
  const SummaryCardsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {processedPredictions.slice(0, 20).map((player, idx) => (
        <EnhancedPredictionCard
          key={`${player.player_id}-${idx}`}
          prediction={player}
          market={selectedMarket}
          showValue={true}
          className="hover:shadow-md transition-shadow"
        />
      ))}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Enhanced Header with Pipeline Status */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            NFL Touchdown Props - Enhanced R Pipeline
            {isFresh && <span className="text-green-500 text-sm">🟢 LIVE</span>}
            {isStale && <span className="text-orange-500 text-sm">⚠️ STALE</span>}
          </h1>
          <p className="text-gray-600 mt-1">
            Week {week}, {season} • {predictions?.playerCount || 0} players analyzed • 
            {processedPredictions.length} shown
            {metadata && (
              <span className="ml-2 text-sm">
                • Pipeline: {metadata.pipeline.version} • 
                Updated: {Math.floor(metadata.dataAge.minutes)}m ago
              </span>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Week:</label>
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
            className={`px-4 py-2 rounded-xl text-white transition-all ${
              loading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-black hover:opacity-90'
            }`}
            onClick={refresh}
            disabled={loading}
          >
            {loading ? 'Loading...' : '🔄 Refresh Pipeline'}
          </button>
        </div>
      </div>

      {/* Enhanced Controls with R Pipeline Options */}
      <div className="bg-white rounded-lg border mb-6 p-4">
        {/* Market Selection */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Market:</span>
            {[
              { key: 'anytime', label: 'Anytime TD', desc: 'Score any TD during game', icon: '🎯' },
              { key: 'first', label: 'First TD', desc: 'Score first TD of game', icon: '🥇' },
              { key: 'multiple', label: '2+ TDs', desc: 'Score multiple TDs', icon: '💪' }
            ].map(market => (
              <button
                key={market.key}
                onClick={() => setSelectedMarket(market.key)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                  selectedMarket === market.key 
                    ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                }`}
                title={market.desc}
              >
                <span>{market.icon}</span>
                {market.label}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter:</span>
            <select 
              value={filterLevel} 
              onChange={(e) => setFilterLevel(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="all">All Players</option>
              <option value="high_confidence">High Confidence Only</option>
              <option value="value">Value Opportunities</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Position:</span>
            <select 
              value={selectedPosition} 
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="all">All Positions</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Sort:</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="probability">Probability</option>
              <option value="confidence">Confidence</option>
              <option value="value">Value Score</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">View:</span>
            <select 
              value={viewMode} 
              onChange={(e) => setViewMode(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="comprehensive">Comprehensive Table</option>
              <option value="cards">Summary Cards</option>
              <option value="summary">Quick Summary</option>
            </select>
          </div>
        </div>
        
        {/* Enhanced Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
          <div className="bg-blue-50 p-2 rounded">
            <div className="font-semibold text-blue-800">{enhancedStats.highConfidence || 0}</div>
            <div className="text-blue-600">High Confidence</div>
          </div>
          <div className="bg-green-50 p-2 rounded">
            <div className="font-semibold text-green-800">{enhancedStats.valueOpportunities || 0}</div>
            <div className="text-green-600">Value Opportunities</div>
          </div>
          <div className="bg-purple-50 p-2 rounded">
            <div className="font-semibold text-purple-800">{enhancedStats.byPosition?.RB || 0}</div>
            <div className="text-purple-600">Running Backs</div>
          </div>
          <div className="bg-orange-50 p-2 rounded">
            <div className="font-semibold text-orange-800">
              {(enhancedStats.byPosition?.WR || 0) + (enhancedStats.byPosition?.TE || 0)}
            </div>
            <div className="text-orange-600">Pass Catchers</div>
          </div>
          <div className="bg-red-50 p-2 rounded">
            <div className="font-semibold text-red-800">{enhancedStats.highProbability || 0}</div>
            <div className="text-red-600">25%+ Probability</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <div className="font-semibold text-gray-800">
              {enhancedStats.avgProbability ? Math.round(enhancedStats.avgProbability * 100) : 0}%
            </div>
            <div className="text-gray-600">Avg Probability</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          <strong>R Pipeline Error:</strong> {error}
          <button 
            onClick={refresh}
            className="ml-3 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Conditional Rendering Based on View Mode */}
      {viewMode === 'cards' && <SummaryCardsView />}

      {viewMode === 'comprehensive' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Player</th>
                  <th className="px-4 py-3 text-left font-medium">Team/Matchup</th>
                  <th className="px-4 py-3 text-left font-medium">Position</th>
                  <th className="px-4 py-3 text-left font-medium">R Pipeline Analysis</th>
                  <th className="px-4 py-3 text-left font-medium">Model Odds</th>
                  <th className="px-4 py-3 text-left font-medium">Enhanced Insights</th>
                  <th className="px-4 py-3 text-left font-medium">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-gray-500" colSpan={7}>
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <span>Loading enhanced R pipeline predictions...</span>
                      </div>
                    </td>
                  </tr>
                ) : isEmpty ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-gray-500" colSpan={7}>
                      No {selectedMarket} TD predictions found for current filters
                    </td>
                  </tr>
                ) : (
                  processedPredictions.slice(0, 50).map((player, idx) => {
                    const bestMarket = PredictionUtils.getBestMarket(player);
                    const hasValue = PredictionUtils.hasValue(player, selectedMarket);
                    
                    return (
                      <tr key={`${player.player_id}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium">{player.player_name}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <span>ID: {player.player_id}</span>
                              {hasValue && <span className="px-1 bg-green-100 text-green-700 rounded">VALUE</span>}
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium text-xs">{player.matchup}</div>
                            <div className="text-xs text-gray-500">
                              Team: {player.team} vs {player.opponent}
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-4 py-3">
                          <span 
                            className="px-2 py-1 text-xs rounded font-medium text-white"
                            style={{ backgroundColor: PredictionUtils.getPositionColor(player.position) }}
                          >
                            {player.position}
                          </span>
                        </td>
                        
                        <td className="px-4 py-3">
                          <EnhancedConfidenceBadge player={player} market={selectedMarket} />
                        </td>
                        
                        <td className="px-4 py-3">
                          <EnhancedOddsDisplay player={player} market={selectedMarket} />
                        </td>
                        
                        <td className="px-4 py-3">
                          <EnhancedPlayerInsights player={player} market={selectedMarket} />
                        </td>
                        
                        <td className="px-4 py-3">
                          <div className="text-center">
                            {(() => {
                              const confidence = player[`${selectedMarket}_confidence`];
                              const valueScore = player[`${selectedMarket}_value_score`];
                              
                              if (confidence === 'high' && valueScore >= 0.7) {
                                return <div className="text-sm font-bold text-green-600">🎯 STRONG BET</div>;
                              } else if (confidence === 'high' || valueScore >= 0.6) {
                                return <div className="text-sm font-bold text-blue-600">📈 VALUE</div>;
                              } else if (confidence === 'medium' && valueScore >= 0.5) {
                                return <div className="text-sm font-bold text-yellow-600">👀 WATCH</div>;
                              } else {
                                return <div className="text-sm font-bold text-gray-600">❌ PASS</div>;
                              }
                            })()}
                            <div className="text-xs text-gray-500 mt-1">
                              Best: {bestMarket.name}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enhanced Educational Section */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-3">🔬 R Pipeline Features</h3>
          <div className="text-sm text-blue-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-medium">NFLVerse Data:</span>
              <span>Play-by-play, rosters, injuries, depth charts (2015-2024)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Ensemble Models:</span>
              <span>XGBoost, Random Forest, Logistic Regression, Neural Network</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Market Calibration:</span>
              <span>Position-specific base rates with matchup adjustments</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Real-time Updates:</span>
              <span>5-minute refresh cycle, live data integration</span>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-3">💡 Enhanced Strategy</h3>
          <div className="text-sm text-green-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-medium">High Confidence + Value:</span>
              <span>Primary targets, full unit sizing</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Value Opportunities:</span>
              <span>Market inefficiencies, selective betting</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Position Context:</span>
              <span>RB: 35% base, WR: 28%, TE: 22%, QB: 18%</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Matchup Analysis:</span>
              <span>Defensive rankings, pace factors, game script</span>
            </div>
          </div>
        </div>
      </div>

      {/* R Pipeline Status Footer */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex justify-between items-center text-sm text-gray-700">
          <div>
            <strong>R Pipeline Status:</strong> {metadata?.pipeline.provider || 'Loading...'} • 
            Version: {metadata?.pipeline.version || 'N/A'} • 
            Model: {metadata?.pipeline.modelType || 'ensemble'}
          </div>
          <div>
            Last Updated: {metadata ? 
              `${metadata.dataAge.minutes}m ${metadata.dataAge.hours ? `(${metadata.dataAge.hours}h)` : ''} ago` : 
              'N/A'}
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-2 text-center">
          <strong>Disclaimer:</strong> Enhanced R pipeline analysis for educational purposes only. 
          Advanced modeling does not guarantee outcomes. Bet responsibly.
        </p>
      </div>
    </div>
  );
};

export default NFLTouchdownPropsEnhanced;