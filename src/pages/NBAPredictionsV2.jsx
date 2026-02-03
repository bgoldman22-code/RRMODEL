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

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      // Add cache-busting parameter to force fresh data
      const timestamp = Date.now();
      const response = await fetch(`/.netlify/functions/nba-predictions-elite-v2?_t=${timestamp}`);
      const data = await response.json();

      if (!data.ok || !data.predictions || data.predictions.length === 0) {
        setError(data.message || 'No games available');
        return;
      }

      setPredictions(data.predictions);
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
          const category = opp.edgePercent > 5 ? 'STRONG' : opp.units === 0 ? 'TRACK' : 'CONSIDER';
          const oddsStr = opp.odds > 0 ? `+${opp.odds}` : `${opp.odds}`;
          const hedge = opp.secondaryBet;
          const hedgeOddsStr = hedge ? (hedge.odds > 0 ? `+${hedge.odds}` : `${hedge.odds}`) : '';

          let pickHtml = (opp.market === 'Moneyline' && opp.modelWinProb)
            ? `${opp.pick} (${opp.modelWinProb})`
            : `${opp.pick}`;

          // Add optional details (note + hedge leg + split guidance) as subtle sub-lines.
          if (opp.note) {
            pickHtml += `<div style="margin-top: 2px; font-size: 10px; line-height: 1.2; color: #555;">${opp.note}</div>`;
          }
          if (hedge) {
            pickHtml += `<div style="margin-top: 3px; font-size: 10px; line-height: 1.2; color: #6b4f00;"><strong>Hedge:</strong> ${hedge.market}: ${hedge.pick} (${hedgeOddsStr})</div>`;
            if (opp.splitGuidance) {
              pickHtml += `<div style="margin-top: 1px; font-size: 10px; line-height: 1.2; color: #555;">Split: ${opp.splitGuidance}</div>`;
            }
          }
          allBets.push({
            category,
            game: pred.game,
            betType: opp.market,
            pick: pickHtml,
            edge: opp.edge,
            odds: oddsStr,
            book: opp.book,
            stake: opp.units === 0 ? '0.0U' : `${opp.units.toFixed(1)}U`
          });
        });
      });
      
      // Calculate summaries
      const strongBets = allBets.filter(b => b.category === 'STRONG');
      const considerBets = allBets.filter(b => b.category === 'CONSIDER');
      const trackBets = allBets.filter(b => b.category === 'TRACK');
      
      const strongUnits = strongBets.reduce((sum, b) => sum + parseFloat(b.stake), 0);
      const considerUnits = considerBets.reduce((sum, b) => sum + parseFloat(b.stake), 0);
      const totalActiveBets = strongBets.length + considerBets.length;
      const totalActiveUnits = strongUnits + considerUnits;
      
      let picksHTML = `
        <div style="font-family: Helvetica, Arial, sans-serif;">
          <h2 style="font-size: 20px; margin-bottom: 10px;">Recommended Picks with Stakes</h2>
          <p style="font-size: 12px; margin-bottom: 15px;">
            <strong>Color Key:</strong> 
            🟢 <span style="color: #155724; font-weight: bold;">GREEN</span> = High Confidence / Strong Bet | 
            🟡 <span style="color: #856404; font-weight: bold;">YELLOW</span> = Consider | 
            🔴 <span style="color: #721c24; font-weight: bold;">RED</span> = Track Only
          </p>
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
      
      const hedge = opp.secondaryBet;
      const betCard = (
        <div key={idx} className="bet-card">
          <strong>{opp.market}: {pickDisplay}</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
            <span>Edge: <span className="edge-value">{opp.edge}%</span></span>
            <span>Odds: {opp.odds > 0 ? '+' : ''}{opp.odds}</span>
            <span>{opp.book}</span>
          </div>
          {unitsDisplay && <div style={{ color: opp.units === 0 ? '#888' : '#00ff88', fontSize: '12px' }}>{unitsDisplay}</div>}

          {opp.note && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#cbd5e1' }}>
              {opp.note}
            </div>
          )}

          {hedge && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ fontSize: '12px', color: '#ffd166', fontWeight: 700 }}>
                Hedge / Parlay Leg
              </div>
              <div style={{ fontSize: '13px', marginTop: '2px' }}>
                <strong>{hedge.market}: {hedge.pick}</strong>
                <span style={{ marginLeft: '10px' }}>
                  Odds: {hedge.odds > 0 ? '+' : ''}{hedge.odds}
                </span>
              </div>
              {opp.splitGuidance && (
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                  Suggested split: {opp.splitGuidance}
                </div>
              )}
            </div>
          )}
        </div>
      );
      
      if (opp.edge > 5) {
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
      `}</style>
      
      <h1>🏀 NBA Elite V2 Predictions</h1>
      <div className="subtitle">
        Powered by ESPN + NBA CDN • Live L5/L10/L20 Data • No GitHub Dependencies
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