import React, { useState, useEffect } from 'react';

// iOS detection and file sharing helpers
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const canShareFiles = () => {
  return navigator.share && navigator.canShare;
};

// Helper to save canvas as PNG with iOS share sheet support
const saveCanvasAsPNG = async (canvas, filename) => {
  // Convert canvas to blob
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  
  // On iOS, use share sheet so user can save to Photos
  if (isIOS() && canShareFiles()) {
    const file = new File([blob], filename, { type: 'image/png' });
    
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: filename.replace('.png', ''),
        });
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failed, falling back to download:', err);
        } else {
          return; // User cancelled, don't fall back
        }
      }
    }
  }
  
  // Fallback: traditional download for desktop/unsupported browsers
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL();
  link.click();
};

const NBAPredictionsV2 = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [useV21, setUseV21] = useState(true); // Default to V2.1 (V4 totals + Kelly staking)
  const [modelVersion, setModelVersion] = useState('V2'); // Track which version loaded

  useEffect(() => {
    loadPredictions();
  }, [useV21]); // Reload when toggle changes

  const loadPredictions = async () => {
    try {
      setLoading(true);
      // Add cache-busting parameter to force fresh data
      const timestamp = Date.now();
      // Use V2.1 endpoint if toggle is on
      const endpoint = useV21 
        ? `/.netlify/functions/nba-predictions-elite-v2-1?_t=${timestamp}`
        : `/.netlify/functions/nba-predictions-elite-v2?_t=${timestamp}`;
      const response = await fetch(endpoint);
      const data = await response.json();

      if (!data.ok || !data.predictions || data.predictions.length === 0) {
        setError(data.message || 'No games available');
        return;
      }

      setPredictions(data.predictions);
      setModelVersion(data.modelInfo?.version || 'V2'); // Track version from response
      setError(null); // Clear any previous errors
    } catch (err) {
      setError(`Error loading predictions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportFullSlatePNG = async () => {
    setExporting(true);
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      });
      
      // Create hidden container for table
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);
      
      // ===== TABLE 1: FULL SLATE PROJECTIONS =====
      const fullSlateDiv = document.createElement('div');
      fullSlateDiv.style.background = 'white';
      fullSlateDiv.style.padding = '30px';
      fullSlateDiv.style.width = '1650px';
      
      let fullSlateHTML = `
        <div style="font-family: Helvetica, Arial, sans-serif;">
          <h1 style="text-align: center; margin-bottom: 5px; font-size: 28px;">NBA Picks - Full Slate Analysis</h1>
          <p style="text-align: center; color: #666; margin-bottom: 25px; font-size: 14px;"><strong>Date:</strong> ${today}</p>
          <h2 style="font-size: 20px; margin-bottom: 15px;">Full Slate Projections</h2>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #bdc3c7;">
            <thead>
              <tr style="background: #2c3e50; color: white;">
                <th style="padding: 10px; text-align: left; border: 1px solid #bdc3c7; font-size: 11px;">Game</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Conf.</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Model Pick</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Model Spread</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Model Total</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Win %</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Vegas Spread</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Vegas Total</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      predictions.forEach((pred, idx) => {
        const bgColor = idx % 2 === 0 ? '#ffffff' : '#ecf0f1';
        const confidence = pred.prediction?.confidence || 0;
        const favoriteTeam = pred.prediction?.winProbability?.favoriteTeam || '';
        const spread = pred.prediction?.spread?.prediction || 0;
        const total = pred.prediction?.total?.prediction || 0;
        const favoritePercent = pred.prediction?.winProbability?.favoritePercent || 0;
        const vegasSpread = pred.vegasLines?.spread?.display || 'N/A';
        const vegasTotal = pred.vegasLines?.total?.line || 'N/A';
        
        fullSlateHTML += `
          <tr style="background: ${bgColor};">
            <td style="padding: 8px; border: 1px solid #bdc3c7; font-size: 10px;">${pred.game}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${confidence}%</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${favoriteTeam}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${spread.toFixed(1)}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${total.toFixed(1)}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${favoritePercent.toFixed(1)}%</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${vegasSpread}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${vegasTotal}</td>
          </tr>
        `;
      });
      
      fullSlateHTML += `
            </tbody>
          </table>
        </div>
      `;
      
      fullSlateDiv.innerHTML = fullSlateHTML;
      container.appendChild(fullSlateDiv);
      
      // Generate Full Slate PNG
      const fullSlateCanvas = await html2canvas(fullSlateDiv, { scale: 2, backgroundColor: '#ffffff' });
      await saveCanvasAsPNG(fullSlateCanvas, `nba_picks_full_slate_${new Date().toISOString().split('T')[0]}.png`);
      
      // Cleanup
      document.body.removeChild(container);
      
    } catch (err) {
      console.error('PNG export error:', err);
      alert('Failed to generate Full Slate PNG. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportRecommendedPNG = async () => {
    setExporting(true);
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      });
      
      // Create hidden container for table
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);
      
      // ===== RECOMMENDED PICKS WITH STAKES =====
      const picksDiv = document.createElement('div');
      picksDiv.style.background = 'white';
      picksDiv.style.padding = '30px';
      picksDiv.style.width = '1650px';
      
      // Collect all bets with categories
      const allBets = [];
      predictions.forEach(pred => {
        pred.opportunities?.forEach(opp => {
          // For totals, edgePercent is tiny (pts/line*100), use edge in pts instead
          const isTotalMkt = opp.market === 'Total' || opp.market?.startsWith('Team Total');
          const edgeVal = isTotalMkt ? parseFloat(opp.edge) || 0 : (opp.edgePercent || opp.edge || 0);
          const category = edgeVal > 5 ? 'STRONG' : opp.units === 0 ? 'TRACK' : 'CONSIDER';
          const oddsStr = opp.odds > 0 ? `+${opp.odds}` : `${opp.odds}`;
          
          // New V2 hedge/double-down fields
          const hedgeBet = opp.hedgeBet;
          const doubleDownBet = opp.doubleDownBet;
          const stakeGuidance = opp.stakeGuidance;

          let pickHtml = (opp.market === 'Moneyline' && opp.modelWinProb)
            ? `${opp.pick} (${opp.modelWinProb})`
            : `${opp.pick}`;

          // Add optional details (note + hedge/DD + stake guidance) as subtle sub-lines.
          if (opp.note) {
            pickHtml += `<div style="margin-top: 2px; font-size: 10px; line-height: 1.2; color: #555;">${opp.note}</div>`;
          }
          
          // V2 Hedge
          if (hedgeBet) {
            const hedgeOddsStr = hedgeBet.odds > 0 ? `+${hedgeBet.odds}` : `${hedgeBet.odds}`;
            pickHtml += `<div style="margin-top: 3px; font-size: 10px; line-height: 1.2; color: #b8860b;"><strong>⚖️ HEDGE:</strong> ${hedgeBet.market}: ${hedgeBet.pick} (${hedgeOddsStr}) - ${hedgeBet.units?.toFixed(1)}U</div>`;
          }
          
          // V2 Double Down
          if (doubleDownBet) {
            const ddOddsStr = doubleDownBet.odds > 0 ? `+${doubleDownBet.odds}` : `${doubleDownBet.odds}`;
            pickHtml += `<div style="margin-top: 3px; font-size: 10px; line-height: 1.2; color: #228b22;"><strong>🎯 DD:</strong> ${doubleDownBet.market}: ${doubleDownBet.pick} (${ddOddsStr}) - ${doubleDownBet.units?.toFixed(1)}U</div>`;
          }
          
          // Stake guidance
          if (stakeGuidance && (hedgeBet || doubleDownBet)) {
            pickHtml += `<div style="margin-top: 2px; font-size: 9px; line-height: 1.2; color: #666;">📊 ${stakeGuidance}</div>`;
          }
          
          allBets.push({
            category,
            game: pred.game,
            betType: opp.market,
            pick: pickHtml,
            edge: edgeVal.toFixed ? edgeVal.toFixed(1) : edgeVal,
            odds: oddsStr,
            book: opp.book,
            stake: opp.units === 0 ? '0.0U' : `${opp.units.toFixed(1)}U`,
            hedgeUnits: hedgeBet?.units || 0,
            ddUnits: doubleDownBet?.units || 0
          });
        });
      });
      
      // Calculate summaries (include hedge/DD units)
      const strongBets = allBets.filter(b => b.category === 'STRONG');
      const considerBets = allBets.filter(b => b.category === 'CONSIDER');
      const trackBets = allBets.filter(b => b.category === 'TRACK');
      
      const strongUnits = strongBets.reduce((sum, b) => sum + parseFloat(b.stake) + (b.hedgeUnits || 0) + (b.ddUnits || 0), 0);
      const considerUnits = considerBets.reduce((sum, b) => sum + parseFloat(b.stake) + (b.hedgeUnits || 0) + (b.ddUnits || 0), 0);
      const totalActiveBets = strongBets.length + considerBets.length;
      const totalActiveUnits = strongUnits + considerUnits;
      
      // Collect game-level adjustment notes (roster turbulence, trade deadline, early season)
      const gameAdjustmentNotes = [];
      predictions.forEach(pred => {
        if (pred.prediction?.adjustmentNotes?.length > 0) {
          pred.prediction.adjustmentNotes.forEach(note => {
            if (!gameAdjustmentNotes.includes(note)) {
              gameAdjustmentNotes.push(note);
            }
          });
        }
      });
      
      let picksHTML = `
        <div style="font-family: Helvetica, Arial, sans-serif;">
          <h2 style="font-size: 20px; margin-bottom: 10px;">Recommended Picks with Stakes</h2>
          <p style="font-size: 12px; margin-bottom: 15px;">
            <strong>Color Key:</strong> 
            🟢 <span style="color: #155724; font-weight: bold;">GREEN</span> = High Confidence / Strong Bet | 
            🟡 <span style="color: #856404; font-weight: bold;">YELLOW</span> = Consider | 
            🔴 <span style="color: #721c24; font-weight: bold;">RED</span> = Track Only
          </p>
          ${gameAdjustmentNotes.length > 0 ? `
          <div style="padding: 10px; margin-bottom: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 11px; color: #856404;">
            <strong>⚠️ Active Adjustments:</strong><br/>
            ${gameAdjustmentNotes.map(note => `• ${note}`).join('<br/>')}
          </div>
          ` : ''}
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #bdc3c7; table-layout: fixed;">
            <thead>
              <tr style="background: #2c3e50; color: white;">
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Category</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #bdc3c7; font-size: 11px;">Game</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Bet Type</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #bdc3c7; font-size: 11px; width: 330px;">Pick</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Edge</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Odds</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #bdc3c7; font-size: 11px;">Book</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      allBets.forEach(bet => {
        let bgColor, textColor;
        if (bet.category === 'STRONG') {
          bgColor = '#d4edda';
          textColor = '#155724';
        } else if (bet.category === 'CONSIDER') {
          bgColor = '#fff3cd';
          textColor = '#856404';
        } else {
          bgColor = '#f8d7da';
          textColor = '#721c24';
        }
        
        picksHTML += `
          <tr style="background: ${bgColor};">
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-weight: bold; color: ${textColor}; font-size: 10px;">${bet.category}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; font-size: 10px;">${bet.game}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${bet.betType}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; font-size: 10px; line-height: 1.25; white-space: normal; word-break: break-word;">${bet.pick}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${bet.edge}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${bet.odds}</td>
            <td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; font-size: 10px;">${bet.book}</td>
          </tr>
        `;
      });
      
      picksHTML += `
            </tbody>
          </table>
          <div style="margin-top: 20px; font-size: 12px; line-height: 1.8;">
            <strong>Summary:</strong><br/>
            • Total Strong Bets: ${strongBets.length} picks | Total Units: ${strongUnits.toFixed(1)}U<br/>
            • Total Consider Bets: ${considerBets.length} picks | Total Units: ${considerUnits.toFixed(1)}U<br/>
            • Total Track Only: ${trackBets.length} picks | Total Units: 0.0U<br/>
            <strong>Total Action: ${totalActiveBets} active picks | ${totalActiveUnits.toFixed(1)} Units</strong>
          </div>
        </div>
      `;
      
      picksDiv.innerHTML = picksHTML;
      container.appendChild(picksDiv);
      
      // Generate Picks PNG
      const picksCanvas = await html2canvas(picksDiv, { scale: 2, backgroundColor: '#ffffff' });
      await saveCanvasAsPNG(picksCanvas, `nba_picks_recommended_${new Date().toISOString().split('T')[0]}.png`);
      
      // Cleanup
      document.body.removeChild(container);
      
    } catch (err) {
      console.error('PNG export error:', err);
      alert('Failed to generate PNG. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const renderGame = (pred) => {
    const confidence = pred.prediction?.confidence || 0;
    const confidenceClass = confidence > 65 ? 'HIGH' : confidence > 50 ? 'MEDIUM' : 'LOW';
    
    // Extract values from nested structure
    const spread = pred.prediction?.spread?.prediction || 0;
    const total = pred.prediction?.total?.prediction || 0;
    const homeWinProb = pred.prediction?.winProbability?.home || 0;
    const favoriteTeam = pred.prediction?.winProbability?.favoriteTeam || pred.teams?.home?.abbreviation || '';
    const favoritePercent = pred.prediction?.winProbability?.favoritePercent || 0;
    
    // Use display strings from API
    const spreadDisplay = pred.prediction?.spread?.display || `${spread.toFixed(1)}`;
    
    // Determine pick recommendation with team abbreviations
    const pickSummary = `Model Pick: ${spreadDisplay} (${favoriteTeam} ${favoritePercent.toFixed(1)}% win prob)`;
    
    // Process betting opportunities - split into recommended and edge bets
    const recommendedBets = [];
    const edgeBets = [];
    
    pred.opportunities?.forEach((opp, idx) => {
      // Format pick with win probability for moneyline bets
      const pickDisplay = opp.market === 'Moneyline' && opp.modelWinProb 
        ? `${opp.pick} (${opp.modelWinProb})` 
        : opp.pick;
      
      // Format units display
      const unitsDisplay = opp.units !== undefined 
        ? opp.units === 0 
          ? 'Rec: 0.0U (track only)' 
          : `Rec: ${opp.units.toFixed(1)}U`
        : null;
      
      // New V2 hedge/double-down fields
      const hedgeBet = opp.hedgeBet;
      const doubleDownBet = opp.doubleDownBet;
      const stakeGuidance = opp.stakeGuidance;
      const hedgingNotes = opp.hedgingNotes;
      
      const betCard = (
        <div key={idx} className="bet-card">
          {/* PRIMARY BET */}
          <div style={{ marginBottom: hedgeBet || doubleDownBet ? '10px' : '0' }}>
            <strong>{opp.market}: {pickDisplay}</strong>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
              <span>Edge: <span className="edge-value">{
                (opp.market === 'Total' || opp.market?.startsWith('Team Total'))
                  ? `${opp.edge} pts`
                  : `${opp.edgePercent?.toFixed(1) || opp.edge}%`
              }</span></span>
              <span>Odds: {opp.odds > 0 ? '+' : ''}{opp.odds}</span>
              <span>{opp.book}</span>
            </div>
            {unitsDisplay && <div style={{ color: opp.units === 0 ? '#888' : '#00ff88', fontSize: '12px' }}>{unitsDisplay}</div>}
          </div>

          {opp.note && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#cbd5e1' }}>
              {opp.note}
            </div>
          )}

          {/* HEDGE BET (V2) */}
          {hedgeBet && (
            <div style={{ 
              marginTop: '10px', 
              paddingTop: '10px', 
              borderTop: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255, 193, 7, 0.1)',
              padding: '10px',
              borderRadius: '6px'
            }}>
              <div style={{ fontSize: '12px', color: '#ffc107', fontWeight: 700, marginBottom: '4px' }}>
                ⚖️ HEDGE ({hedgeBet.hedgeStakePct || '25%'} of primary)
              </div>
              <div style={{ fontSize: '13px' }}>
                <strong>{hedgeBet.market}: {hedgeBet.pick}</strong>
                <span style={{ marginLeft: '10px' }}>
                  Odds: {hedgeBet.odds > 0 ? '+' : ''}{hedgeBet.odds}
                </span>
                <span style={{ marginLeft: '10px', color: '#ffc107' }}>
                  {hedgeBet.units?.toFixed(1)}U
                </span>
              </div>
              {hedgeBet.notes && (
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>
                  {hedgeBet.notes}
                </div>
              )}
            </div>
          )}

          {/* DOUBLE DOWN BET (V2) */}
          {doubleDownBet && (
            <div style={{ 
              marginTop: '10px', 
              paddingTop: '10px', 
              borderTop: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0, 255, 136, 0.1)',
              padding: '10px',
              borderRadius: '6px'
            }}>
              <div style={{ fontSize: '12px', color: '#00ff88', fontWeight: 700, marginBottom: '4px' }}>
                🎯 DOUBLE DOWN ({doubleDownBet.sprinklePct || '20%'} sprinkle)
              </div>
              <div style={{ fontSize: '13px' }}>
                <strong>{doubleDownBet.market}: {doubleDownBet.pick}</strong>
                <span style={{ marginLeft: '10px' }}>
                  Odds: {doubleDownBet.odds > 0 ? '+' : ''}{doubleDownBet.odds}
                </span>
                <span style={{ marginLeft: '10px', color: '#00ff88' }}>
                  {doubleDownBet.units?.toFixed(1)}U
                </span>
              </div>
              {doubleDownBet.notes && (
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>
                  {doubleDownBet.notes}
                </div>
              )}
            </div>
          )}

          {/* STAKE GUIDANCE */}
          {stakeGuidance && (hedgeBet || doubleDownBet) && (
            <div style={{ 
              marginTop: '8px', 
              fontSize: '12px', 
              color: '#cbd5e1',
              fontStyle: 'italic'
            }}>
              📊 Stake: {stakeGuidance}
            </div>
          )}

          {/* HEDGING NOTES */}
          {hedgingNotes && (
            <div style={{ 
              marginTop: '4px', 
              fontSize: '11px', 
              color: '#888'
            }}>
              {hedgingNotes}
            </div>
          )}

        </div>
      );
      
      // For totals, use edge in points for threshold check
      const isTotalMarket = opp.market === 'Total' || opp.market?.startsWith('Team Total');
      const edgeCheck = isTotalMarket ? parseFloat(opp.edge) || 0 : (opp.edgePercent || opp.edge);
      if (edgeCheck > 5) {
        recommendedBets.push(betCard);
      } else {
        edgeBets.push(betCard);
      }
    });

    return (
      <div key={pred.gameId} className="game">
        <div className="game-header">
          {pred.game}
          <span className={`confidence ${confidenceClass}`}>{confidence}% Confidence</span>
        </div>
        
        <div className="pick-summary">{pickSummary}</div>
        
        {/* Adjustment notes (roster turbulence, trade deadline, early season) */}
        {pred.prediction?.adjustmentNotes?.length > 0 && (
          <div style={{ 
            padding: '8px 12px', 
            margin: '8px 0', 
            background: 'rgba(255, 193, 7, 0.15)', 
            borderLeft: '3px solid #ffc107',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#ffc107'
          }}>
            {pred.prediction.adjustmentNotes.map((note, i) => (
              <div key={i} style={{ marginBottom: i < pred.prediction.adjustmentNotes.length - 1 ? '4px' : 0 }}>
                ⚠️ {note}
              </div>
            ))}
          </div>
        )}
        
        <div className="prediction">
          <div className="stat">
            <div className="stat-label">Predicted Spread</div>
            <div className="stat-value">{spreadDisplay}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Predicted Total</div>
            <div className="stat-value">{total.toFixed(1)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{favoriteTeam} Win Prob</div>
            <div className="stat-value">{favoritePercent.toFixed(1)}%</div>
          </div>
          <div className="stat">
            <div className="stat-label">Data Source</div>
            <div className="stat-value" style={{ fontSize: '14px' }}>
              ESPN + NBA CDN<br />
              <span style={{ color: '#00ff88', fontSize: '12px' }}>✅ Live 2025-26</span>
            </div>
          </div>
        </div>
        
        {pred.vegasLines && (
          <div className="vegas-info">
            <div className="vegas-stat">
              <div className="vegas-label">Vegas Spread</div>
              <div className="vegas-value">{pred.vegasLines.spread?.display || 'N/A'}</div>
            </div>
            <div className="vegas-stat">
              <div className="vegas-label">Vegas Total</div>
              <div className="vegas-value">{pred.vegasLines.total?.line || 'N/A'}</div>
            </div>
            <div className="vegas-stat">
              <div className="vegas-label">{pred.teams?.home?.abbreviation || 'Home'} ML</div>
              <div className="vegas-value">
                {pred.vegasLines.moneyline?.homeDisplay || 'N/A'}
              </div>
            </div>
            <div className="vegas-stat">
              <div className="vegas-label">{pred.teams?.away?.abbreviation || 'Away'} ML</div>
              <div className="vegas-value">
                {pred.vegasLines.moneyline?.awayDisplay || 'N/A'}
              </div>
            </div>
          </div>
        )}
        
        {recommendedBets.length > 0 && (
          <div className="recommendations">
            <div className="rec-header">🎯 Recommended Bets</div>
            {recommendedBets}
          </div>
        )}
        
        {edgeBets.length > 0 && (
          <div className="edge-bets">
            <div className="edge-header">📊 Edge Bets to Consider</div>
            {edgeBets}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="nba-v2-container">
      <style jsx>{`
        .nba-v2-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          background: #0a0e27;
          color: #fff;
          border-radius: 8px;
        }
        h1 {
          color: #00ff88;
          text-align: center;
          margin-bottom: 10px;
        }
        .subtitle {
          text-align: center;
          color: #888;
          margin-bottom: 30px;
        }
        .loading {
          text-align: center;
          padding: 40px;
          font-size: 18px;
        }
        .error {
          background: #ff4444;
          color: white;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .game {
          background: #1a1f3a;
          border-radius: 12px;
          padding: 20px;
          margin: 15px 0;
          border-left: 4px solid #00ff88;
        }
        .game-header {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 15px;
        }
        .prediction {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin: 15px 0;
        }
        .stat {
          background: #0f1629;
          padding: 12px;
          border-radius: 6px;
        }
        .stat-label {
          color: #888;
          font-size: 12px;
          text-transform: uppercase;
        }
        .stat-value {
          font-size: 24px;
          font-weight: bold;
          color: #00ff88;
        }
        .recommendations {
          margin-top: 20px;
          padding: 15px;
          background: #0f1629;
          border-radius: 8px;
          border-left: 3px solid #00ff88;
        }
        .rec-header {
          color: #00ff88;
          font-weight: bold;
          margin-bottom: 10px;
          font-size: 16px;
        }
        .edge-bets {
          margin-top: 20px;
          padding: 15px;
          background: #0f1629;
          border-radius: 8px;
          border-left: 3px solid #ffa500;
        }
        .edge-header {
          color: #ffa500;
          font-weight: bold;
          margin-bottom: 10px;
          font-size: 16px;
        }
        .bet-card {
          background: #1a1f3a;
          padding: 10px;
          margin: 8px 0;
          border-radius: 6px;
        }
        .edge-value {
          color: #00ff88;
          font-weight: bold;
        }
        .pick-summary {
          font-size: 18px;
          font-weight: bold;
          color: #00ff88;
          margin-bottom: 15px;
        }
        .vegas-info {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
          margin-top: 10px;
        }
        .vegas-stat {
          background: #0a0e27;
          padding: 8px;
          border-radius: 4px;
          text-align: center;
        }
        .vegas-label {
          color: #888;
          font-size: 11px;
        }
        .vegas-value {
          color: #fff;
          font-weight: bold;
        }
        .edge-positive { 
          color: #00ff88; 
        }
        .confidence {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          margin-left: 10px;
        }
        .confidence.HIGH { 
          background: #00ff88; 
          color: #000; 
        }
        .confidence.MEDIUM { 
          background: #ffa500; 
          color: #000; 
        }
        .confidence.LOW { 
          background: #ff4444; 
          color: #fff; 
        }
        .version-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #1a1e3a;
          padding: 6px 12px;
          border-radius: 20px;
          margin-left: 15px;
          font-size: 13px;
        }
        .version-toggle label {
          cursor: pointer;
          user-select: none;
        }
        .version-toggle input[type="checkbox"] {
          width: 40px;
          height: 20px;
          appearance: none;
          background: #333;
          border-radius: 10px;
          position: relative;
          cursor: pointer;
          transition: background 0.2s;
        }
        .version-toggle input[type="checkbox"]:checked {
          background: #00ff88;
        }
        .version-toggle input[type="checkbox"]::before {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: transform 0.2s;
        }
        .version-toggle input[type="checkbox"]:checked::before {
          transform: translateX(20px);
        }
        .version-badge {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: bold;
        }
        .version-badge.v2 {
          background: #666;
          color: #fff;
        }
        .version-badge.v21 {
          background: #00ff88;
          color: #000;
        }
      `}</style>
      
      <h1>🏀 NBA Elite {useV21 ? 'V2.1' : 'V2'} Predictions</h1>
      <div className="subtitle">
        Powered by ESPN + NBA CDN • Live L5/L10/L20 Data • {useV21 ? '⭐ Production Share Injury Weighting' : 'Position-Based Injury Weighting'}
        
        <div className="version-toggle">
          <span className={`version-badge ${useV21 ? 'v2' : 'v21'}`}>V2</span>
          <input 
            type="checkbox" 
            checked={useV21} 
            onChange={(e) => setUseV21(e.target.checked)}
            disabled={loading}
          />
          <span className={`version-badge ${useV21 ? 'v21' : 'v2'}`}>V2.1</span>
          <span style={{ color: '#888', fontSize: '11px' }}>
            {useV21 ? '(Star players weighted by production share)' : '(Position-only weights)'}
          </span>
        </div>
        
        <button 
          onClick={loadPredictions} 
          disabled={loading}
          style={{
            marginLeft: '15px',
            padding: '8px 16px',
            background: loading ? '#555' : '#00ff88',
            color: '#000',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          {loading ? '⟳ Loading...' : '🔄 Refresh'}
        </button>
        <button 
          onClick={exportFullSlatePNG} 
          disabled={exporting || loading || !predictions.length}
          style={{
            marginLeft: '10px',
            padding: '8px 16px',
            background: (exporting || loading || !predictions.length) ? '#555' : '#ffa500',
            color: '#000',
            border: 'none',
            borderRadius: '6px',
            cursor: (exporting || loading || !predictions.length) ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          {exporting ? '⟳ Generating...' : '📊 Export Full Slate'}
        </button>
        <button 
          onClick={exportRecommendedPNG} 
          disabled={exporting || loading || !predictions.length}
          style={{
            marginLeft: '10px',
            padding: '8px 16px',
            background: (exporting || loading || !predictions.length) ? '#555' : '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: (exporting || loading || !predictions.length) ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          {exporting ? '⟳ Generating...' : '⭐ Export Recommended'}
        </button>
      </div>

      {loading && (
        <div className="loading">Loading predictions...</div>
      )}

      {error && (
        <div className="error">
          <strong>Error:</strong><br />
          {error}
        </div>
      )}

      {!loading && !error && predictions.map(renderGame)}
    </div>
  );
};

export default NBAPredictionsV2;