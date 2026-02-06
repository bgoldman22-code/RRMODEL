import React, { useState, useEffect, useRef } from 'react';
import { exportToPNG } from '../lib/exportUtils';

/**
 * NBA Props Aligned - Best Picks from Both Models
 * 
 * FILTERING LOGIC:
 * 1. Aligned Picks: Both V1 and V2 models agree on same player/prop/line/side
 * 2. Phase 3.5 Picks: L5 > 50% AND (L10 ≥ 60% OR L20 ≥ 60%)
 * 3. Strong Signals + Aligned: Picks that meet BOTH criteria
 */

export default function NBAPropsAligned() {
  const [v1Predictions, setV1Predictions] = useState([]);
  const [v2Predictions, setV2Predictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState({});
  const [activeTab, setActiveTab] = useState('strong'); // 'strong', 'aligned', 'phase35'
  const exportRef = useRef(null);

  useEffect(() => {
    loadAllPredictions();
  }, []);

  const loadAllPredictions = async () => {
    try {
      setLoading(true);
      
      // Fetch V1 (Rebounds + Assists baseline model)
      const v1Response = await fetch('/api/nba-player-props').catch(() => null);
      let v1Data = [];
      if (v1Response?.ok) {
        const data = await v1Response.json();
        v1Data = data.predictions || [];
      } else {
        const fallback = await fetch('/data/nba/nba-player-props-live.json');
        if (fallback.ok) {
          const data = await fallback.json();
          v1Data = data.predictions || [];
        }
      }
      
      // Fetch V2 (Phase 3.5 PRA model)
      const v2Response = await fetch('/api/nba-props-v2').catch(() => null);
      let v2Data = [];
      let v2Meta = {};
      if (v2Response?.ok) {
        const data = await v2Response.json();
        v2Data = data.predictions || data.picks || [];
        v2Meta = {
          generated: data.generated || data.generated_at,
          model_version: data.model_version
        };
      } else {
        const fallback = await fetch('/data/nba/nba-props-v2-live.json');
        if (fallback.ok) {
          const data = await fallback.json();
          v2Data = data.predictions || data.picks || [];
          v2Meta = {
            generated: data.generated || data.generated_at,
            model_version: data.model_version
          };
        }
      }
      
      setV1Predictions(v1Data);
      setV2Predictions(v2Data);
      setMetadata(v2Meta);
      
    } catch (error) {
      console.error('Error loading predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create a key for matching picks across models
  const createPickKey = (pick) => {
    const player = pick.player?.toLowerCase().trim();
    const propType = pick.propType?.toLowerCase();
    const line = pick.vegasLine || pick.line;
    const side = pick.betSide?.toUpperCase();
    return `${player}|${propType}|${line}|${side}`;
  };

  // Get hit rate value (handles both V1 and V2 formats)
  const getHitRate = (pick, window) => {
    // V2 format has hitRates object
    if (pick.hitRates) {
      const key = `L${window}_hitRate`;
      return pick.hitRates[key] !== undefined ? pick.hitRates[key] / 100 : null;
    }
    // V1 format might have L5_over_pct, etc.
    const overKey = `L${window}_over_pct`;
    if (pick[overKey] !== undefined) return pick[overKey];
    return null;
  };

  // Get average value for a window
  const getAvg = (pick, window) => {
    if (pick.hitRates) {
      const key = `L${window}_avg`;
      return pick.hitRates[key] !== undefined ? pick.hitRates[key] : null;
    }
    return null;
  };

  // Check if pick meets Phase 3.5 criteria: L5 > 50% AND (L10 ≥ 60% OR L20 ≥ 60%)
  const meetsPhase35Criteria = (pick) => {
    const l5 = getHitRate(pick, 5);
    const l10 = getHitRate(pick, 10);
    const l20 = getHitRate(pick, 20);
    
    // Need L5 > 50%
    if (l5 === null || l5 <= 0.50) return false;
    
    // Need L10 ≥ 60% OR L20 ≥ 60%
    const l10Pass = l10 !== null && l10 >= 0.60;
    const l20Pass = l20 !== null && l20 >= 0.60;
    
    return l10Pass || l20Pass;
  };

  // Find aligned picks (both models agree)
  const findAlignedPicks = () => {
    const v1Keys = new Map();
    v1Predictions.forEach(pick => {
      v1Keys.set(createPickKey(pick), pick);
    });
    
    const aligned = [];
    v2Predictions.forEach(v2Pick => {
      const key = createPickKey(v2Pick);
      const v1Pick = v1Keys.get(key);
      if (v1Pick) {
        // Merge data from both models (prefer V2's hit rates as they're more complete)
        aligned.push({
          ...v2Pick,
          v1Edge: v1Pick.edge,
          v2Edge: v2Pick.edge,
          isAligned: true
        });
      }
    });
    
    return aligned.sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0));
  };

  // Filter V2 picks by Phase 3.5 criteria
  const filterPhase35Picks = () => {
    return v2Predictions
      .filter(meetsPhase35Criteria)
      .sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0));
  };

  // Strong signals: aligned AND meets Phase 3.5 criteria
  const findStrongSignals = () => {
    const aligned = findAlignedPicks();
    return aligned.filter(meetsPhase35Criteria);
  };

  // Phase 3.5 Points picks (V2 only — V1 doesn't cover points)
  const findPointsPicks = () => {
    return v2Predictions
      .filter(p => p.propType === 'points')
      .filter(meetsPhase35Criteria)
      .sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0));
  };

  const formatOdds = (odds) => {
    const american = Number(odds);
    if (!Number.isFinite(american) || american === 0) return 'EVEN';
    return american > 0 ? `+${Math.round(american)}` : `${Math.round(american)}`;
  };

  const formatHitRate = (pct) => {
    if (pct === null || pct === undefined) return { display: 'N/A', color: 'text-gray-400' };
    const percentage = Math.round(pct * 100);
    let color = 'text-gray-600';
    if (percentage >= 60) color = 'text-green-600 font-semibold';
    else if (percentage <= 40) color = 'text-red-500';
    return { display: `${percentage}%`, color };
  };

  const formatEdge = (edge) => {
    const e = Number(edge) || 0;
    return `${e >= 0 ? '+' : ''}${e.toFixed(1)}%`;
  };

  // Get current picks based on active tab
  const getCurrentPicks = () => {
    switch (activeTab) {
      case 'strong': return findStrongSignals();
      case 'aligned': return findAlignedPicks();
      case 'phase35': return filterPhase35Picks();
      default: return [];
    }
  };

  const currentPicks = getCurrentPicks();
  const pointsPicks = findPointsPicks();

  // Export to PNG (iOS saves to Photos via share sheet, desktop downloads)
  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      const tabName = activeTab === 'strong' ? 'strong-signals' : activeTab;
      const filename = `nba-props-${tabName}-${new Date().toISOString().split('T')[0]}`;
      await exportToPNG(exportRef.current, filename, {
        scale: 2,
        width: 1000,
        windowWidth: 1000
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'strong': return '🎯 Strong Signals + Aligned';
      case 'aligned': return '🤝 Aligned Picks (Both Models Agree)';
      case 'phase35': return '📊 Phase 3.5 Picks (L5>50% & L10/L20≥60%)';
      default: return 'Picks';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading predictions from both models...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">NBA Props - Best Picks</h1>
          <p className="text-gray-600 mt-1">Cross-referenced from V1 (Baseline) and V2 (Phase 3.5) models</p>
          {metadata.generated && (
            <p className="text-xs text-gray-400 mt-1">
              Last updated: {new Date(metadata.generated).toLocaleString()}
            </p>
          )}
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div 
            className={`bg-white rounded-lg p-4 text-center cursor-pointer border-2 transition-all ${
              activeTab === 'strong' ? 'border-green-500 shadow-lg' : 'border-gray-200 hover:border-green-300'
            }`}
            onClick={() => setActiveTab('strong')}
          >
            <div className="text-3xl font-bold text-green-600">{findStrongSignals().length}</div>
            <div className="text-sm text-gray-600">Strong Signals</div>
            <div className="text-xs text-gray-400">Aligned + Phase 3.5</div>
          </div>
          <div 
            className={`bg-white rounded-lg p-4 text-center cursor-pointer border-2 transition-all ${
              activeTab === 'aligned' ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-blue-300'
            }`}
            onClick={() => setActiveTab('aligned')}
          >
            <div className="text-3xl font-bold text-blue-600">{findAlignedPicks().length}</div>
            <div className="text-sm text-gray-600">Aligned Picks</div>
            <div className="text-xs text-gray-400">Both Models Agree</div>
          </div>
          <div 
            className={`bg-white rounded-lg p-4 text-center cursor-pointer border-2 transition-all ${
              activeTab === 'phase35' ? 'border-purple-500 shadow-lg' : 'border-gray-200 hover:border-purple-300'
            }`}
            onClick={() => setActiveTab('phase35')}
          >
            <div className="text-3xl font-bold text-purple-600">{filterPhase35Picks().length}</div>
            <div className="text-sm text-gray-600">Phase 3.5 Picks</div>
            <div className="text-xs text-gray-400">L5&gt;50% & L10/L20≥60%</div>
          </div>
        </div>

        {/* Export Button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            📸 Export PNG
          </button>
        </div>

        {/* Picks Table + Points Table (wrapped for export) */}
        <div ref={exportRef}>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-3">
            <h2 className="text-lg font-semibold">{getTabTitle()}</h2>
            <p className="text-sm text-gray-300">{currentPicks.length} picks meet the criteria</p>
          </div>
          
          {currentPicks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No picks match the current filter criteria
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Prop</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Line</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Pick</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Odds</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">L5</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">L10</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">L20</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Edge</th>
                    {activeTab === 'aligned' || activeTab === 'strong' ? (
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {currentPicks.map((pick, idx) => {
                    const l5 = getHitRate(pick, 5);
                    const l10 = getHitRate(pick, 10);
                    const l20 = getHitRate(pick, 20);
                    const l5Fmt = formatHitRate(l5);
                    const l10Fmt = formatHitRate(l10);
                    const l20Fmt = formatHitRate(l20);
                    
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{pick.player}</div>
                          <div className="text-xs text-gray-500">{pick.team} vs {pick.opponent}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                            pick.propType === 'points' ? 'bg-amber-100 text-amber-800' :
                            pick.propType === 'rebounds' ? 'bg-purple-100 text-purple-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {pick.propType?.charAt(0).toUpperCase() + pick.propType?.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-medium">{pick.vegasLine}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold ${
                            pick.betSide === 'OVER' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {pick.betSide}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-sm">{formatOdds(pick.odds)}</td>
                        <td className={`px-4 py-3 text-center ${l5Fmt.color}`}>{l5Fmt.display}</td>
                        <td className={`px-4 py-3 text-center ${l10Fmt.color}`}>{l10Fmt.display}</td>
                        <td className={`px-4 py-3 text-center ${l20Fmt.color}`}>{l20Fmt.display}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${Number(pick.edge) >= 8 ? 'text-green-600' : 'text-gray-700'}`}>
                            {formatEdge(pick.edge)}
                          </span>
                        </td>
                        {(activeTab === 'aligned' || activeTab === 'strong') && (
                          <td className="px-4 py-3 text-center">
                            <span className="text-green-600 text-lg" title="Both models agree">✓✓</span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Phase 3.5 Points Picks — V2 Only (V1 doesn't cover points) */}
        {pointsPicks.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
            <div className="bg-amber-700 text-white px-4 py-3">
              <h2 className="text-lg font-semibold">🏀 Phase 3.5 Points Picks (V2 Model Only)</h2>
              <p className="text-sm text-amber-200">{pointsPicks.length} points picks meet Phase 3.5 criteria — V1 model does not cover points</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-amber-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Player</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Line</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Pick</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Odds</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">L5</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">L10</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">L20</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Edge</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Model Prob</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Book</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pointsPicks.map((pick, idx) => {
                    const l5 = getHitRate(pick, 5);
                    const l10 = getHitRate(pick, 10);
                    const l20 = getHitRate(pick, 20);
                    const l5Fmt = formatHitRate(l5);
                    const l10Fmt = formatHitRate(l10);
                    const l20Fmt = formatHitRate(l20);
                    const prob = pick.modelProbability || pick.prediction || 0;

                    return (
                      <tr key={`pts-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/30'}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{pick.player}</div>
                          <div className="text-xs text-gray-500">{pick.team} vs {pick.opponent}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-medium">{pick.vegasLine}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold ${pick.betSide === 'OVER' ? 'text-green-600' : 'text-red-600'}`}>
                            {pick.betSide}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-sm">{formatOdds(pick.odds)}</td>
                        <td className={`px-4 py-3 text-center ${l5Fmt.color}`}>{l5Fmt.display}</td>
                        <td className={`px-4 py-3 text-center ${l10Fmt.color}`}>{l10Fmt.display}</td>
                        <td className={`px-4 py-3 text-center ${l20Fmt.color}`}>{l20Fmt.display}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${Number(pick.edge) >= 8 ? 'text-green-600' : 'text-gray-700'}`}>
                            {formatEdge(pick.edge)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-sm">
                          {(prob * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-left text-sm font-medium text-gray-800">{pick.book || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>{/* end exportRef wrapper */}

        {/* Legend */}
        <div className="mt-6 bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold text-gray-800 mb-2">Filter Criteria</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-green-600 font-bold">🎯</span>
              <div>
                <div className="font-medium">Strong Signals</div>
                <div className="text-gray-500">Aligned + Phase 3.5 criteria met</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">🤝</span>
              <div>
                <div className="font-medium">Aligned</div>
                <div className="text-gray-500">Both V1 & V2 pick same player/line/side</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">📊</span>
              <div>
                <div className="font-medium">Phase 3.5</div>
                <div className="text-gray-500">L5 &gt; 50% AND (L10 ≥ 60% OR L20 ≥ 60%)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Model Info */}
        <div className="mt-4 text-center text-xs text-gray-400">
          <p>V1 (Baseline): {v1Predictions.length} predictions | V2 (Phase 3.5): {v2Predictions.length} predictions</p>
        </div>
      </div>
    </div>
  );
}
