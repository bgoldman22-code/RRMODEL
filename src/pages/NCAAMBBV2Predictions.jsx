import React, { useState, useEffect, useRef } from 'react';
import { exportToPNG } from '../lib/exportUtils';

const NCAAMBBV2Predictions = () => {
  const [predictions, setPredictions] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const exportRef = useRef(null);

  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      const filename = `ncaa-mbb-v2-picks-${new Date().toISOString().split('T')[0]}`;
      await exportToPNG(exportRef.current, filename, { scale: 3, width: 900, windowWidth: 900 });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    }
  };

  useEffect(() => { loadPredictions(); }, []);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      const timestamp = Date.now();
      const response = await fetch(`/.netlify/functions/ncaa-mbb-v2-predictions?_t=${timestamp}`);
      const data = await response.json();

      if (!data.ok || !data.predictions || data.predictions.length === 0) {
        setError(data.message || 'No V2 picks available today. This model plays tiered dogs (≤+150 @5% edge, +201-250 @10% edge) — some days have 0 qualifying picks.');
        setMetadata(data.metadata || null);
        return;
      }

      setPredictions(data.predictions);
      setMetadata(data.metadata);
      setLastUpdated(data.generated);
      setError(null);
    } catch (err) {
      setError(`Error loading V2 predictions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading calibrated V2 predictions...</p>
        <p className="mt-1 text-xs text-gray-400">Training walk-forward calibration on historical data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🏀 NCAA MBB V2 — Calibrated Picks</h1>
        <p className="text-gray-500 text-sm mb-4">Tiered Dogs: ≤+150 @5% · +201-250 @10% · Isotonic Calibration</p>
        
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4">
          <div className="flex items-center">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800">No Qualifying Picks Today</h3>
              <div className="mt-2 text-sm text-amber-700">{error}</div>
            </div>
          </div>
        </div>

        {metadata && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600">
              <strong>V1 had {metadata.rawPicksTotal} picks today</strong> — {metadata.filteredOut} filtered out by V2 criteria.
            </p>
            {metadata.filterBreakdown && (
              <ul className="text-xs text-gray-500 mt-2 space-y-1">
                <li>• Favorites removed: {metadata.filterBreakdown.notDog}</li>
                <li>• Dead zone +151-200 (removed): {metadata.filterBreakdown.deadZone}</li>
                <li>• Odds &gt; +250 removed: {metadata.filterBreakdown.oddsTooHigh}</li>
                <li>• Low calibrated edge: {metadata.filterBreakdown.lowEdge}</li>
              </ul>
            )}
          </div>
        )}

        <button 
          onClick={loadPredictions}
          className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const formatOdds = (odds) => odds > 0 ? `+${odds}` : `${odds}`;

  const getEdgeBadge = (edge) => {
    const pct = edge * 100;
    if (pct >= 15) return { label: 'STRONG', color: 'bg-emerald-600', textColor: 'text-emerald-800', bgLight: 'bg-emerald-100' };
    if (pct >= 10) return { label: 'SOLID', color: 'bg-blue-600', textColor: 'text-blue-800', bgLight: 'bg-blue-100' };
    if (pct >= 5)  return { label: 'EDGE', color: 'bg-amber-600', textColor: 'text-amber-800', bgLight: 'bg-amber-100' };
    return { label: 'MIN', color: 'bg-gray-600', textColor: 'text-gray-800', bgLight: 'bg-gray-100' };
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">🏀 NCAA MBB V2 — Calibrated Picks</h1>
        <p className="text-gray-500 text-sm">
          Tiered Dogs: ≤+150 @5% · +201-250 @10% · Walk-Forward Isotonic Calibration
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            ✅ Backtest: {metadata?.backtestRecord || '64-58'} · {metadata?.backtestROI || '+13.5%'} ROI
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            📊 Calibration trained on {metadata?.calibrationTrainingSize || '?'} historical picks
          </span>
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-400 mt-1">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </div>

      {/* Summary Cards */}
      {metadata && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <div className="text-xs text-emerald-600 font-medium">V2 Picks</div>
            <div className="text-2xl font-bold text-emerald-900">{metadata.totalPicks}</div>
            <div className="text-xs text-emerald-500">of {metadata.rawPicksTotal} V1</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-medium">Total Stake</div>
            <div className="text-2xl font-bold text-blue-900">${metadata.totalStake?.toFixed(0)}</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="text-xs text-purple-600 font-medium">Avg Cal. Edge</div>
            <div className="text-2xl font-bold text-purple-900">{(metadata.avgCalibratedEdge * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="text-xs text-orange-600 font-medium">Max Cal. Edge</div>
            <div className="text-2xl font-bold text-orange-900">{(metadata.maxCalibratedEdge * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-600 font-medium">Filtered Out</div>
            <div className="text-2xl font-bold text-gray-900">{metadata.filteredOut}</div>
            <div className="text-xs text-gray-500">didn't qualify</div>
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className="flex justify-end mb-4">
        <button onClick={handleExport}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          📸 Export PNG
        </button>
      </div>

      {/* Hidden Export Container */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={exportRef} style={{ width: '900px', backgroundColor: '#ffffff', padding: '24px', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: 'bold', margin: 0 }}>🏀 NCAA MBB V2 Picks (Calibrated)</h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
              {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : new Date().toLocaleDateString()} | {predictions.length} Picks | Tiered Dogs ≤+150 @5% · +201-250 @10%
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#ecfdf5' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #a7f3d0', width: '30%' }}>Game</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #a7f3d0', width: '18%' }}>Pick</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #a7f3d0', width: '10%' }}>Odds</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #a7f3d0', width: '14%' }}>Cal. Win %</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #a7f3d0', width: '12%' }}>Cal. Edge</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #a7f3d0', width: '16%' }}>Tier</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((pred, idx) => {
                const badge = getEdgeBadge(pred.betting.calibratedEdge);
                const isTier2 = pred.betting.tier === 'tier2';
                return (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f0fdf4', borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px 8px' }}>{pred.awayTeam} @ {pred.homeTeam}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 'bold' }}>{pred.prediction.pick}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>{formatOdds(pred.vegasLines.moneyline.pick)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>{pred.prediction.winProbability.calibratedPercent.toFixed(1)}%</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#059669', fontWeight: 'bold' }}>+{(pred.betting.calibratedEdge * 100).toFixed(1)}%</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '6px',
                        color: '#fff', fontWeight: 'bold', fontSize: '11px',
                        backgroundColor: isTier2 ? '#7c3aed' : '#059669'
                      }}>
                        {isTier2 ? 'LONGSHOT' : 'DOG ≤150'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '14px', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
            V2: Isotonic Calibration + Tiered Dogs (≤+150 @5%, +201-250 @10%)
          </div>
          <div style={{ marginTop: '6px', fontSize: '13px', color: '#6b7280', textAlign: 'center', fontWeight: 600, letterSpacing: '1px' }}>BNGBets</div>
        </div>
      </div>

      {/* Picks Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-emerald-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Game</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Pick</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Odds</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Raw Prob</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cal. Prob</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Implied</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cal. Edge</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stake</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {predictions.map((pred, idx) => {
                const badge = getEdgeBadge(pred.betting.calibratedEdge);
                const isTier2 = pred.betting.tier === 'tier2';
                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-emerald-50/30'}>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {pred.awayTeam} @ {pred.homeTeam}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-3 py-1 text-sm font-bold rounded-full ${isTier2 ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {pred.prediction.pick}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatOdds(pred.vegasLines.moneyline.pick)}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-400 line-through">
                        {pred.prediction.winProbability.rawModelPercent.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-semibold text-emerald-700">
                        {pred.prediction.winProbability.calibratedPercent.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-500">
                        {pred.prediction.winProbability.impliedPercent.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-bold text-emerald-600">
                        +{(pred.betting.calibratedEdge * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-bold text-white rounded ${isTier2 ? 'bg-purple-600' : 'bg-emerald-600'}`}>
                        {isTier2 ? 'LONGSHOT' : 'DOG ≤150'}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-bold text-gray-900">
                        ${pred.betting.recommendedStake.toFixed(0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Info */}
      <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-emerald-800 mb-2">V2 Model Information</h3>
        <ul className="text-sm text-emerald-700 space-y-1">
          <li>• <strong>Model:</strong> NCAA MBB V2 — Walk-Forward Isotonic Calibration + Tiered Strategy</li>
          <li>• <strong>Tier 1:</strong> Underdogs ≤ +150, ≥5% calibrated edge → 13-8, +34% ROI (mature cal)</li>
          <li>• <strong>Tier 2:</strong> Longshots +201-250, ≥10% calibrated edge → 5-5, +55% ROI (mature cal)</li>
          <li>• <strong>Dead Zone:</strong> +151-200 SKIPPED — confirmed -100% ROI at every maturity level</li>
          <li>• <strong>Composite Backtest:</strong> {metadata?.backtestRecord || '18-13 (58.1%)'} · {metadata?.backtestROI || '+40.8%'} ROI · +$12,640 P/L</li>
          <li>• <strong>Calibration:</strong> Isotonic regression trained on all prior results (walk-forward, no data leakage)</li>
          <li>• <strong>Kelly Fraction:</strong> 25% (conservative sizing)</li>
          <li>• <strong>Bankroll:</strong> $10,000</li>
          <li>• <strong>Why V2?</strong> V1 is overconfident (ECE=33%). Calibration corrects probabilities. Tiered dogs is where the model has genuine edge.</li>
        </ul>
      </div>

      {/* Filter Breakdown */}
      {metadata?.filterBreakdown && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Today's Filter Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm text-gray-600">
            <div>V1 Total: <strong>{metadata.rawPicksTotal}</strong></div>
            <div>Favorites (removed): <strong>{metadata.filterBreakdown.notDog}</strong></div>
            <div>Dead zone +151-200: <strong>{metadata.filterBreakdown.deadZone}</strong></div>
            <div>Odds &gt; +250 (removed): <strong>{metadata.filterBreakdown.oddsTooHigh}</strong></div>
            <div>Low edge (removed): <strong>{metadata.filterBreakdown.lowEdge}</strong></div>
          </div>
          {metadata.tierCounts && (
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
              <div>🟢 Tier 1 (≤+150 @5%): <strong>{metadata.tierCounts.tier1}</strong></div>
              <div>🟣 Tier 2 (+201-250 @10%): <strong>{metadata.tierCounts.tier2}</strong></div>
            </div>
          )}
        </div>
      )}

      {/* Refresh */}
      <div className="mt-6 text-center">
        <button onClick={loadPredictions} disabled={loading}
          className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Refresh Predictions'}
        </button>
      </div>
    </div>
  );
};

export default NCAAMBBV2Predictions;
