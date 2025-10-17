import React, { useState, useEffect } from 'react';

export default function NFLReceivingProps() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    propType: 'all',
    minEdge: 5,
    position: 'all',
    side: 'all'
  });

  useEffect(() => {
    fetchPredictions();
  }, []);

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/.netlify/functions/nfl-receiving-scanner-elite');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPredictions(data.predictions || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching predictions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter predictions
  const filteredPredictions = predictions.filter(pred => {
    if (filters.propType !== 'all' && pred.prop !== filters.propType) return false;
    if (filters.side !== 'all' && pred.side !== filters.side) return false;
    if (pred.edge < filters.minEdge / 100) return false;
    
    // Position filter would need position data from API
    return true;
  });

  // Sort by edge (highest first) and take top 35
  const topPredictions = filteredPredictions
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 35);

  const getEdgeColor = (edge) => {
    if (edge >= 0.10) return 'text-green-600 font-bold';
    if (edge >= 0.07) return 'text-green-500 font-semibold';
    if (edge >= 0.05) return 'text-blue-600';
    return 'text-gray-600';
  };

  const getEdgeBadgeColor = (edge) => {
    if (edge >= 0.10) return 'bg-green-100 text-green-800 border-green-300';
    if (edge >= 0.07) return 'bg-blue-100 text-blue-800 border-blue-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading predictions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-800 mb-2">⚠️ Error Loading Predictions</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <details className="mt-2 mb-4">
            <summary className="text-sm text-red-700 cursor-pointer">Debug Info</summary>
            <pre className="text-xs text-red-600 mt-2 overflow-auto">{JSON.stringify({ error, predictions }, null, 2)}</pre>
          </details>
          <button
            onClick={fetchPredictions}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">🏈 NFL Receiving Props</h1>
        <p className="text-gray-600">
          Top 35 receiving props with 5%+ edge • 3-stage cascade model • Updated daily
        </p>
      </div>

      {/* API Status Banner */}
      {predictions.length > 0 && predictions.some(p => !p.has_real_odds) && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Model Pricing Mode:</strong> Showing model predictions vs synthetic -110 odds. 
                Real odds API key may not be configured. Kelly staking disabled until real odds available.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Props</div>
          <div className="text-2xl font-bold">{predictions.length}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Real Odds</div>
          <div className="text-2xl font-bold text-blue-600">
            {predictions.filter(p => p.has_real_odds).length}
          </div>
          <div className="text-xs text-gray-500">
            Model: {predictions.filter(p => !p.has_real_odds).length}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Avg Edge</div>
          <div className="text-2xl font-bold text-green-600">
            {topPredictions.length > 0
              ? `${(topPredictions.reduce((sum, p) => sum + p.edge, 0) / topPredictions.length * 100).toFixed(1)}%`
              : 'N/A'}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Expected ROI</div>
          <div className="text-2xl font-bold text-green-600">
            {topPredictions.length > 0
              ? `+${(topPredictions.reduce((sum, p) => sum + p.edge, 0) / topPredictions.length * 100 * 0.7).toFixed(1)}%`
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Prop Type
            </label>
            <select
              value={filters.propType}
              onChange={(e) => setFilters({ ...filters, propType: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Props</option>
              <option value="receptions">Receptions</option>
              <option value="receiving_yards">Receiving Yards</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Side
            </label>
            <select
              value={filters.side}
              onChange={(e) => setFilters({ ...filters, side: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Over & Under</option>
              <option value="over">Over Only</option>
              <option value="under">Under Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Edge: {filters.minEdge}%
            </label>
            <input
              type="range"
              min="3"
              max="15"
              step="1"
              value={filters.minEdge}
              onChange={(e) => setFilters({ ...filters, minEdge: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchPredictions}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Predictions Table */}
      {topPredictions.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800 text-center mb-4">No predictions found matching your filters</p>
          <details className="text-sm text-yellow-900">
            <summary className="cursor-pointer font-medium">Debug Info</summary>
            <div className="mt-2 space-y-2">
              <p>Total predictions loaded: {predictions.length}</p>
              <p>After filters: {filteredPredictions.length}</p>
              <p>Current filters: {JSON.stringify(filters, null, 2)}</p>
              {predictions.length > 0 && (
                <pre className="text-xs overflow-auto mt-2 bg-white p-2 rounded">
                  {JSON.stringify(predictions.slice(0, 2), null, 2)}
                </pre>
              )}
            </div>
          </details>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Prop
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Line
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Side
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Edge
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model Prob
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Odds
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kelly %
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topPredictions.map((pred, idx) => {
                  // Use Kelly from the model (already calculated correctly)
                  const kellyPct = (pred.kelly * 100).toFixed(1);

                  return (
                    <tr key={idx} className={`hover:bg-gray-50 transition-colors ${
                      !pred.has_real_odds ? 'bg-yellow-50' : ''
                    }`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          #{idx + 1}
                          {!pred.has_real_odds && (
                            <span className="ml-1 text-xs text-yellow-600" title="Model pricing only">📊</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{pred.player}</div>
                        <div className="text-xs text-gray-500">{pred.team}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{pred.prop}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{pred.line}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${
                          pred.side === 'OVER'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {pred.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-sm font-semibold rounded border ${getEdgeBadgeColor(pred.edge)}`}>
                          +{(pred.edge * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{(pred.model_prob * 100).toFixed(1)}%</div>
                        <div className="text-xs text-gray-500">Fair: {(pred.market_prob_fair * 100).toFixed(1)}%</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {pred.offered_odds > 0 ? '+' : ''}{pred.offered_odds}
                        </div>
                        <div className={`text-xs ${pred.has_real_odds ? 'text-gray-500' : 'text-yellow-600'}`}>
                          {pred.book || 'Market'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className={`text-sm font-semibold ${
                          pred.has_real_odds ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                          {kellyPct}%
                          {!pred.has_real_odds && (
                            <div className="text-xs text-gray-500">N/A</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
