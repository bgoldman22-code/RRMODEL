// src/NHLV2.jsx
// NHL SOG Props - Calibrated Policy V2
// BACKTEST VALIDATED: +29.55% ROI (Flat) | +32.19% ROI (Kelly)

import React, { useState, useEffect } from 'react';

export default function NHLV2() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'calibratedEdge', direction: 'desc' });
  const [bankroll, setBankroll] = useState(5000);
  
  const UNIT_SIZE = 20; // $20 per unit
  
  // Fetch opportunities on mount
  useEffect(() => {
    fetchPredictions();
  }, [bankroll]);
  
  const fetchPredictions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({ bankroll: bankroll.toString() });
      const response = await fetch(`/.netlify/functions/nhl-sog-calibrated-v2?${params}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 200));
        throw new Error('API returned non-JSON response (check function deployment)');
      }
      
      const result = await response.json();
      
      setOpportunities(result.opportunities || []);
      setMetadata(result.metadata || null);
      
    } catch (err) {
      setError(err.message);
      console.error('Error fetching NHL V2 opportunities:', err);
    } finally {
      setLoading(false);
      setScanning(false);
    }
  };
  
  const handleRefresh = () => {
    setScanning(true);
    fetchPredictions();
  };
  
  // Sort handler
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };
  
  // Sort opportunities
  const sortedOpportunities = React.useMemo(() => {
    const sorted = [...opportunities];
    sorted.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortConfig.key) {
        case 'calibratedEdge':
          aVal = parseFloat(a.calibratedEdge);
          bVal = parseFloat(b.calibratedEdge);
          break;
        case 'calibratedProb':
          aVal = parseFloat(a.calibratedProb);
          bVal = parseFloat(b.calibratedProb);
          break;
        case 'stake':
          aVal = parseFloat(a.stakeUnits);
          bVal = parseFloat(b.stakeUnits);
          break;
        default:
          return 0;
      }
      
      if (sortConfig.direction === 'asc') {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });
    
    return sorted;
  }, [opportunities, sortConfig]);
  
  const totalKellyStake = opportunities.reduce((sum, o) => sum + parseFloat(o.stakeDollars), 0);
  const totalUnits = opportunities.reduce((sum, o) => sum + parseFloat(o.stakeUnits), 0);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-purple-500/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                🏒 NHL SOG Props
                <span className="text-sm font-normal text-purple-400 bg-purple-500/20 px-3 py-1 rounded-full">
                  V2 Calibrated Policy 📊
                </span>
              </h1>
              <p className="text-gray-400 mt-1">
                Isotonic Calibration • Policy Filters • Kelly Sizing
              </p>
              <p className="text-green-400 text-sm mt-1 font-semibold">
                ✅ Backtest Validated: +29.55% ROI (Flat) | +32.19% ROI (Kelly) on 133 bets
              </p>
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={scanning}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-semibold transition flex items-center gap-2"
            >
              {scanning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Scanning...
                </>
              ) : (
                <>
                  🔄 Refresh
                </>
              )}
            </button>
          </div>
          
          {/* Settings */}
          <div className="mt-4 flex gap-6 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-gray-400 text-sm">Bankroll:</label>
              <input
                type="number"
                value={bankroll}
                onChange={(e) => setBankroll(parseInt(e.target.value) || 5000)}
                className="px-3 py-1 bg-slate-700 text-white rounded border border-purple-500/30 w-32"
                step="1000"
                min="1000"
              />
            </div>
          </div>
          
          {/* Metadata */}
          {metadata && (
            <div className="mt-4 flex gap-6 text-sm flex-wrap">
              <span className="text-gray-400">
                📅 Last scan: {new Date().toLocaleTimeString()}
              </span>
              <span className="text-purple-400 font-semibold">
                🎯 {opportunities.length} calibrated opportunities
              </span>
              <span className="text-green-400">
                💰 Total Kelly stake: {totalUnits.toFixed(1)}U (${totalKellyStake.toFixed(0)})
              </span>
              {metadata.candidatesGenerated && (
                <span className="text-yellow-400">
                  🔍 {metadata.candidatesGenerated} candidates → {metadata.filteredOpportunities} filtered
                </span>
              )}
              {metadata.avgCalibratedEdge && (
                <span className="text-blue-400">
                  📊 Avg Edge: +{metadata.avgCalibratedEdge}%
                </span>
              )}
            </div>
          )}
          
          {/* Validation Badge */}
          {metadata?.validation && (
            <div className="mt-3 inline-flex items-center gap-2 bg-green-500/20 border border-green-500/50 rounded-lg px-4 py-2">
              <span className="text-green-400 font-semibold text-sm">
                ✅ Historical Performance: {metadata.validation.backtestROI_kelly} ROI • 
                {' '}{metadata.validation.winRate} Win Rate • 
                {' '}{metadata.validation.historicalBets} Bets
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Loading State */}
      {loading && (
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400">Running calibrated policy filters...</p>
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
      {!loading && !error && sortedOpportunities.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <div className="bg-slate-800/50 rounded-xl border border-purple-500/30 backdrop-blur-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/80">
                  <tr className="text-left text-sm text-gray-400 border-b border-purple-500/30">
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">Matchup</th>
                    <th className="px-4 py-3 font-semibold">Market</th>
                    <th className="px-4 py-3 font-semibold">Line</th>
                    <th className="px-4 py-3 font-semibold">Odds</th>
                    <th className="px-4 py-3 font-semibold">Book</th>
                    <th className="px-4 py-3 font-semibold">Projection</th>
                    <th className="px-4 py-3 font-semibold">
                      <div className="flex flex-col">
                        <span>Raw Prob</span>
                        <span className="text-xs text-purple-400">→ Cal Prob</span>
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 font-semibold cursor-pointer hover:text-white transition"
                      onClick={() => handleSort('calibratedEdge')}
                    >
                      <div className="flex items-center gap-1">
                        Cal Edge
                        {sortConfig.key === 'calibratedEdge' && (
                          <span>{sortConfig.direction === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 font-semibold cursor-pointer hover:text-white transition"
                      onClick={() => handleSort('stake')}
                    >
                      <div className="flex items-center gap-1">
                        Kelly Stake
                        {sortConfig.key === 'stake' && (
                          <span>{sortConfig.direction === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 font-semibold">Policy Filters</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOpportunities.map((opp, index) => {
                    return (
                      <tr
                        key={index}
                        className="border-b border-slate-700/50 hover:bg-purple-500/10 transition text-white"
                      >
                        <td className="px-4 py-4 text-gray-400">#{index + 1}</td>
                        <td className="px-4 py-4 font-semibold">
                          {opp.playerName}
                          <div className="text-xs text-gray-500">{opp.position} - {opp.team}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-400">
                          {opp.team} @ {opp.opponent}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            opp.direction === 'OVER'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {opp.direction}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono text-sm">{opp.line}</td>
                        <td className="px-4 py-4 font-mono text-sm">
                          {opp.odds > 0 ? `+${opp.odds}` : opp.odds}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded text-xs font-medium">
                            {opp.bookmaker || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-semibold text-blue-400">
                          {opp.projection}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-gray-400 text-sm">{opp.rawModelProb}%</span>
                            <span className="text-purple-400 font-semibold text-sm">→ {opp.calibratedProb}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-green-400 font-bold">+{opp.calibratedEdge}%</span>
                          <div className="text-xs text-gray-500">
                            (raw: {opp.rawEdge})
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-right">
                            <div className="font-bold text-green-400 text-lg">
                              {opp.stakeUnits}U
                            </div>
                            <div className="text-xs text-gray-400">
                              ${opp.stakeDollars}
                            </div>
                            <div className="text-xs text-purple-400 font-mono">
                              Kelly: {opp.kelly}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-xs space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Disp:</span>
                              <span>{opp.policyFilters?.lineDispersion || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Books:</span>
                              <span className="text-gray-300">{opp.policyFilters?.oddsCount || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">TOI:</span>
                              <span className="text-gray-300">{opp.policyFilters?.L10_TOI || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Last:</span>
                              <span className="text-gray-300">{opp.policyFilters?.lastGameShots || 'N/A'} SOG</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Summary Footer */}
          <div className="mt-6 bg-slate-800/50 rounded-xl border border-purple-500/30 p-6">
            <h3 className="text-white font-bold text-lg mb-3">📊 Portfolio Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Total Opportunities</div>
                <div className="text-white font-bold text-2xl mt-1">{opportunities.length}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Total Units</div>
                <div className="text-green-400 font-bold text-2xl mt-1">{totalUnits.toFixed(1)}U</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Total Stake</div>
                <div className="text-green-400 font-bold text-2xl mt-1">${totalKellyStake.toFixed(0)}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Avg Edge</div>
                <div className="text-purple-400 font-bold text-2xl mt-1">
                  +{metadata?.avgCalibratedEdge || '0'}%
                </div>
              </div>
            </div>
            
            {/* Methodology Note */}
            <div className="mt-4 bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
              <h4 className="text-purple-300 font-semibold text-sm mb-2">🧪 Calibration Methodology</h4>
              <p className="text-gray-400 text-xs leading-relaxed">
                This system uses <strong className="text-white">Pool-Adjacent-Violators (PAV)</strong> isotonic regression 
                to calibrate raw model probabilities into actionable win rates. Separate calibration curves are fitted 
                for Overs and Unders. Policy filters enforce: (1) consensus market ban, (2) Unders with small edge or high TOI, 
                (3) strict Overs criteria. Kelly sizing uses ½ fractional Kelly for bankroll protection. 
                Validated on 8,598 historical bets with +29.55% ROI (Flat), +32.19% ROI (Kelly) on 133 filtered picks.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {!loading && !error && opportunities.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <div className="bg-slate-800/50 rounded-xl border border-purple-500/30 p-12">
            <p className="text-gray-400 text-lg">
              📭 No calibrated opportunities found
            </p>
            <p className="text-gray-500 mt-2">
              Either no NHL games today, or no bets passed policy filters
            </p>
            <div className="mt-4 text-sm text-gray-600">
              <p>Policy requires:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Real odds available (no consensus markets)</li>
                <li>Unders: Small edge (&lt;0.5) OR high TOI (≥18 min)</li>
                <li>Overs: Strict odds/books/shots criteria</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
