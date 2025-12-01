// src/pages/FantasySitStart.jsx
import React, { useState, useEffect } from 'react';

// Use local Netlify functions hosted on bgroundrobin.com
const FANTASY_API_BASE = '/.netlify/functions';

export default function FantasySitStart() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [recommendations, setRecommendations] = useState(null);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${FANTASY_API_BASE}/ff-get-leagues`);
      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setLeagues(data.leagues || []);
      } else {
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error('Error checking auth:', err);
      setIsAuthenticated(false);
    }
  };

  const handleLogin = () => {
    // Redirect to Yahoo OAuth start
    window.location.href = `${FANTASY_API_BASE}/ff-auth-start`;
  };

  const handleGetRecommendations = async () => {
    if (!selectedLeague) {
      setError('Please select a league');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        league: selectedLeague,
        format: 'json',
        explain: 'all'
      });

      if (selectedWeek) {
        params.append('week', selectedWeek);
      }

      const response = await fetch(`${FANTASY_API_BASE}/ff-run?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch recommendations: ${response.statusText}`);
      }

      const data = await response.json();
      setRecommendations(data);
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderPositionGroup = (title, players) => {
    if (!players || players.length === 0) return null;

    return (
      <div className="mb-6">
        <h3 className="text-xl font-bold mb-3 text-gray-800">{title}</h3>
        <div className="space-y-2">
          {players.map((player, idx) => (
            <div 
              key={idx} 
              className={`p-4 rounded-lg border-2 ${
                player.start 
                  ? 'bg-green-50 border-green-500' 
                  : 'bg-red-50 border-red-500'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-lg">
                    {player.name} ({player.position})
                  </div>
                  <div className="text-sm text-gray-600">
                    {player.team} vs {player.opponent}
                  </div>
                  {player.reason && (
                    <div className="text-sm mt-2 text-gray-700">
                      {player.reason}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {player.start ? (
                      <span className="text-green-600">START</span>
                    ) : (
                      <span className="text-red-600">SIT</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Proj: {player.projected_points?.toFixed(1) || 'N/A'} pts
                  </div>
                  {player.tier && (
                    <div className="text-xs text-gray-500 mt-1">
                      Tier {player.tier}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Not authenticated view
  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Fantasy Sit/Start Analyzer</h1>
        
        <div className="bg-blue-50 border-2 border-blue-500 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Connect Your Yahoo Fantasy Account</h2>
          <p className="text-gray-700 mb-6">
            Get AI-powered sit/start recommendations for your fantasy football team based on:
          </p>
          <ul className="text-left max-w-md mx-auto mb-6 space-y-2">
            <li>✓ Player projections and matchup analysis</li>
            <li>✓ Live betting lines and props</li>
            <li>✓ Your league's scoring settings</li>
            <li>✓ FLEX optimization suggestions</li>
          </ul>
          <button
            onClick={handleLogin}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
          >
            Connect Yahoo Account
          </button>
        </div>
      </div>
    );
  }

  // Authenticated view
  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Fantasy Sit/Start Analyzer</h1>

      {/* League Selection */}
      <div className="bg-white border-2 border-gray-300 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Select Your League</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">League</label>
            <select
              value={selectedLeague || ''}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
            >
              <option value="">Select a league...</option>
              {leagues.map((league) => (
                <option key={league.league_key} value={league.league_key}>
                  {league.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Week (optional)</label>
            <input
              type="number"
              min="1"
              max="18"
              placeholder="Current week"
              value={selectedWeek || ''}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
            />
          </div>
        </div>

        <button
          onClick={handleGetRecommendations}
          disabled={loading || !selectedLeague}
          className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
            loading || !selectedLeague
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Analyzing...' : 'Get Sit/Start Recommendations'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      )}

      {/* Recommendations Display */}
      {recommendations && (
        <div className="space-y-6">
          {/* Summary Stats */}
          {recommendations.summary && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-4">Team Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {recommendations.summary.total_projected?.toFixed(1) || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600">Projected Points</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {recommendations.summary.starts || 0}
                  </div>
                  <div className="text-sm text-gray-600">Starters</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {recommendations.summary.sits || 0}
                  </div>
                  <div className="text-sm text-gray-600">Bench</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {recommendations.summary.flex_swaps || 0}
                  </div>
                  <div className="text-sm text-gray-600">Suggested Swaps</div>
                </div>
              </div>
            </div>
          )}

          {/* Position Groups */}
          {recommendations.roster && (
            <div className="bg-white border-2 border-gray-300 rounded-lg p-6">
              {renderPositionGroup('Quarterbacks', recommendations.roster.QB)}
              {renderPositionGroup('Running Backs', recommendations.roster.RB)}
              {renderPositionGroup('Wide Receivers', recommendations.roster.WR)}
              {renderPositionGroup('Tight Ends', recommendations.roster.TE)}
              {renderPositionGroup('Flex', recommendations.roster.FLEX)}
              {renderPositionGroup('Kickers', recommendations.roster.K)}
              {renderPositionGroup('Defense/Special Teams', recommendations.roster.DEF)}
            </div>
          )}

          {/* FLEX Swap Suggestions */}
          {recommendations.flex_swaps && recommendations.flex_swaps.length > 0 && (
            <div className="bg-yellow-50 border-2 border-yellow-500 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-3 text-gray-800">💡 FLEX Optimization Suggestions</h3>
              <div className="space-y-3">
                {recommendations.flex_swaps.map((swap, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-lg border border-yellow-300">
                    <p className="font-medium">
                      Consider swapping <span className="text-blue-600">{swap.player_in}</span> for{' '}
                      <span className="text-green-600">{swap.player_out}</span>
                    </p>
                    {swap.reason && <p className="text-sm text-gray-600 mt-1">{swap.reason}</p>}
                    {swap.point_gain && (
                      <p className="text-sm text-green-600 mt-1">
                        +{swap.point_gain.toFixed(1)} projected points
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
