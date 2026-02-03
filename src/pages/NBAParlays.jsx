import React, { useState, useEffect, useRef } from 'react';
import { generateAllParlays, getHitRate } from '../lib/nbaParlaysData';
import { exportToPNG } from '../lib/exportUtils';

/**
 * NBA Parlays Page
 * 
 * Generates confidence parlays designed for profit boosts:
 * - Game Predictions Parlays (ML/Spread only, no totals)
 * - Confidence Parlays (Props + Safe Game Legs)
 * - SGP-style Parlays (Aligned + Phase 3.5 points)
 */

export default function NBAParlays() {
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [gameParlays, setGameParlays] = useState([]);
  const [confidenceParlays, setConfidenceParlays] = useState([]);
  const [sgpParlays, setSgpParlays] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [clickCount, setClickCount] = useState(0);
  const [saferMode, setSaferMode] = useState(false);
  const [allowSafetyAlt, setAllowSafetyAlt] = useState(true);
  const exportRef = useRef(null);

  useEffect(() => {
    loadParlays();
  }, []);

  const loadParlays = async (regen = false) => {
    try {
      if (regen) {
        setRegenerating(true);
      } else {
        setLoading(true);
      }
      
      const count = regen ? clickCount + 1 : clickCount;
      if (regen) setClickCount(count);
      
      const result = await generateAllParlays(count, saferMode, allowSafetyAlt);
      
      setGameParlays(result.gameParlays);
      setConfidenceParlays(result.confidenceParlays);
      setSgpParlays(result.sgpParlays);
      setMetadata(result.metadata);
      
    } catch (error) {
      console.error('Error loading parlays:', error);
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };

  const handleRegenerate = () => {
    loadParlays(true);
  };

  const handleToggleSaferMode = () => {
    setSaferMode(!saferMode);
  };

  const handleToggleSafetyAlt = () => {
    setAllowSafetyAlt(!allowSafetyAlt);
  };

  // Re-generate when toggles change
  useEffect(() => {
    if (!loading) {
      loadParlays(true);
    }
  }, [saferMode, allowSafetyAlt]);

  // Export to PNG (iOS saves to Photos via share sheet, desktop downloads)
  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      const filename = `nba_parlays_${new Date().toISOString().split('T')[0]}`;
      await exportToPNG(exportRef.current, filename, {
        scale: 2,
        width: 900,
        windowWidth: 900
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    }
  };

  const formatOdds = (odds) => {
    const o = Number(odds) || 0;
    return o > 0 ? `+${o}` : `${o}`;
  };

  const formatHitRate = (pick, window) => {
    const rate = getHitRate(pick, window);
    if (rate === null) return 'N/A';
    const pct = Math.round(rate * 100);
    return `${pct}%`;
  };

  const getLegTypeChip = (leg) => {
    const colors = {
      PROP: 'bg-purple-100 text-purple-800',
      ML: 'bg-green-100 text-green-800',
      SPREAD: 'bg-blue-100 text-blue-800',
      ALT: 'bg-orange-100 text-orange-800'
    };
    
    let type = leg.type;
    if (leg.safetyAltApplied) type = 'ALT';
    
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[type] || 'bg-gray-100 text-gray-800'}`}>
        {type}
      </span>
    );
  };

  const getSourceChip = (source) => {
    if (source === 'Phase35') {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">Phase3.5</span>;
    }
    if (source === 'Aligned') {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">Aligned</span>;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Generating parlays...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">🎰 NBA Parlays</h1>
          <p className="text-gray-600 mt-1">Confidence parlays designed for profit boosts (hit-rate prioritized)</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Controls Row */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Regenerate Button */}
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {regenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Regenerating...
                </>
              ) : (
                <>🔄 Regenerate Parlays</>
              )}
            </button>
            
            {/* Safer Mode Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div className={`w-12 h-6 rounded-full p-1 transition-colors ${saferMode ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${saferMode ? 'translate-x-6' : ''}`}></div>
              </div>
              <span className="text-sm font-medium text-gray-700">Safer Mode</span>
            </label>
            
            {/* Safety Alt Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div className={`w-12 h-6 rounded-full p-1 transition-colors ${allowSafetyAlt ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${allowSafetyAlt ? 'translate-x-6' : ''}`}></div>
              </div>
              <span className="text-sm font-medium text-gray-700">Allow Safety Alt-Lines</span>
            </label>
          </div>
          
          {/* Export Button */}
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
          >
            📸 Export PNG
          </button>
        </div>

        {/* Data Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-sm text-gray-500">Strong Signals</div>
            <div className="text-2xl font-bold text-green-600">{metadata.counts?.strongSignals || 0}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-sm text-gray-500">Game Predictions</div>
            <div className="text-2xl font-bold text-blue-600">{metadata.counts?.gamePredictions || 0}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-sm text-gray-500">Total Parlays</div>
            <div className="text-2xl font-bold text-purple-600">
              {gameParlays.length + confidenceParlays.length + sgpParlays.length}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-sm text-gray-500">Mode</div>
            <div className="text-lg font-bold text-gray-800">
              {saferMode ? '🛡️ Safer' : '⚡ Standard'}
            </div>
          </div>
        </div>

        {/* Section 1: Game Predictions Parlays */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            🏀 Game Predictions Parlays
            <span className="text-sm font-normal text-gray-500">(No Totals)</span>
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gameParlays.map((parlay, idx) => (
              <ParlayCard key={idx} parlay={parlay} formatOdds={formatOdds} getLegTypeChip={getLegTypeChip} />
            ))}
            {gameParlays.length === 0 && (
              <div className="col-span-2 bg-gray-100 rounded-lg p-6 text-center text-gray-500">
                No game parlays available - not enough qualifying games
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Confidence Parlays */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            🎯 Confidence Parlays
            <span className="text-sm font-normal text-gray-500">(Props + Safe Game Legs)</span>
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {confidenceParlays.map((parlay, idx) => (
              <ParlayCard 
                key={idx} 
                parlay={parlay} 
                formatOdds={formatOdds} 
                getLegTypeChip={getLegTypeChip}
                formatHitRate={formatHitRate}
                showHitRates
              />
            ))}
            {confidenceParlays.length === 0 && (
              <div className="col-span-3 bg-gray-100 rounded-lg p-6 text-center text-gray-500">
                No confidence parlays available - not enough aligned props
              </div>
            )}
          </div>
        </div>

        {/* Section 3: SGP-style Parlays */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            🔥 Same Game Parlays
            <span className="text-sm font-normal text-gray-500">(All legs from one game)</span>
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sgpParlays.map((parlay, idx) => (
              <ParlayCard 
                key={idx} 
                parlay={parlay} 
                formatOdds={formatOdds} 
                getLegTypeChip={getLegTypeChip}
                getSourceChip={getSourceChip}
                formatHitRate={formatHitRate}
                showHitRates
                showSources
              />
            ))}
            {sgpParlays.length === 0 && (
              <div className="col-span-3 bg-gray-100 rounded-lg p-6 text-center text-gray-500">
                No SGP parlays available - not enough Phase 3.5 points picks
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Legend & Info</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800 mr-2">PROP</span>
              Player prop bet
            </div>
            <div>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 mr-2">ML</span>
              Moneyline
            </div>
            <div>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 mr-2">SPREAD</span>
              Point spread
            </div>
            <div>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 mr-2">ALT</span>
              Safety alt-line applied
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            <p><strong>Safer Mode:</strong> Prefers ML over close spreads, uses more conservative selections</p>
            <p><strong>Safety Alt-Line:</strong> OVER: line - 1 | UNDER: line + 1 (applied to borderline legs)</p>
            <p><strong>Tip:</strong> Use these parlays with profit boosts for optimal value</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-400">
          <p>Generated: {metadata.generated ? new Date(metadata.generated).toLocaleString() : 'N/A'}</p>
          <p>bgroundrobin.com/nba-parlays</p>
        </div>
      </div>

      {/* Hidden Export Container - Clean layout for PNG */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={exportRef} style={{ width: '900px', backgroundColor: '#ffffff', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Export Header */}
          <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', paddingBottom: '16px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0' }}>🎰 NBA Parlays</h1>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* SGP Parlays Section */}
          {sgpParlays.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#1f2937' }}>🔥 Same Game Parlays</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {sgpParlays.map((parlay, idx) => (
                  <ExportParlayCard key={idx} parlay={parlay} formatOdds={formatOdds} />
                ))}
              </div>
            </div>
          )}

          {/* Confidence Parlays Section */}
          {confidenceParlays.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#1f2937' }}>🎯 Confidence Parlays</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {confidenceParlays.slice(0, 4).map((parlay, idx) => (
                  <ExportParlayCard key={idx} parlay={parlay} formatOdds={formatOdds} />
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', fontSize: '10px', color: '#9ca3af', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
            bgroundrobin.com/nba-parlays
          </div>
        </div>
      </div>
    </div>
  );
}

// Parlay Card Component
function ParlayCard({ parlay, formatOdds, getLegTypeChip, getSourceChip, formatHitRate, showHitRates, showSources }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="bg-gray-800 text-white px-4 py-2">
        <h3 className="font-semibold">{parlay.name}</h3>
        <p className="text-xs text-gray-300">{parlay.legs.length} legs</p>
      </div>
      
      <div className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-gray-500 text-xs">
              <th className="text-left pb-2">Leg</th>
              <th className="text-center pb-2">Pick</th>
              <th className="text-center pb-2">Odds</th>
              {showHitRates && <th className="text-center pb-2">L10</th>}
            </tr>
          </thead>
          <tbody>
            {parlay.legs.map((leg, idx) => (
              <tr key={idx} className="border-b last:border-0">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    {getLegTypeChip(leg)}
                    {showSources && getSourceChip && getSourceChip(leg.source)}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {leg.player ? (
                      <>
                        {leg.player}
                        <span className="text-gray-400 ml-1">({leg.propType})</span>
                      </>
                    ) : (
                      leg.game
                    )}
                  </div>
                  {leg.safetyAltApplied && (
                    <div className="text-xs text-orange-600">
                      Alt: {leg.originalLine} → {leg.vegasLine || leg.line}
                    </div>
                  )}
                </td>
                <td className="py-2 text-center">
                  <span className={`font-medium ${
                    leg.betSide === 'OVER' || leg.type === 'ML' ? 'text-green-600' : 
                    leg.betSide === 'UNDER' ? 'text-red-600' : 'text-gray-800'
                  }`}>
                    {leg.type === 'PROP' ? (
                      <>
                        {leg.betSide} {leg.vegasLine || leg.line}
                      </>
                    ) : (
                      leg.pick
                    )}
                  </span>
                </td>
                <td className="py-2 text-center font-mono text-xs">
                  {formatOdds(leg.odds)}
                </td>
                {showHitRates && (
                  <td className="py-2 text-center text-xs">
                    {leg.type === 'PROP' ? formatHitRate(leg, 10) : (
                      leg.winProb ? `${Math.round(leg.winProb)}%` : '-'
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Why These Legs */}
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs font-medium text-gray-700 mb-1">Why these legs:</p>
          <ul className="text-xs text-gray-500 space-y-0.5">
            {parlay.reasoning.map((reason, idx) => (
              <li key={idx}>• {reason}</li>
            ))}
          </ul>
        </div>
        
        {/* Source breakdown for SGP */}
        {parlay.sources && (
          <div className="mt-2 text-xs text-gray-500">
            Sources: {parlay.sources.aligned} Aligned, {parlay.sources.phase35} Phase 3.5
          </div>
        )}
      </div>
    </div>
  );
}

// Export-only Parlay Card (inline styles for html2canvas)
function ExportParlayCard({ parlay, formatOdds }) {
  return (
    <div style={{ 
      backgroundColor: '#ffffff', 
      borderRadius: '8px', 
      overflow: 'hidden',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ 
        backgroundColor: '#1f2937', 
        color: '#ffffff', 
        padding: '8px 12px' 
      }}>
        <div style={{ fontWeight: '600', fontSize: '13px' }}>{parlay.name}</div>
        <div style={{ fontSize: '10px', color: '#9ca3af' }}>{parlay.legs.length} legs</div>
      </div>
      
      <div style={{ padding: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '4px 0', color: '#6b7280', fontSize: '10px', fontWeight: '600' }}>Leg</th>
              <th style={{ textAlign: 'center', padding: '4px 0', color: '#6b7280', fontSize: '10px', fontWeight: '600' }}>Pick</th>
              <th style={{ textAlign: 'center', padding: '4px 0', color: '#6b7280', fontSize: '10px', fontWeight: '600' }}>Odds</th>
            </tr>
          </thead>
          <tbody>
            {parlay.legs.map((leg, idx) => (
              <tr key={idx} style={{ borderBottom: idx < parlay.legs.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <td style={{ padding: '6px 0' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span style={{ 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontSize: '9px', 
                      fontWeight: '600',
                      backgroundColor: leg.type === 'PROP' ? '#f3e8ff' : leg.type === 'ML' ? '#dcfce7' : '#dbeafe',
                      color: leg.type === 'PROP' ? '#7c3aed' : leg.type === 'ML' ? '#16a34a' : '#2563eb'
                    }}>
                      {leg.type}
                    </span>
                    {leg.source && (
                      <span style={{ 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        fontSize: '9px', 
                        fontWeight: '600',
                        backgroundColor: leg.source === 'Aligned' ? '#e0e7ff' : '#fef3c7',
                        color: leg.source === 'Aligned' ? '#4f46e5' : '#d97706'
                      }}>
                        {leg.source === 'Aligned' ? 'Aligned' : 'P3.5'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>
                    {leg.player || leg.game}
                    {leg.propType && <span style={{ color: '#9ca3af', marginLeft: '4px' }}>({leg.propType})</span>}
                  </div>
                </td>
                <td style={{ padding: '6px 0', textAlign: 'center' }}>
                  <span style={{ 
                    fontWeight: '500',
                    color: leg.betSide === 'OVER' || leg.type === 'ML' ? '#16a34a' : 
                           leg.betSide === 'UNDER' ? '#dc2626' : '#374151'
                  }}>
                    {leg.type === 'PROP' ? `${leg.betSide} ${leg.vegasLine || leg.line}` : leg.pick}
                  </span>
                </td>
                <td style={{ padding: '6px 0', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>
                  {formatOdds(leg.odds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
