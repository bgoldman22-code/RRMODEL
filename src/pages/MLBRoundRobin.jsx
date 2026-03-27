import React, { useState, useEffect } from 'react';

export default function MLBRoundRobin() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPredictions();
  }, []);

  async function loadPredictions() {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/.netlify/functions/mlb-rr-generate');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error loading predictions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadPredictions();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading predictions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">⚠️ Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">No data available</p>
        </div>
      </div>
    );
  }

  if (data.offseason) {
    return (
      <div className="p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <div className="text-6xl mb-4">⚾</div>
          <h2 className="text-2xl font-bold text-blue-900 mb-2">MLB Offseason</h2>
          <p className="text-blue-700 mb-4">{data.message}</p>
          <p className="text-sm text-blue-600">
            Opening Day 2026: {data.meta.openingDay}
          </p>
        </div>
      </div>
    );
  }

  const { topByProb = [], topByEV = [], recommendations = [], meta = {} } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">MLB HR Round Robin</h1>
          <p className="text-gray-600 mt-1">
            {data.date} • {meta.gamesCount} games • 
            {meta.oddsAvailable ? ` ✅ Live odds (${meta.oddsPlayerCount || 0} players)` : ' ⚠️ Model odds (no live HR lines yet)'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            refreshing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {refreshing ? '⟳ Refreshing...' : '🔄 Refresh Odds'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Top Candidates</p>
              <p className="text-3xl font-bold mt-1">{topByEV.length}</p>
              <p className="text-xs mt-2">Positive EV plays</p>
            </div>
            <div className="text-4xl opacity-50">⚾</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Best Structure</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">
                {recommendations[0]?.legs || '—'}-Pick
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {recommendations[0]?.description || 'Calculating...'}
              </p>
            </div>
            <div className="text-4xl text-yellow-600 opacity-50">🏆</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Expected ROI</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {recommendations[0]?.roi || '+0%'}
              </p>
              <p className="text-xs text-gray-500 mt-2">Backtested ROI</p>
            </div>
            <div className="text-4xl text-green-600 opacity-50">📈</div>
          </div>
        </div>
      </div>

      {/* Round Robin Recommendations */}
      {recommendations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📊 Recommended Structures</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendations.map((rec, idx) => (
              <div
                key={idx}
                className={`border-2 rounded-lg p-4 ${
                  rec.recommended
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {rec.recommended && (
                  <div className="text-green-600 text-xs font-bold mb-2">
                    ⭐ RECOMMENDED
                  </div>
                )}
                <div className="text-2xl font-bold text-gray-800">{rec.structure}</div>
                <div className="text-sm text-gray-600 mt-1">{rec.parlays} parlays</div>
                {rec.roi && (
                  <div className="text-lg font-semibold text-green-600 mt-2">{rec.roi} ROI</div>
                )}
                <div className="text-xs text-gray-500 mt-2">{rec.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 10 by Probability */}
      {topByProb.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">🎯 Top 10 by Probability</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Player</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Matchup</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">Probability</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">Odds</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {topByProb.map((pick, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{pick.player}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pick.team} vs {pick.opponent}
                      <div className="text-xs text-gray-500">{pick.venue}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-blue-600">
                        {(pick.probability * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-sm">
                      {pick.odds > 0 ? '+' : ''}{pick.odds}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{pick.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top 20 by EV */}
      {topByEV.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">💰 Top 20 by Expected Value</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-green-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Player</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Matchup</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">EV</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">Probability</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">Odds</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {topByEV.map((pick, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{pick.player}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pick.team} vs {pick.opponent}
                      <div className="text-xs text-gray-500">vs {pick.starter}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-green-600">
                        +{(pick.ev * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {(pick.probability * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-sm">
                      {pick.odds > 0 ? '+' : ''}{pick.odds}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{pick.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topByEV.length === 0 && topByProb.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-gray-600">No picks available for today</p>
          <p className="text-sm text-gray-500 mt-2">
            Check back during the MLB season (April-October)
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
        <p>Generated at {new Date(meta.generatedAt).toLocaleString()}</p>
        <p className="mt-1">
          Model: 6-Factor Probability • Park Factors • Hot/Cold Streaks • Pitcher Matchups
        </p>
      </div>
    </div>
  );
}
