import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';

/**
 * NBA Player Props V2 - Phase 3 PRA Model
 * 
 * PHASE 3 PRA MODEL (PRODUCTION):
 * - Points + Rebounds + Assists combined predictions
 * - Trained model: 60.8% win rate, +17.08% ROI (backtest)
 * - Advanced features: L5/L10/L999 stats, rest days, opponent defense, minutes
 * - Uses real 2025-26 season data
 */

export default function NBAPlayerPropsV2() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState({});
  const [filter, setFilter] = useState('all');
  const [sideFilter, setSideFilter] = useState('all');
  const [sortBy, setSortBy] = useState('edge');
  const exportRef = useRef(null);

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/nba-props-v2');
      
      if (!response.ok) {
        console.warn('V2 API not available, trying static file...');
        const fallback = await fetch('/data/nba/nba-props-v2-live.json');
        if (fallback.ok) {
          const data = await fallback.json();
          setPredictions(data.predictions || []);
          setMetadata({
            generated: data.generated,
            season: data.season,
            model: data.model,
            version: data.version
          });
        } else {
          setPredictions([]);
        }
        return;
      }
      
      const data = await response.json();
      setPredictions(data.predictions || []);
      setMetadata({
        generated: data.generated,
        season: data.season,
        model: data.model,
        version: data.version
      });
      
    } catch (error) {
      console.error('Error loading V2 predictions:', error);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredPredictions = predictions
    .filter(p => filter === 'all' || p.propType === filter)
    .filter(p => sideFilter === 'all' || p.betSide.toLowerCase() === sideFilter)
    .sort((a, b) => {
      if (sortBy === 'edge') return Math.abs(b.edge) - Math.abs(a.edge);
      if (sortBy === 'kelly') return (b.kellyStake || 0) - (a.kellyStake || 0);
      if (sortBy === 'modelProb') return (b.modelProbability || 0) - (a.modelProbability || 0);
      if (sortBy === 'player') return a.player.localeCompare(b.player);
      return 0;
    });

  const generateTableHTML = (props, title) => {
    return `
      <div style="width: 1000px;">
        <div style="margin-bottom: 20px; text-align: center;">
          <h2 style="font-size: 24px; font-weight: bold; margin: 0; color: #1f2937;">${title}</h2>
        </div>
        <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280;">Player</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280;">Prop</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280;">Line</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280;">Pick</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280;">Edge</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280;">Stake</th>
            </tr>
          </thead>
          <tbody>
            ${props.map((pred, idx) => `
              <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                <td style="padding: 10px 12px;">
                  <div style="font-weight: 600; font-size: 13px;">${pred.player}</div>
                  <div style="font-size: 10px; color: #6b7280;">${pred.team} vs ${pred.opponent}</div>
                </td>
                <td style="padding: 10px 12px;">
                  <span style="padding: 3px 10px; font-size: 10px; border-radius: 9999px; ${
                    pred.propType === 'points' ? 'background: #fef3c7; color: #92400e;' :
                    pred.propType === 'rebounds' ? 'background: #f3e8ff; color: #7c3aed;' : 
                    'background: #dbeafe; color: #2563eb;'
                  }">${pred.propType.toUpperCase()}</span>
                </td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 600;">${pred.vegasLine}</td>
                <td style="padding: 10px 12px; text-align: center;">
                  <span style="padding: 4px 12px; font-size: 11px; font-weight: 700; border-radius: 6px; ${
                    pred.betSide === 'OVER' ? 'background: #d1fae5; color: #065f46;' : 'background: #fee2e2; color: #991b1b;'
                  }">${pred.betSide}</span>
                </td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #059669;">${pred.edge.toFixed(1)}%</td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #f59e0b;">${(pred.kellyStake || 0).toFixed(1)}U</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const exportTop20PNG = async () => {
    const sorted = [...predictions].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
    const top20 = sorted.slice(0, 20);
    if (top20.length === 0) return alert('No predictions available');

    const exportDiv = document.createElement('div');
    exportDiv.style.cssText = 'position:absolute;left:-9999px;background:white;padding:40px;font-family:system-ui';
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    exportDiv.innerHTML = `
      <div style="width:1000px;"><div style="margin-bottom:30px;text-align:center;">
        <h1 style="font-size:32px;font-weight:bold;margin:0 0 10px 0;">🏀 NBA Player Props V2 (Phase 3 PRA)</h1>
        <p style="font-size:16px;color:#6b7280;margin:0;">Top 20 • ${today}</p>
        <p style="font-size:14px;color:#10b981;margin:5px 0 0 0;font-weight:600;">60.8% Win | +17.08% ROI</p>
      </div>${generateTableHTML(top20, 'TOP 20')}
      <div style="margin-top:20px;text-align:center;font-size:11px;color:#9ca3af;">Phase 3 PRA | bgroundrobin.com</div></div>`;
    
    document.body.appendChild(exportDiv);
    try {
      const canvas = await html2canvas(exportDiv, { scale: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `nba-props-v2-top20-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      document.body.removeChild(exportDiv);
    }
  };

  const exportNext20PNG = async () => {
    const sorted = [...predictions].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
    const next20 = sorted.slice(20, 40);
    if (next20.length === 0) return alert('Need 21+ predictions');

    const exportDiv = document.createElement('div');
    exportDiv.style.cssText = 'position:absolute;left:-9999px;background:white;padding:40px;font-family:system-ui';
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    exportDiv.innerHTML = `
      <div style="width:1000px;"><div style="margin-bottom:30px;text-align:center;">
        <h1 style="font-size:32px;font-weight:bold;margin:0 0 10px 0;">🏀 NBA Player Props V2 (Phase 3 PRA)</h1>
        <p style="font-size:16px;color:#6b7280;margin:0;">Next 20 (#21-40) • ${today}</p>
        <p style="font-size:14px;color:#10b981;margin:5px 0 0 0;font-weight:600;">60.8% Win | +17.08% ROI</p>
      </div>${generateTableHTML(next20, 'NEXT 20')}
      <div style="margin-top:20px;text-align:center;font-size:11px;color:#9ca3af;">Phase 3 PRA | bgroundrobin.com</div></div>`;
    
    document.body.appendChild(exportDiv);
    try {
      const canvas = await html2canvas(exportDiv, { scale: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `nba-props-v2-next20-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      document.body.removeChild(exportDiv);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">🏀 NBA Player Props V2</h1>
          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">Phase 3 PRA</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-green-600">Historical:</span>
            <span>60.8% win | +17.08% ROI</span>
          </div>
          {metadata.season && (<div className="flex items-center gap-2">
            <span className="font-semibold text-blue-600">Season:</span><span>{metadata.season}</span></div>)}
        </div>
        <p className="text-sm text-gray-600 mt-2">Advanced PRA model • 18 features • Real 2025-26 data</p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div><label className="text-sm font-medium text-gray-700 mr-2">Prop:</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
              <option value="all">All</option><option value="points">Points</option>
              <option value="rebounds">Rebounds</option><option value="assists">Assists</option>
            </select>
          </div>
          <div><label className="text-sm font-medium text-gray-700 mr-2">Side:</label>
            <select value={sideFilter} onChange={(e) => setSideFilter(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
              <option value="all">All</option><option value="over">Over</option><option value="under">Under</option>
            </select>
          </div>
          <div><label className="text-sm font-medium text-gray-700 mr-2">Sort:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
              <option value="edge">Edge</option><option value="kelly">Kelly</option>
              <option value="modelProb">Model Prob</option><option value="player">Player</option>
            </select>
          </div>
          <button onClick={loadPredictions} className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 text-sm">Refresh</button>
          <button onClick={exportTop20PNG} disabled={!predictions.length} className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 text-sm disabled:bg-gray-400">Export Top 20</button>
          <button onClick={exportNext20PNG} disabled={predictions.length < 21} className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 text-sm disabled:bg-gray-400">Export Next 20</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      ) : !filteredPredictions.length ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-600">No predictions meet thresholds</p>
          <p className="text-sm text-gray-500 mt-2">Edge: 2%+ | Kelly: 1%+ | Min games: 5</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prop</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Line</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pick</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Model Prob</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Edge</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kelly</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPredictions.map((pred, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{pred.player}</div>
                    <div className="text-xs text-gray-500">{pred.team}</div>
                    <div className="text-xs text-gray-400">vs {pred.opponent}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      pred.propType === 'points' ? 'bg-yellow-100 text-yellow-800' :
                      pred.propType === 'rebounds' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>{pred.propType.toUpperCase()}</span>
                  </td>
                  <td className="px-6 py-4 text-center font-medium">{pred.vegasLine}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded ${
                      pred.betSide === 'OVER' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>{pred.betSide}</span>
                    <div className="text-xs text-gray-500 mt-1">{pred.odds > 0 ? `+${pred.odds}` : pred.odds}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center">
                      <div className="w-20 bg-gray-200 rounded-full h-2 mr-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${(pred.modelProbability * 100).toFixed(0)}%` }}></div>
                      </div>
                      <span className="text-sm font-semibold">{(pred.modelProbability * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-green-600">{pred.edge.toFixed(1)}%</td>
                  <td className="px-6 py-4 text-center font-bold text-yellow-600">{(pred.kellyStake || 0).toFixed(1)}U</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <h3 className="font-semibold mb-2">Phase 3 PRA Model</h3>
        <ul className="space-y-1">
          <li>• <strong>Version:</strong> {metadata.version || 'phase3_pra_v1_real'}</li>
          <li>• <strong>Features:</strong> 18 (L5/L10/L999, minutes, rest, opp defense, games)</li>
          <li>• <strong>Thresholds:</strong> 2% edge, 1%+ Kelly, 5+ games</li>
          <li>• <strong>Backtest:</strong> 60.8% win, +17.08% ROI</li>
          <li>• <strong>Data:</strong> Real 2025-26 season</li>
        </ul>
      </div>
    </div>
  );
}
