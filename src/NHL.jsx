// src/NHL.jsx
// Elite NHL SOG Props Interface - Professional Sharp Betting Tool

import React, { useState, useEffect } from 'react';

export default function NHL() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  
  // User settings
  const [settings, setSettings] = useState({
    minEdge: 5,
    minConfidence: 60,
    bankroll: 10000,
    kellyFraction: 0.25
  });
  
  const [summary, setSummary] = useState(null);
  const [metadata, setMetadata] = useState(null);
  
  // Fetch opportunities on mount and when settings change
  useEffect(() => {
    fetchOpportunities();
  }, []);
  
  const fetchOpportunities = async () => {
    setLoading(true);
    setError(null);
    setScanning(true);
    
    try {
      const params = new URLSearchParams({
        minEdge: settings.minEdge,
        minConfidence: settings.minConfidence,
        bankroll: settings.bankroll,
        kellyFraction: settings.kellyFraction
      });
      
      const response = await fetch(`/api/nhl-sog-scanner?${params}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }
      
      setOpportunities(result.data.topOpportunities || []);
      setSummary(result.data.summary || null);
      setMetadata(result.data.metadata || null);
      
    } catch (err) {
      setError(err.message);
      console.error('Error fetching NHL opportunities:', err);
    } finally {
      setLoading(false);
      setScanning(false);
    }
  };
  
  const handleRefresh = () => {
    fetchOpportunities();
  };
  
  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: parseFloat(value)
    }));
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-blue-500/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                🏒 NHL SOG Props
                <span className="text-sm font-normal text-blue-400 bg-blue-500/20 px-3 py-1 rounded-full">
                  Elite Sharp Model v1.0
                </span>
              </h1>
              <p className="text-gray-400 mt-1">
                Advanced Bayesian projections • Edge detection • Kelly staking
              </p>
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={scanning}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-semibold transition flex items-center gap-2"
            >
              {scanning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Scanning...
                </>
              ) : (
                <>
                  🔄 Refresh Scan
                </>
              )}
            </button>
          </div>
          
          {/* Metadata */}
          {metadata && (
            <div className="mt-4 flex gap-6 text-sm text-gray-400">
              <span>📅 {metadata.scannedAt ? new Date(metadata.scannedAt).toLocaleString() : 'N/A'}</span>
              <span>🎯 {opportunities.length} opportunities found</span>
              {summary && (
                <>
                  <span>📊 Avg Edge: {summary.avgEdge}%</span>
                  <span>💰 Avg EV: {summary.avgEV}%</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Settings Panel */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-blue-500/30 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white mb-4">⚙️ Scanner Settings</h2>
          
          <div className="grid grid-cols-4 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Min Edge %
              </label>
              <input
                type="number"
                value={settings.minEdge}
                onChange={(e) => handleSettingChange('minEdge', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg border border-blue-500/30 focus:border-blue-500 focus:outline-none"
                step="0.5"
                min="0"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Min Confidence
              </label>
              <input
                type="number"
                value={settings.minConfidence}
                onChange={(e) => handleSettingChange('minConfidence', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg border border-blue-500/30 focus:border-blue-500 focus:outline-none"
                step="5"
                min="0"
                max="100"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Bankroll ($)
              </label>
              <input
                type="number"
                value={settings.bankroll}
                onChange={(e) => handleSettingChange('bankroll', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg border border-blue-500/30 focus:border-blue-500 focus:outline-none"
                step="1000"
                min="100"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Kelly Fraction
              </label>
              <input
                type="number"
                value={settings.kellyFraction}
                onChange={(e) => handleSettingChange('kellyFraction', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg border border-blue-500/30 focus:border-blue-500 focus:outline-none"
                step="0.05"
                min="0.1"
                max="1"
              />
            </div>
          </div>
          
          <button
            onClick={handleRefresh}
            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
          >
            Apply Settings & Rescan
          </button>
        </div>
      </div>
      
      {/* Loading State */}
      {loading && (
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400">Scanning NHL slate for edges...</p>
        </div>
      )}
      
      {/* Error State */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 text-center">
            <p className="text-red-400 font-semibold">❌ Error: {error}</p>
          </div>
        </div>
      )}
      
      {/* Opportunities Table */}
      {!loading && !error && opportunities.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <div className="bg-slate-800/50 rounded-xl border border-blue-500/30 backdrop-blur-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/80">
                  <tr className="text-left text-sm text-gray-400 border-b border-blue-500/30">
                    <th className="px-4 py-3 font-semibold">Rank</th>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">Matchup</th>
                    <th className="px-4 py-3 font-semibold">Market</th>
                    <th className="px-4 py-3 font-semibold">Book</th>
                    <th className="px-4 py-3 font-semibold">Odds</th>
                    <th className="px-4 py-3 font-semibold">Projection</th>
                    <th className="px-4 py-3 font-semibold">Edge</th>
                    <th className="px-4 py-3 font-semibold">EV</th>
                    <th className="px-4 py-3 font-semibold">Confidence</th>
                    <th className="px-4 py-3 font-semibold">Stake</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opp, index) => (
                    <tr
                      key={index}
                      className="border-b border-slate-700/50 hover:bg-blue-500/10 transition text-white"
                    >
                      <td className="px-4 py-4 text-gray-400">#{index + 1}</td>
                      <td className="px-4 py-4 font-semibold">{opp.player}</td>
                      <td className="px-4 py-4 text-sm text-gray-400">
                        {opp.team} vs {opp.opponent}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          opp.bet.startsWith('Over')
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {opp.bet}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-400">{opp.book}</td>
                      <td className="px-4 py-4 font-mono text-sm">
                        {opp.odds > 0 ? `+${opp.odds}` : opp.odds}
                      </td>
                      <td className="px-4 py-4 font-semibold">{opp.projectedSOG}</td>
                      <td className="px-4 py-4">
                        <span className="text-green-400 font-bold">+{opp.edge}%</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-blue-400 font-bold">+{opp.ev}%</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${opp.confidence}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-400">{opp.confidence}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-right">
                          <div className="font-bold text-green-400">
                            ${opp.staking?.recommendedStake || 0}
                          </div>
                          <div className="text-xs text-gray-500">
                            ({opp.staking?.fractionalKellyPct || 0}% bankroll)
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {!loading && !error && opportunities.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <div className="bg-slate-800/50 rounded-xl border border-blue-500/30 p-12">
            <p className="text-gray-400 text-lg">
              No opportunities found with current settings.
            </p>
            <p className="text-gray-500 mt-2">
              Try lowering the minimum edge or confidence thresholds.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
