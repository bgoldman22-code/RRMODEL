// src/NHL.jsx
// Elite NHL SOG Props Interface - Professional Sharp Betting Tool v3.0

import React, { useState, useEffect } from 'react';

export default function NHL() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'edge', direction: 'desc' });
  
  // Fixed settings for v3.0 (no user customization)
  const BANKROLL = 5000;
  const UNIT_SIZE = 20; // $20 per unit
  
  // Fetch opportunities on mount
  useEffect(() => {
    fetchOpportunities();
  }, []);
  
  const fetchOpportunities = async () => {
    setLoading(true);
    setError(null);
    setScanning(true);
    
    try {
      // TEMPORARY: Use simple diagnostic endpoint to debug 502 errors
      // TODO: Switch back to nhl-sog-scanner-v3 once issues resolved
      const response = await fetch(`/.netlify/functions/nhl-sog-scanner-simple`);
      
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
      console.error('Error fetching NHL opportunities:', err);
    } finally {
      setLoading(false);
      setScanning(false);
    }
  };
  
  const handleRefresh = () => {
    fetchOpportunities();
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
        case 'edge':
          aVal = a.edge;
          bVal = b.edge;
          break;
        case 'confidence':
          aVal = a.confidence;
          bVal = b.confidence;
          break;
        case 'stake':
          aVal = a.kelly * BANKROLL;
          bVal = b.kelly * BANKROLL;
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
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-blue-500/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                🏒 NHL SOG Props
                <span className="text-sm font-normal text-yellow-400 bg-yellow-500/20 px-3 py-1 rounded-full">
                  Diagnostic Mode
                </span>
              </h1>
              <p className="text-gray-400 mt-1">
                Testing NHL API connectivity • Real schedule data • Mock projections
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
                  🔄 Refresh
                </>
              )}
            </button>
          </div>
          
          {/* Metadata */}
          {metadata && (
            <div className="mt-4 flex gap-6 text-sm">
              <span className="text-gray-400">
                📅 Last scan: {new Date().toLocaleTimeString()}
              </span>
              <span className="text-blue-400 font-semibold">
                🎯 {opportunities.length} opportunities
              </span>
              {metadata.operationalCompleteness && (
                <span className="text-green-400">
                  ✅ {Math.round(metadata.operationalCompleteness * 100)}% Operational
                </span>
              )}
              {metadata.dataQuality && (
                <span className="text-purple-400">
                  📊 Avg Confidence: {Math.round(metadata.dataQuality.avgConfidence)}
                </span>
              )}
            </div>
          )}
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
      {!loading && !error && sortedOpportunities.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <div className="bg-slate-800/50 rounded-xl border border-blue-500/30 backdrop-blur-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/80">
                  <tr className="text-left text-sm text-gray-400 border-b border-blue-500/30">
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">Matchup</th>
                    <th className="px-4 py-3 font-semibold">Market</th>
                    <th className="px-4 py-3 font-semibold">Line</th>
                    <th className="px-4 py-3 font-semibold">Odds</th>
                    <th className="px-4 py-3 font-semibold">Projection</th>
                    <th 
                      className="px-4 py-3 font-semibold cursor-pointer hover:text-white transition"
                      onClick={() => handleSort('edge')}
                    >
                      <div className="flex items-center gap-1">
                        Edge
                        {sortConfig.key === 'edge' && (
                          <span>{sortConfig.direction === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 font-semibold cursor-pointer hover:text-white transition"
                      onClick={() => handleSort('confidence')}
                    >
                      <div className="flex items-center gap-1">
                        Confidence
                        {sortConfig.key === 'confidence' && (
                          <span>{sortConfig.direction === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 font-semibold cursor-pointer hover:text-white transition"
                      onClick={() => handleSort('stake')}
                    >
                      <div className="flex items-center gap-1">
                        Stake (Units)
                        {sortConfig.key === 'stake' && (
                          <span>{sortConfig.direction === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOpportunities.map((opp, index) => {
                    const stakeAmount = opp.kelly * BANKROLL;
                    const units = stakeAmount / UNIT_SIZE;
                    
                    return (
                      <tr
                        key={index}
                        className="border-b border-slate-700/50 hover:bg-blue-500/10 transition text-white"
                      >
                        <td className="px-4 py-4 text-gray-400">#{index + 1}</td>
                        <td className="px-4 py-4 font-semibold">
                          {opp.playerName}
                          <div className="text-xs text-gray-500">{opp.position}</div>
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
                        <td className="px-4 py-4 font-semibold text-blue-400">
                          {opp.projection.toFixed(1)}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-green-400 font-bold">+{opp.edge.toFixed(1)}%</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-700 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full transition-all"
                                style={{ width: `${Math.min(opp.confidence, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-400 font-mono">{opp.confidence}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-right">
                            <div className="font-bold text-green-400 text-lg">
                              {units.toFixed(1)}U
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                              ${stakeAmount.toFixed(0)}
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
          
          {/* Table Legend */}
          <div className="mt-4 text-sm text-gray-400 text-center">
            💡 1 Unit = ${UNIT_SIZE} (of ${BANKROLL} bankroll) • Stakes calculated via Kelly Criterion with uncertainty penalties
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {!loading && !error && opportunities.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <div className="bg-slate-800/50 rounded-xl border border-blue-500/30 p-12">
            <p className="text-gray-400 text-lg">
              📭 No opportunities found
            </p>
            <p className="text-gray-500 mt-2">
              Either no NHL games today, or no edges detected with current model thresholds
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
