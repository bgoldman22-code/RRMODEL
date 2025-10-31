import React, { useState, useEffect } from 'react';

/**
 * NBA Player Props - Rebounds & Assists
 * 
 * PROVEN PROFITABLE MODELS:
 * - Rebounds: 62.5% win rate, +19.32% ROI (Baseline v2)
 * - Assists: 66.7% win rate, +27.27% ROI (Baseline v2)
 * 
 * Points model excluded (not profitable yet - 51.2% win rate insufficient)
 */

export default function NBAPlayerProps() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'rebounds', 'assists'
  const [sortBy, setSortBy] = useState('edge'); // 'edge', 'confidence', 'player'

  // Load predictions on mount
  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      
      // Fetch live predictions from Netlify function
      const response = await fetch('/.netlify/functions/generate-daily-predictions');
      
      if (!response.ok) {
        console.warn('Live predictions not available, trying static fallback...');
        // Fallback to static JSON if function fails
        const fallback = await fetch('/data/nba-player-props-live.json');
        if (fallback.ok) {
          const data = await fallback.json();
          setPredictions(data.predictions || []);
        } else {
          setPredictions([]);
        }
        return;
      }
      
      const data = await response.json();
      setPredictions(data.predictions || []);
      
    } catch (error) {
      console.error('Error loading predictions:', error);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort predictions
  const filteredPredictions = predictions
    .filter(p => filter === 'all' || p.propType === filter)
    .sort((a, b) => {
      if (sortBy === 'edge') return Math.abs(b.edge) - Math.abs(a.edge);
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'player') return a.player.localeCompare(b.player);
      return 0;
    });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">🏀 NBA Player Props</h1>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-green-600">Rebounds:</span>
            <span>62.5% win | +19.3% ROI</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-green-600">Assists:</span>
            <span>66.7% win | +27.3% ROI</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Proven profitable models using baseline v2 with contextual adjustments.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="text-sm font-medium text-gray-700 mr-2">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="all">All Props</option>
              <option value="rebounds">Rebounds Only</option>
              <option value="assists">Assists Only</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-700 mr-2">Sort By:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="edge">Edge (Highest First)</option>
              <option value="confidence">Confidence</option>
              <option value="player">Player Name</option>
            </select>
          </div>

          <button
            onClick={loadPredictions}
            className="ml-auto bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 transition text-sm font-medium"
          >
            Refresh Predictions
          </button>
        </div>
      </div>

      {/* Predictions Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Loading predictions...</p>
        </div>
      ) : filteredPredictions.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-600">No predictions meet betting thresholds today.</p>
          <p className="text-sm text-gray-500 mt-2">Edge threshold: 4+ points | Confidence: 60%+</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matchup</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prop</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prediction</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Line</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Edge</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPredictions.map((pred, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{pred.player}</div>
                    <div className="text-sm text-gray-500">{pred.team}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    vs {pred.opponent}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      pred.propType === 'rebounds' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {pred.propType.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {pred.prediction}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {pred.vegasLine}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded ${
                      pred.betSide === 'OVER' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {pred.betSide} {pred.vegasOdds}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    {pred.edge}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${pred.confidence}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-900">{pred.confidence}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Model Info Footer */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <h3 className="font-semibold mb-2">Model Information</h3>
        <ul className="space-y-1">
          <li>• <strong>Rebounds Model:</strong> Baseline v2 with trend, minutes, home, rest, opponent adjustments</li>
          <li>• <strong>Assists Model:</strong> Baseline v2 with trend, minutes, home, rest adjustments</li>
          <li>• <strong>Betting Thresholds:</strong> 4+ point edge, 60%+ confidence, 1%+ Kelly fraction</li>
          <li>• <strong>Backtest Results:</strong> Feb 2025 test window (277 samples, zero data leakage)</li>
          <li>• <strong>Status:</strong> ✅ Production-ready | Points model in development (51.2% win rate)</li>
        </ul>
      </div>
    </div>
  );
}
