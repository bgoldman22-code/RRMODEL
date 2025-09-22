// src/pages/NFLTouchdownPropsComprehensive.jsx
// Advanced NFL TD Props Interface with Multi-Market Analysis
import React, { useEffect, useState, useMemo } from 'react';

const NFLTouchdownPropsComprehensive = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [week, setWeek] = useState(3);
  const [selectedMarket, setSelectedMarket] = useState('anytime'); // anytime, first, multiple
  const [filterLevel, setFilterLevel] = useState('all'); // all, high_confidence, value
  const [sortBy, setSortBy] = useState('probability'); // probability, confidence, value
  const season = 2025;

  // Load schedule and player data from committed JSON files
  const loadComprehensivePredictions = async () => {
    setLoading(true);
    setError(null);
    
    console.log('Starting data load...');
    
    try {
      // Load player data first (this always works)
      console.log('Loading player data...');
      const playerRes = await fetch('/nfl-anytime-td-player-data.json');
      if (!playerRes.ok) throw new Error(`Player data failed: ${playerRes.status}`);
      const playerData = await playerRes.json();
      const players = Object.values(playerData.players || {});
      console.log(`Loaded ${players.length} players`);
      
      // Load schedule data
      console.log('Loading schedule data...');
      const scheduleRes = await fetch('/data/nfl-schedule-2025.json');
      if (!scheduleRes.ok) {
        console.warn(`Schedule API failed with ${scheduleRes.status}, using all players`);
        // If schedule fails, just show all players without game filtering
        setPredictions(players);
        return;
      }
      
      const scheduleData = await scheduleRes.json();
      console.log('Schedule data loaded:', scheduleData);
      
      // Check if we have data for this week
      if (!scheduleData.weeks || !scheduleData.weeks[week]) {
        console.warn(`No schedule data for week ${week}, using all players`);
        setPredictions(players);
        return;
      }
      
      const matchups = scheduleData.weeks[week].matchups || [];
      console.log(`Found ${matchups.length} games for week ${week}`);
      
      if (matchups.length === 0) {
        console.warn(`No games for week ${week}, using all players`);
        setPredictions(players);
        return;
      }
      
      // Map games to our format
      const games = matchups.map(game => ({
        game_id: game.id || `${game.homeTeam}-${game.awayTeam}`,
        home_team: getTeamAbbreviation(game.homeTeam),
        away_team: getTeamAbbreviation(game.awayTeam)
      }));
      
      // Build predictions for each game/player
      const allPlayers = [];
      for (const game of games) {
        for (const player of players) {
          if (player.team === game.home_team || player.team === game.away_team) {
            allPlayers.push({
              ...player,
              game_matchup: `${game.away_team} @ ${game.home_team}`,
              home_team: game.home_team,
              away_team: game.away_team
            });
          }
        }
      }
      
      console.log(`Built predictions for ${allPlayers.length} players`);
      setPredictions(allPlayers);
      
    } catch (err) {
      console.error('Error in loadComprehensivePredictions:', err);
      setError(`Data loading error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComprehensivePredictions();
  }, [week]);

  // Helper function for team name mapping
  function getTeamAbbreviation(fullName) {
    const nameMap = {
      "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
      "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
      "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
      "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
      "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
      "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
      "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
      "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
      "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
      "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
      "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
    };
    return nameMap[fullName] || fullName;
  }

  // Advanced filtering and sorting logic
  const processedPredictions = useMemo(() => {
    let filtered = predictions.filter(player => {
      const marketData = player[`${selectedMarket}_td`];
      if (!marketData) return false;
      
      // Filter by confidence/value thresholds
      if (filterLevel === 'high_confidence' && marketData.confidence < 70) return false;
      if (filterLevel === 'value' && (!marketData.value || marketData.value < 0.05)) return false;
      
      // Minimum probability thresholds by market
      const minProb = selectedMarket === 'anytime' ? 0.05 : 
                    selectedMarket === 'first' ? 0.01 : 0.01;
      if (marketData.probability < minProb) return false;
      
      return true;
    });
    
    // Sort by selected criteria
    filtered.sort((a, b) => {
      const aData = a[`${selectedMarket}_td`];
      const bData = b[`${selectedMarket}_td`];
      
      if (sortBy === 'probability') return bData.probability - aData.probability;
      if (sortBy === 'confidence') return bData.confidence - aData.confidence;
      if (sortBy === 'value') return (bData.value || 0) - (aData.value || 0);
      return 0;
    });
    
    return filtered;
  }, [predictions, selectedMarket, filterLevel, sortBy]);

  // Component for confidence badge with advanced styling
  const AdvancedConfidenceBadge = ({ confidence, probability, dataReliability }) => {
    const getConfidenceColor = (conf) => {
      if (conf >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      if (conf >= 70) return 'bg-green-100 text-green-800 border-green-200';
      if (conf >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      if (conf >= 50) return 'bg-orange-100 text-orange-800 border-orange-200';
      return 'bg-gray-100 text-gray-800 border-gray-200';
    };
    
    return (
      <div className={`text-xs px-2 py-1 rounded border ${getConfidenceColor(confidence)}`}>
        <div className="font-medium">{confidence}%</div>
        <div className="text-xs opacity-75">
          {(probability * 100).toFixed(1)}% prob
        </div>
        {dataReliability && (
          <div className="text-xs opacity-60">
            {(dataReliability * 100).toFixed(0)}% rel
          </div>
        )}
      </div>
    );
  };

  // Component for displaying key factors
  const PlayerInsights = ({ player, marketType }) => {
    const factors = player.key_factors || {};
    const metadata = player.model_metadata || {};
    const upside = metadata.upside_factors || [];
    const risks = metadata.risk_factors || [];
    
    return (
      <div className="text-xs space-y-1">
        <div className="flex flex-wrap gap-1">
          <span className="font-medium">Path:</span>
          <span className={`px-1 rounded text-xs ${
            metadata.primary_td_path === 'red_zone' ? 'bg-blue-100 text-blue-700' :
            metadata.primary_td_path === 'explosive' ? 'bg-purple-100 text-purple-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {metadata.primary_td_path || 'mixed'}
          </span>
        </div>
        
        <div>
          <span className="font-medium">Snap:</span> {((factors.snap_percentage || 0) * 100).toFixed(0)}% |
          <span className="font-medium"> RZ Eff:</span> {((factors.red_zone_efficiency || 0) * 100).toFixed(0)}% |
          <span className="font-medium"> Consist:</span> {((factors.consistency_score || 0) * 100).toFixed(0)}%
        </div>
        
        {upside.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-green-600 font-medium text-xs">↗</span>
            {upside.slice(0, 2).map((factor, i) => (
              <span key={i} className="bg-green-50 text-green-700 px-1 py-0.5 rounded text-xs">
                {factor.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
        
        {risks.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-red-600 font-medium text-xs">↘</span>
            {risks.slice(0, 2).map((factor, i) => (
              <span key={i} className="bg-red-50 text-red-700 px-1 py-0.5 rounded text-xs">
                {factor.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Component for odds display
  const OddsDisplay = ({ impliedOdds, probability, bestBook, value }) => (
    <div className="text-sm">
      <div className="font-medium">
        {impliedOdds > 0 ? `+${impliedOdds}` : impliedOdds}
      </div>
      <div className="text-gray-500 text-xs">
        {(100/probability).toFixed(1)}x payout
      </div>
      {bestBook && (
        <div className="text-xs text-blue-600 mt-1">
          vs {bestBook}: {value > 0 ? '+' : ''}{(value * 100).toFixed(1)}pp
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-4 p-2 bg-gray-100 rounded text-xs">
          Debug: Week {week}, Predictions: {predictions.length}, Loading: {loading.toString()}, Error: {error || 'none'}
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">NFL Touchdown Props - Comprehensive Analysis</h1>
          <p className="text-gray-600 mt-1">
            Week {week}, {season} • {predictions.length} players analyzed • {processedPredictions.length} shown
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
            className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 transition-opacity"
            onClick={loadComprehensivePredictions}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg border mb-6 p-4">
        {/* Market Selection */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Market:</span>
            {[
              { key: 'anytime', label: 'Anytime TD', desc: 'Score any TD during game' },
              { key: 'first', label: 'First TD', desc: 'Score first TD of game' },
              { key: 'multiple', label: '2+ TDs', desc: 'Score multiple TDs' }
            ].map(market => (
              <button
                key={market.key}
                onClick={() => setSelectedMarket(market.key)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedMarket === market.key 
                    ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                }`}
                title={market.desc}
              >
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
              <option value="high_confidence">High Confidence (70%+)</option>
              <option value="value">Value Plays</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Sort by:</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="probability">Probability</option>
              <option value="confidence">Confidence</option>
              <option value="value">Value vs Books</option>
            </select>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div className="bg-blue-50 p-2 rounded">
            <div className="font-semibold text-blue-800">
              {processedPredictions.filter(p => p[`${selectedMarket}_td`]?.confidence >= 70).length}
            </div>
            <div className="text-blue-600">High Confidence</div>
          </div>
          <div className="bg-green-50 p-2 rounded">
            <div className="font-semibold text-green-800">
              {processedPredictions.filter(p => p[`${selectedMarket}_td`]?.probability >= 0.25).length}
            </div>
            <div className="text-green-600">25%+ Probability</div>
          </div>
          <div className="bg-purple-50 p-2 rounded">
            <div className="font-semibold text-purple-800">
              {processedPredictions.filter(p => p.position === 'RB').length}
            </div>
            <div className="text-purple-600">Running Backs</div>
          </div>
          <div className="bg-orange-50 p-2 rounded">
            <div className="font-semibold text-orange-800">
              {processedPredictions.filter(p => ['WR', 'TE'].includes(p.position)).length}
            </div>
            <div className="text-orange-600">Pass Catchers</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <div className="font-semibold text-gray-800">
              {processedPredictions.filter(p => p.model_metadata?.upside_factors?.length > 2).length}
            </div>
            <div className="text-gray-600">High Upside</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main Predictions Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Player</th>
                <th className="px-4 py-3 text-left font-medium">Team/Matchup</th>
                <th className="px-4 py-3 text-left font-medium">Position</th>
                <th className="px-4 py-3 text-left font-medium">Model Analysis</th>
                <th className="px-4 py-3 text-left font-medium">Probability</th>
                <th className="px-4 py-3 text-left font-medium">Model Odds</th>
                <th className="px-4 py-3 text-left font-medium">Player Insights</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={8}>
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span>Loading comprehensive predictions...</span>
                    </div>
                  </td>
                </tr>
              ) : processedPredictions.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={8}>
                    No qualifying {selectedMarket} TD predictions found for current filters
                  </td>
                </tr>
              ) : (
                processedPredictions.slice(0, 50).map((player, idx) => {
                  const marketData = player[`${selectedMarket}_td`];
                  const metadata = player.model_metadata || {};
                  
                  return (
                    <tr key={`${player.player_id}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium">{player.name}</div>
                          <div className="text-xs text-gray-500">
                            Depth: #{player.depth_chart_position || 'N/A'} | {player.team}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-xs">{player.game_matchup}</div>
                          <div className="text-xs text-gray-500">
                            {player.team === player.home_team ? '🏠 Home' : '✈️ Away'}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded font-medium ${
                          player.position === 'RB' ? 'bg-blue-100 text-blue-800' :
                          player.position === 'WR' ? 'bg-green-100 text-green-800' :
                          player.position === 'TE' ? 'bg-purple-100 text-purple-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {player.position}
                        </span>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="text-xs space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Path:</span>
                            <span className={`px-1 py-0.5 rounded text-xs ${
                              metadata.primary_td_path === 'red_zone' ? 'bg-red-100 text-red-700' :
                              metadata.primary_td_path === 'explosive' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {metadata.primary_td_path || 'mixed'}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">Reliability:</span> {((metadata.data_reliability || 0.5) * 100).toFixed(0)}%
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <AdvancedConfidenceBadge 
                          confidence={marketData?.confidence || 0} 
                          probability={marketData?.probability || 0}
                          dataReliability={metadata.data_reliability}
                        />
                      </td>
                      
                      <td className="px-4 py-3">
                        <OddsDisplay 
                          impliedOdds={marketData?.implied_odds || 0}
                          probability={marketData?.probability || 0.01}
                          bestBook={marketData?.best_book}
                          value={marketData?.value}
                        />
                      </td>
                      
                      <td className="px-4 py-3">
                        <PlayerInsights player={player} marketType={selectedMarket} />
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="text-center">
                          <div className={`text-sm font-bold ${
                            (marketData?.confidence || 0) >= 75 ? 'text-green-600' :
                            (marketData?.confidence || 0) >= 65 ? 'text-yellow-600' :
                            (marketData?.confidence || 0) >= 55 ? 'text-orange-600' : 'text-gray-600'
                          }`}>
                            {(marketData?.confidence || 0) >= 75 ? '🎯 BET' :
                             (marketData?.confidence || 0) >= 65 ? '📈 VALUE' :
                             (marketData?.confidence || 0) >= 55 ? '👀 WATCH' : '❌ PASS'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {marketData?.confidence || 0}% conf
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

      {/* Educational Section */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-3">Comprehensive Model Features</h3>
          <div className="text-sm text-blue-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-medium">Multi-Path Analysis:</span>
              <span>Red Zone (40%), Explosive (25%), Opportunistic (20%), Consistency (15%)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Situational Factors:</span>
              <span>Injury opportunities, game script, opponent matchups, weather conditions</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Data Integration:</span>
              <span>Current season, historical performance, team context, opponent analysis</span>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-3">Betting Strategy Guidelines</h3>
          <div className="text-sm text-green-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-medium">High Confidence (75%+):</span>
              <span>Primary betting targets, standard unit sizing</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Value Plays (65-74%):</span>
              <span>Selective opportunities, reduced unit sizing</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Watch List (55-64%):</span>
              <span>Monitor for line movement, potential value</span>
            </div>
          </div>
        </div>
      </div>

      {/* Responsible Gambling Disclaimer */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
        <p className="text-sm text-gray-700">
          <strong>Disclaimer:</strong> This comprehensive analysis is for entertainment and educational purposes only. 
          Player prop betting involves significant variance and risk. Never bet more than you can afford to lose. 
          Gamble responsibly and seek help if gambling becomes problematic.
        </p>
      </div>
    </div>
  );
};

export default NFLTouchdownPropsComprehensive;
