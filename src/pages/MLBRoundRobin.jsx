import React, { useState, useEffect, useRef } from 'react';
import { exportToPNG } from '../lib/exportUtils';

export default function MLBRoundRobin() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const exportRef = useRef(null);

  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      const filename = `mlb-hr-round-robin-${data?.date || new Date().toISOString().split('T')[0]}`;
      await exportToPNG(exportRef.current, filename, { scale: 3, width: 900, windowWidth: 900 });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    }
  };

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
        <div className="flex items-center gap-2">
          {(topByEV.length > 0 || topByProb.length > 0) && (
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              📸 Export PNG
            </button>
          )}
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

      {/* Hidden Export Container */}
      {(topByEV.length > 0 || topByProb.length > 0) && (
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
          <div ref={exportRef} style={{ width: '900px', backgroundColor: '#ffffff', padding: '24px', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '26px', fontWeight: 'bold', margin: 0 }}>⚾ MLB HR Round Robin</h2>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
                {data?.date || new Date().toLocaleDateString()} | {meta.gamesCount} Games | {meta.oddsAvailable ? 'Live Odds' : 'Model Odds'} | {topByEV.length} EV Picks
              </p>
            </div>

            {/* Recommended Structures */}
            {recommendations.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>📊 Recommended Structures</div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {recommendations.map((rec, idx) => (
                    <div key={idx} style={{ flex: 1, padding: '10px', border: rec.recommended ? '2px solid #22c55e' : '1px solid #d1d5db', borderRadius: '8px', backgroundColor: rec.recommended ? '#f0fdf4' : '#fff' }}>
                      <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{rec.structure}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{rec.parlays} parlays</div>
                      {rec.roi && <div style={{ fontSize: '14px', color: '#059669', fontWeight: '600', marginTop: '4px' }}>{rec.roi} ROI</div>}
                      {rec.recommended && <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold', marginTop: '4px' }}>⭐ RECOMMENDED</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top by Probability */}
            {topByProb.length > 0 && (
              <>
                <div style={{ marginBottom: '8px', fontSize: '15px', fontWeight: '600' }}>🎯 Top 10 by Probability</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#eff6ff' }}>
                      <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #bfdbfe' }}>Player</th>
                      <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #bfdbfe' }}>Matchup</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #bfdbfe' }}>Probability</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #bfdbfe' }}>Odds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topByProb.map((pick, idx) => (
                      <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f0f9ff', borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px', fontWeight: '500' }}>{pick.player}</td>
                        <td style={{ padding: '8px' }}>{pick.team} vs {pick.opponent}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#2563eb', fontWeight: 'bold' }}>{(pick.probability * 100).toFixed(1)}%</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{pick.odds > 0 ? '+' : ''}{pick.odds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Top by EV */}
            {topByEV.length > 0 && (
              <>
                <div style={{ marginBottom: '8px', fontSize: '15px', fontWeight: '600' }}>💰 Top 20 by Expected Value</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#ecfdf5' }}>
                      <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #a7f3d0' }}>Player</th>
                      <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #a7f3d0' }}>Matchup</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #a7f3d0' }}>EV</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #a7f3d0' }}>Probability</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #a7f3d0' }}>Odds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topByEV.map((pick, idx) => (
                      <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f0fdf4', borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px', fontWeight: '500' }}>{pick.player}</td>
                        <td style={{ padding: '8px' }}>{pick.team} vs {pick.opponent}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#059669', fontWeight: 'bold' }}>+{(pick.ev * 100).toFixed(1)}%</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{(pick.probability * 100).toFixed(1)}%</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{pick.odds > 0 ? '+' : ''}{pick.odds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div style={{ fontSize: '11px', color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
              bgroundrobin.com | Model: 6-Factor Probability • Park Factors • Hot/Cold Streaks • Pitcher Matchups
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
