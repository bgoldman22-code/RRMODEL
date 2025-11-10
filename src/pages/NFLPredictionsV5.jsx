// src/pages/NFLPredictionsV5.jsx
/**
 * NFL V5 Predictions Page with On-Demand Refresh
 * 
 * Features:
 * - Fast initial load from cached Blob storage
 * - "Refresh Now" button for on-demand fresh predictions
 * - Shows data source (cached vs fresh) and last update time
 * - Hybrid model: Poisson EPA V3 (spreads) + Quantile Blend V5 (totals)
 */

import { useState, useEffect } from 'react';

export default function NFLPredictionsV5() {
  const [predictions, setPredictions] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [dataSource, setDataSource] = useState('cached');

  // Load cached predictions on mount
  useEffect(() => {
    loadCached();
  }, []);

  /**
   * Load predictions from cached Blob storage (fast)
   */
  async function loadCached() {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/.netlify/functions/nfl-v5-latest');
      
      if (!res.ok) {
        throw new Error(`Failed to load predictions: ${res.status}`);
      }
      
      const data = await res.json();
      setPredictions(data.rows || []);
      setMeta(data.meta || {});
      setDataSource('cached');
      setLastRefresh(data.meta?.updated_at);
      
    } catch (err) {
      console.error('Error loading cached predictions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Refresh predictions with fresh odds, injuries, etc. (slower)
   */
  async function refreshNow() {
    setRefreshing(true);
    setError(null);
    
    try {
      const res = await fetch('/.netlify/functions/nfl-v5-refresh-now', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (!res.ok) {
        throw new Error(`Refresh failed: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.ok) {
        setPredictions(data.rows || []);
        setMeta(data.meta || {});
        setDataSource('fresh');
        setLastRefresh(data.refresh_metadata?.refreshed_at);
      } else {
        throw new Error(data.error || 'Refresh failed');
      }
      
    } catch (err) {
      console.error('Error refreshing predictions:', err);
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * Format timestamp for display
   */
  function formatTimestamp(iso) {
    if (!iso) return 'Unknown';
    const date = new Date(iso);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  /**
   * Render loading state
   */
  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading predictions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NFL V5 Predictions</h1>
          {meta && (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-gray-600">
                Week {meta.week}, {meta.season} • {meta.games_count} games
              </p>
              <div className="flex items-center gap-4 text-xs">
                <span className={`px-2 py-1 rounded font-medium ${
                  dataSource === 'fresh' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {dataSource === 'fresh' ? '🔴 Live Data' : '📦 Cached'}
                </span>
                <span className="text-gray-500">
                  Last updated: {formatTimestamp(lastRefresh)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={refreshNow}
          disabled={refreshing}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            refreshing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-black text-white hover:bg-gray-800'
          }`}
        >
          {refreshing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Refreshing...
            </span>
          ) : (
            '🔄 Refresh Now'
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Model Info */}
      {meta?.models && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Hybrid Model System</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-blue-800">Spreads: {meta.models.spread.name}</p>
              <p className="text-blue-700">{meta.models.spread.description}</p>
              <p className="text-xs text-blue-600 mt-1">
                Backtested ROI: {meta.models.spread.backtested_roi} | Min Edge: {meta.models.spread.min_edge}
              </p>
            </div>
            <div>
              <p className="font-medium text-blue-800">Totals: {meta.models.total.name}</p>
              <p className="text-blue-700">{meta.models.total.description}</p>
              <p className="text-xs text-blue-600 mt-1">
                Backtested ROI: {meta.models.total.backtested_roi} | Min Edge: {meta.models.total.min_edge}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Predictions Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Game
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Kickoff
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Spread Pick
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Pick
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Moneyline
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Best Edge
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {predictions.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                  No predictions available. Try refreshing.
                </td>
              </tr>
            ) : (
              predictions.map((pred, idx) => {
                const spread = pred.spread || {};
                const total = pred.total || {};
                const moneyline = pred.moneyline || {};
                
                // Find best edge across all markets
                const edges = [spread.edge, total.edge, moneyline.edge].filter(e => e > 0);
                const bestEdge = edges.length > 0 ? Math.max(...edges) : 0;
                
                return (
                  <tr key={pred.game_id || idx} className="hover:bg-gray-50">
                    {/* Matchup */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {pred.matchup}
                      </div>
                      <div className="text-xs text-gray-500">
                        {pred.away_team} @ {pred.home_team}
                      </div>
                    </td>

                    {/* Kickoff */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {pred.kickoff ? new Date(pred.kickoff).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      }) : '—'}
                    </td>

                    {/* Spread */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {spread.pick ? (
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">
                            {spread.pick} {spread.line > 0 ? '+' : ''}{spread.line}
                          </div>
                          <div className="text-xs text-gray-500">
                            Edge: {spread.edge?.toFixed(1)}% | Units: {spread.recommended_units?.toFixed(1)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {total.pick ? (
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">
                            {total.pick} {total.line}
                          </div>
                          <div className="text-xs text-gray-500">
                            Edge: {total.edge?.toFixed(1)}% | Units: {total.recommended_units?.toFixed(1)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>

                    {/* Moneyline */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {moneyline.pick ? (
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">
                            {moneyline.pick}
                          </div>
                          <div className="text-xs text-gray-500">
                            Edge: {moneyline.edge?.toFixed(1)}% | Units: {moneyline.recommended_units?.toFixed(1)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>

                    {/* Best Edge */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        bestEdge >= 10
                          ? 'bg-green-100 text-green-800'
                          : bestEdge >= 5
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {bestEdge > 0 ? `${bestEdge.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Data Sources Info */}
      {meta?.data_sources && (
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Data Sources</h3>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <dt className="text-gray-500">Odds</dt>
              <dd className="font-medium text-gray-900">{meta.data_sources.odds}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Injuries</dt>
              <dd className="font-medium text-gray-900">{meta.data_sources.injuries}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Weather</dt>
              <dd className="font-medium text-gray-900">{meta.data_sources.weather}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Metrics</dt>
              <dd className="font-medium text-gray-900">{meta.data_sources.metrics}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
