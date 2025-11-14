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

// Auto-detect current NFL week
function getCurrentNFLWeek() {
  const now = new Date();
  const year = now.getFullYear();
  
  // NFL season typically starts first week of September
  // Week 1 usually starts around Sept 5-10
  const seasonStart = new Date(year, 8, 5); // Sept 5
  
  if (now < seasonStart) {
    // Before season starts, default to Week 1
    return 1;
  }
  
  const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
  const week = Math.floor(daysSinceStart / 7) + 1;
  
  // Cap at Week 18 (regular season)
  return Math.min(Math.max(week, 1), 18);
}

export default function NFLPredictionsV5() {
  const [predictions, setPredictions] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [dataSource, setDataSource] = useState('cached');
  const [selectedWeek, setSelectedWeek] = useState(getCurrentNFLWeek()); // Auto-detect current week

  // Load cached predictions on mount and when week changes
  useEffect(() => {
    loadCached();
  }, [selectedWeek]);

    /**
   * Load predictions from Live V5 endpoint (auto-cached for 15min)
   */
  async function loadCached() {
    try {
      setLoading(true);
      setError(null);
      
      const season = 2025;
      const targetWeek = selectedWeek;
      
      console.log(`Loading V5 predictions for ${season} Week ${targetWeek}...`);
      
      // Fetch from LIVE V5 endpoint (pulls fresh NFLverse data, cached 15min)
      const url = `/.netlify/functions/nfl-v5-live?season=${season}&week=${targetWeek}`;
      console.log('Fetching:', url);
      
      const res = await fetch(url);
      
      console.log('Response status:', res.status);
      console.log('Response headers:', [...res.headers.entries()]);
      
      if (!res.ok) {
        // Try to get error details
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await res.json();
          throw new Error(errorData.message || `API error: ${res.status}`);
        } else {
          const text = await res.text();
          console.error('Non-JSON response:', text.substring(0, 200));
          throw new Error(`API returned HTML instead of JSON. Function may not be deployed yet. Status: ${res.status}`);
        }
      }
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Response is not JSON:', text.substring(0, 200));
        throw new Error('API returned HTML instead of JSON. The nfl-v5-live function may not be deployed yet.');
      }
      
      const data = await res.json();
      console.log('Received data:', { 
        games: data.games?.length, 
        cached: data.cached, 
        generation_time_ms: data.generation_time_ms 
      });
      
      // Data is already in the right format from nfl-v5-live
      const games = data.games || [];
      
      if (games.length === 0) {
        throw new Error(`No games found for ${season} Week ${targetWeek}. This week may not have any scheduled games yet.`);
      }
      
      setPredictions(games);
      setMeta({
        model_version: data.model_version || "V5-Live",
        season: data.season,
        week: data.week,
        updated_at: data.generated_at,
        generated_at: data.generated_at,
        games_count: data.games_count || games.length,
        generation_time_ms: data.generation_time_ms,
        cached: data.cached || false,
        cache_age_seconds: data.cache_age_seconds || 0,
        models: {
          spread: {
            name: "V5 Multi-Feature EPA",
            description: "OLS regression on EPA, success, explosive differentials",
            backtested_mae: "10.62 pts",
            training_window: "2020-2024 (1349 games)"
          },
          total: {
            name: "V5 Ridge Regression (λ=500)",
            description: "Ridge with epa_def_sum zero-weighted",
            backtested_mae: "10.84 pts",
            training_window: "2020-2024 (1349 games)"
          }
        },
        data_sources: {
          aggregates: `NFLverse ${data.season}`,
          schedule: `NFLverse ${data.season}`,
          rolling_window: "16 games",
          cutoff_week: `Week ${data.week - 1}`
        }
      });
      setDataSource(data.cached ? `cached (${Math.floor(data.cache_age_seconds / 60)}min old)` : 'live (fresh)');
      setLastRefresh(data.generated_at);
      
    } catch (err) {
      console.error('Error loading cached predictions:', err);
      setError(err.message);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Force refresh predictions (bypass cache)
   */
  async function refreshNow(weekOverride = null) {
    setRefreshing(true);
    setError(null);
    
    try {
      const targetWeek = weekOverride || selectedWeek;
      const season = 2025;
      
      // Call LIVE endpoint with force=true to bypass cache
      const res = await fetch(`/.netlify/functions/nfl-v5-live?season=${season}&week=${targetWeek}&force=true`);
      
      if (!res.ok) {
        if (res.status === 400) {
          throw new Error('Invalid week or season parameter');
        }
        throw new Error(`Prediction generation failed: ${res.status}`);
      }
      
      const data = await res.json();
      const games = data.games || [];
      
      // Update UI with fresh predictions
      setPredictions(games);
      setMeta({
        model_version: data.model_version || "V5-Live",
        season: data.season,
        week: data.week,
        updated_at: data.generated_at,
        generated_at: data.generated_at,
        games_count: data.games_count || games.length,
        generation_time_ms: data.generation_time_ms,
        cached: false,
        cache_age_seconds: 0,
        models: {
          spread: {
            name: "V5 Multi-Feature EPA",
            description: "OLS regression on EPA, success, explosive differentials",
            backtested_mae: "10.62 pts",
            training_window: "2020-2024 (1349 games)"
          },
          total: {
            name: "V5 Ridge Regression (λ=500)",
            description: "Ridge with epa_def_sum zero-weighted",
            backtested_mae: "10.84 pts",
            training_window: "2020-2024 (1349 games)"
          }
        },
        data_sources: {
          aggregates: `NFLverse ${data.season}`,
          schedule: `NFLverse ${data.season}`,
          rolling_window: "16 games",
          cutoff_week: `Week ${data.week - 1}`
        }
      });
      setDataSource('live (fresh)');
      setLastRefresh(data.generated_at);
      
      alert(`✅ Fresh predictions generated in ${data.generation_time_ms}ms!`);
      
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
   * Export predictions to PNG
   */
  const exportToPNG = async () => {
    try {
      setExporting(true);
      
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      // Create export container
      const exportDiv = document.createElement('div');
      exportDiv.style.cssText = 'position:fixed;left:-9999px;top:0;background:white;padding:40px;width:1400px;';
      
      const week = meta?.week || selectedWeek;
      
      // Build table HTML
      let tableHTML = `
        <div style="font-size:32px;font-weight:bold;text-align:center;margin-bottom:30px;color:#000;">
          ■ NFL Week ${week} V5 Model Predictions — Full Slate
        </div>
        <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
          <thead style="background:#1e3a5f;color:white;">
            <tr>
              <th style="padding:12px 10px;text-align:left;font-weight:bold;border:1px solid #2c4a6f;">Matchup</th>
              <th style="padding:12px 10px;text-align:left;font-weight:bold;border:1px solid #2c4a6f;">Spread Pick</th>
              <th style="padding:12px 10px;text-align:left;font-weight:bold;border:1px solid #2c4a6f;">Total Pick</th>
              <th style="padding:12px 10px;text-align:left;font-weight:bold;border:1px solid #2c4a6f;">Moneyline</th>
              <th style="padding:12px 10px;text-align:center;font-weight:bold;border:1px solid #2c4a6f;">Best Edge</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      predictions.forEach((pred, idx) => {
        const spread = pred.spread || {};
        const total = pred.total || {};
        const moneyline = pred.moneyline || {};
        
        // Find best edge
        const edges = [spread.edge, total.edge, moneyline.edge].filter(e => e > 0);
        const bestEdge = edges.length > 0 ? Math.max(...edges) : 0;
        
        // Format picks
        const spreadText = spread.pick 
          ? `${spread.pick} ${spread.line > 0 ? '+' : ''}${spread.line} (${spread.recommended_units?.toFixed(1)}U, ${spread.edge?.toFixed(1)}%)`
          : 'NO BET';
        
        const totalText = total.pick
          ? `${total.pick} ${total.line} (${total.recommended_units?.toFixed(1)}U, ${total.edge?.toFixed(1)}%)`
          : 'NO BET';
        
        const mlText = moneyline.pick
          ? `${moneyline.pick} ML (${moneyline.recommended_units?.toFixed(1)}U, ${moneyline.edge?.toFixed(1)}%)`
          : 'NO BET';
        
        const rowStyle = idx % 2 === 0 ? 'background:white;' : 'background:#f8f9fa;';
        tableHTML += `
          <tr style="${rowStyle}">
            <td style="padding:10px;border:1px solid #ccc;font-weight:600;">${pred.matchup}</td>
            <td style="padding:10px;border:1px solid #ccc;">${spreadText}</td>
            <td style="padding:10px;border:1px solid #ccc;">${totalText}</td>
            <td style="padding:10px;border:1px solid #ccc;">${mlText}</td>
            <td style="padding:10px;border:1px solid #ccc;text-align:center;font-weight:bold;">${bestEdge > 0 ? bestEdge.toFixed(1) + '%' : '—'}</td>
          </tr>
        `;
      });
      
      tableHTML += `
          </tbody>
        </table>
        <div style="margin-top:30px;font-size:12px;color:#666;text-align:center;">
          Hybrid Model: Poisson EPA V3 (Spreads) + Quantile Blend V5 (Totals) • Generated: ${formatTimestamp(lastRefresh)}
        </div>
      `;
      
      exportDiv.innerHTML = tableHTML;
      document.body.appendChild(exportDiv);
      
      // Capture
      const canvas = await html2canvas(exportDiv, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        width: 1400,
        windowWidth: 1400
      });
      
      // Download
      const link = document.createElement('a');
      link.download = `nfl-v5-week${week}-predictions.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      // Cleanup
      document.body.removeChild(exportDiv);
      
    } catch (err) {
      console.error('Error exporting PNG:', err);
      alert('Failed to export PNG: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

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

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Week Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Week:</label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>

          {/* Export PNG Button */}
          <button
            onClick={exportToPNG}
            disabled={exporting || predictions.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              exporting || predictions.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {exporting ? '⟳ Exporting...' : '📸 Export PNG'}
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => refreshNow()}
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
                Refreshing Week {selectedWeek}...
              </span>
            ) : (
              `🔄 Refresh Week ${selectedWeek}`
            )}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 font-medium">⚠️ {error}</p>
          {predictions.length === 0 && (
            <p className="text-yellow-700 text-sm mt-2">
              Try selecting Week {meta?.week || 10} (current) or click "Refresh Now" to generate predictions for this week.
            </p>
          )}
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
