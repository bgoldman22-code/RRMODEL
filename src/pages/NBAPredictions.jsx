import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './NBAPredictions.css';

/**
 * NBA Predictions - Elite Pro Bettor Interface (v2.0)
 * 
 * Features:
 * - Real-time predictions with confidence scores
 * - Market inefficiency scanner
 * - Kelly criterion bet sizing
 * - Correlation matrix visualization
 * - Live odds tracking
 * - Bet ladder optimizer
 * - Unit-based betting (no personal bankroll displayed)
 * 
 * Unit System:
 * - $10/unit (based on $5000 bankroll = 500 units)
 * - 1-5 unit recommendations
 * - Users apply to their own bankroll size
 */

const NBAPredictions = () => {
  const [searchParams] = useSearchParams();
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'predictions'); // predictions, inefficiencies, kelly, analytics
  const [preseasonMessage, setPreseasonMessage] = useState(null);
  
  // Unit-based betting (remove personal bankroll)
  const UNIT_VALUE = 10; // $10 per unit (based on $5000 bankroll)
  const BANKROLL_UNITS = 500; // Total units in bankroll
  
  /**
   * Calculate Kelly Criterion bet sizing for totals
   */
  const calculateTotalKelly = (modelTotal, vegasLine, overOdds, underOdds) => {
    if (!modelTotal || !vegasLine) return null;
    
    const edge = Math.abs(modelTotal - vegasLine);
    if (edge < 1.5) return null; // Need at least 1.5 point edge
    
    // Determine pick (over or under)
    const isOver = modelTotal > vegasLine;
    const americanOdds = isOver ? overOdds : underOdds;
    
    // Convert American odds to decimal
    const decimalOdds = americanOdds > 0 
      ? (americanOdds / 100) + 1 
      : (100 / Math.abs(americanOdds)) + 1;
    
    // Estimate win probability based on edge
    // Simple model: 50% baseline + (edge * 3%)
    const estimatedWinProb = 0.50 + (edge * 0.03);
    const clampedProb = Math.min(0.70, Math.max(0.52, estimatedWinProb));
    
    // Kelly formula: (bp - q) / b
    // where b = decimal odds - 1, p = win prob, q = 1 - p
    const b = decimalOdds - 1;
    const p = clampedProb;
    const q = 1 - p;
    const kellyFraction = (b * p - q) / b;
    
    // Only bet if Kelly is positive
    if (kellyFraction <= 0) return null;
    
    // Use fractional Kelly (0.25) for safety
    const fractionalKelly = kellyFraction * 0.25;
    const units = Math.min(5, Math.max(0.5, fractionalKelly * BANKROLL_UNITS));
    
    return {
      pick: isOver ? 'OVER' : 'UNDER',
      line: vegasLine,
      edge: edge.toFixed(1),
      units: units.toFixed(1),
      confidence: (clampedProb * 100).toFixed(1),
      odds: americanOdds
    };
  };
  const IMPLIED_BANKROLL = UNIT_VALUE * BANKROLL_UNITS; // $5000 for calculations only
  
  const [inefficiencies, setInefficiencies] = useState([]);
  const [kellyPortfolio, setKellyPortfolio] = useState(null);
  const [betLadder, setBetLadder] = useState(null);
  const [correlations, setCorrelations] = useState(null);
  const [sortBy, setSortBy] = useState('confidence');
  const [filterOpportunity, setFilterOpportunity] = useState('ALL');

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/.netlify/functions/nba-predictions-elite');
      const data = await response.json();
      
      if (data.ok) {
        // Transform backend data to frontend format
        const transformedPredictions = (data.predictions || []).map(pred => ({
          ...pred,
          // Map opportunities to recommendations format
          recommendations: (pred.opportunities || []).map(opp => ({
            market: opp.market,
            pick: opp.pick,
            line: opp.odds || opp.vegasLine || '',
            edgePercent: opp.edgePercent || Math.abs(opp.edge || 0),
            edge: opp.edge,
            units: opp.units || (opp.edgePercent > 10 ? 5 : opp.edgePercent > 7 ? 4 : opp.edgePercent > 5 ? 3 : opp.edgePercent > 3 ? 2 : 1),
            rating: '⭐'.repeat(opp.units || (opp.edgePercent > 10 ? 5 : opp.edgePercent > 7 ? 4 : opp.edgePercent > 5 ? 3 : opp.edgePercent > 3 ? 2 : 1)),
            betSize: opp.betSize,
            book: opp.book,
            modelLine: opp.modelLine,
            vegasLine: opp.vegasLine
          })),
          // Map vegasLines to marketOdds format
          marketOdds: pred.vegasLines ? {
            spread: pred.vegasLines.spread ? `${pred.vegasLines.spread.line} (${pred.vegasLines.spread.price > 0 ? '+' : ''}${pred.vegasLines.spread.price})` : 'N/A',
            total: pred.vegasLines.total ? `${pred.vegasLines.total.line} (O: ${pred.vegasLines.total.overPrice > 0 ? '+' : ''}${pred.vegasLines.total.overPrice} / U: ${pred.vegasLines.total.underPrice > 0 ? '+' : ''}${pred.vegasLines.total.underPrice})` : 'N/A',
            moneyline: pred.vegasLines.moneyline ? `${pred.teams?.home?.abbreviation || 'HOME'}: ${pred.vegasLines.moneyline.home > 0 ? '+' : ''}${pred.vegasLines.moneyline.home} / ${pred.teams?.away?.abbreviation || 'AWAY'}: ${pred.vegasLines.moneyline.away > 0 ? '+' : ''}${pred.vegasLines.moneyline.away}` : 'N/A'
          } : null
        }));
        
        // If preseason, display picks for UI/UX but exclude from analytics
        if (data.isPreseason) {
          setPreseasonMessage({
            message: data.preseasonWarning || 'Preseason – For Display Only. These picks do NOT affect model training, analytics, or bankroll. Use for UI/UX and curiosity only.',
            ...data
          });
          setPredictions(transformedPredictions);
          // Only process analytics on regular season games
          processAnalytics(transformedPredictions.filter(p => !p.isPreseason));
        } else {
          setPreseasonMessage(null);
          setPredictions(transformedPredictions);
          processAnalytics(transformedPredictions);
        }
      }
    } catch (error) {
      console.error('Error loading predictions:', error);
    }
    setLoading(false);
  };

  const processAnalytics = (preds) => {
    // Market inefficiencies
    const ineff = scanInefficiencies(preds);
    setInefficiencies(ineff);
    
    // Kelly portfolio (uses implied bankroll for calculations)
    const kelly = optimizeKelly(ineff, IMPLIED_BANKROLL);
    setKellyPortfolio(kelly);
    
    // Bet ladder (uses implied bankroll for calculations)
    const ladder = generateLadder(ineff, IMPLIED_BANKROLL);
    setBetLadder(ladder);
  };

  const scanInefficiencies = (preds) => {
    const ineffs = [];
    
    for (const pred of preds) {
      // Extract inefficiencies from opportunities
      if (pred.opportunities && pred.opportunities.length > 0) {
        for (const opp of pred.opportunities) {
          // Only include opportunities with significant edge (3+ points or 5%+)
          const edgeValue = Math.abs(typeof opp.edge === 'number' ? opp.edge : parseFloat(opp.edge) || 0);
          const edgePercent = opp.edgePercent || 0;
          
          if (edgeValue >= 3 || edgePercent >= 5) {
            ineffs.push({
              ...pred,
              market: opp.market,
              edge: edgeValue,
              edgePercent: edgePercent,
              pick: opp.pick,
              modelLine: opp.modelLine,
              vegasLine: opp.vegasLine,
              units: opp.units,
              book: opp.book,
              betSize: opp.betSize,
              kelly: opp.kelly
            });
          }
        }
      }
    }
    
    return ineffs.sort((a, b) => b.edgePercent - a.edgePercent);
  };

  const optimizeKelly = (opportunities, bankrollAmount) => {
    const bets = [];
    
    for (const opp of opportunities.slice(0, 10)) {
      const winProb = 0.5 + (opp.edgePercent / 100);
      const kelly = (0.91 * winProb - 0.09) / 0.91;
      const fractionalKelly = Math.max(0, Math.min(kelly * 0.25, 0.05));
      
      if (fractionalKelly > 0.005) {
        const dollarAmount = fractionalKelly * bankrollAmount;
        const units = dollarAmount / UNIT_VALUE;
        
        bets.push({
          ...opp,
          kelly: fractionalKelly,
          units: Math.round(units * 10) / 10, // Round to 0.1 units
          stake: Math.round(dollarAmount) // Keep for internal calculations
        });
      }
    }
    
    return { bets, total: bets.reduce((sum, b) => sum + b.stake, 0) };
  };  const generateLadder = (opportunities, bankrollAmount) => {
    const bets = opportunities.slice(0, 15).map(opp => {
      const units = opp.edgePercent > 10 ? 5 :
                    opp.edgePercent > 7 ? 4 :
                    opp.edgePercent > 5 ? 3 :
                    opp.edgePercent > 3 ? 2 : 1;
      
      return {
        ...opp,
        units,
        stake: units * UNIT_VALUE, // $10 per unit
        rating: '⭐'.repeat(units)
      };
    });
    
    return { 
      bets, 
      totalStake: bets.reduce((sum, b) => sum + b.stake, 0),
      totalUnits: bets.reduce((sum, b) => sum + b.units, 0)
    };
  };

  const getConfidenceBadge = (confidence) => {
    if (confidence >= 75) return <span className="badge badge-elite">ELITE</span>;
    if (confidence >= 65) return <span className="badge badge-high">HIGH</span>;
    if (confidence >= 55) return <span className="badge badge-medium">MEDIUM</span>;
    return <span className="badge badge-low">LOW</span>;
  };

  const getEdgeBadge = (edgePercent) => {
    if (edgePercent >= 10) return <span className="edge-badge elite">🔥 {edgePercent.toFixed(1)}%</span>;
    if (edgePercent >= 7) return <span className="edge-badge strong">⚡ {edgePercent.toFixed(1)}%</span>;
    if (edgePercent >= 5) return <span className="edge-badge good">✨ {edgePercent.toFixed(1)}%</span>;
    return <span className="edge-badge moderate">→ {edgePercent.toFixed(1)}%</span>;
  };

  if (loading) {
    return (
      <div className="nba-predictions loading">
        <div className="spinner"></div>
        <p>Loading elite NBA predictions...</p>
      </div>
    );
  }

  return (
    <div className="nba-predictions">
      <header className="predictions-header">
        <h1>🏀 NBA Elite Predictions</h1>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-label">Today's Games</span>
            <span className="stat-value">{predictions.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Opportunities</span>
            <span className="stat-value">{inefficiencies.length}</span>
          </div>
        </div>
      </header>

      {preseasonMessage && (
        <div className="preseason-notice" style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '12px',
          margin: '2rem',
          textAlign: 'center',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🏀 {preseasonMessage.message}</h2>
          <p style={{ fontSize: '1.1rem', marginBottom: '1rem', lineHeight: '1.6' }}>
            {preseasonMessage.explanation}
          </p>
          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '1rem', 
            borderRadius: '8px',
            marginTop: '1.5rem'
          }}>
            <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
              <strong>Regular Season Starts:</strong> {preseasonMessage.regularSeasonStart}
            </p>
            <p style={{ fontSize: '0.95rem', opacity: 0.9 }}>
              {preseasonMessage.note}
            </p>
          </div>
          <div style={{ marginTop: '1.5rem', fontSize: '0.9rem', opacity: 0.8 }}>
            <p>Model: {preseasonMessage.modelInfo.type} | MAE: {preseasonMessage.modelInfo.spreadMAE} | Features: {preseasonMessage.modelInfo.features}</p>
          </div>
        </div>
      )}

      <nav className="predictions-nav">
        <button 
          className={activeTab === 'predictions' ? 'active' : ''}
          onClick={() => setActiveTab('predictions')}
        >
          📊 Predictions
        </button>
        <button 
          className={activeTab === 'inefficiencies' ? 'active' : ''}
          onClick={() => setActiveTab('inefficiencies')}
        >
          🎯 Market Inefficiencies
        </button>
        <button 
          className={activeTab === 'kelly' ? 'active' : ''}
          onClick={() => setActiveTab('kelly')}
        >
          💰 Kelly Portfolio
        </button>
        <button 
          className={activeTab === 'ladder' ? 'active' : ''}
          onClick={() => setActiveTab('ladder')}
        >
          📈 Bet Ladder
        </button>
        <button 
          className={activeTab === 'analytics' ? 'active' : ''}
          onClick={() => setActiveTab('analytics')}
        >
          🔬 Analytics
        </button>
      </nav>

      {activeTab === 'predictions' && (
        <div className="predictions-grid">
          {predictions.map((pred, i) => (
            <div key={i} className="prediction-card">
              <div className="card-header">
                <h3>{pred.game}</h3>
                {getConfidenceBadge(pred.confidence)}
              </div>
              
              <div className="prediction-details">
                <div className="detail-row">
                  <span className="label">Predicted Spread:</span>
                  <span className="value">
                    {pred.prediction?.spread?.favorite === 'home' ? 
                      `${pred.teams?.home?.abbreviation || 'HOME'} -${pred.prediction.spread.line}` : 
                      `${pred.teams?.away?.abbreviation || 'AWAY'} -${pred.prediction.spread.line}`}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Predicted Total:</span>
                  <span className="value">{pred.prediction?.total?.prediction?.toFixed(1) || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Home Win Prob:</span>
                  <span className="value">{pred.prediction?.winProbability?.home || 0}%</span>
                </div>
              </div>

              {/* Vegas Lines & Model Comparison */}
              {pred.vegasLines && (
                <div className="vegas-lines">
                  <h4>📊 Vegas Lines & Model</h4>
                  
                  {/* Spread */}
                  {pred.vegasLines.spread && (
                    <div className="line-comparison">
                      <div className="detail-row">
                        <span className="label">Model Spread:</span>
                        <span className="value">
                          {pred.prediction?.spread?.favorite === 'home' ? 
                            `${pred.teams?.home?.abbreviation} -${pred.prediction.spread.line}` : 
                            `${pred.teams?.away?.abbreviation} -${pred.prediction.spread.line}`}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="label">Vegas Spread:</span>
                        <span className="value">
                          {pred.vegasLines.spread.line > 0 ? 
                            `${pred.teams?.away?.abbreviation} -${pred.vegasLines.spread.line}` : 
                            `${pred.teams?.home?.abbreviation} -${Math.abs(pred.vegasLines.spread.line)}`}
                          {' '}
                          ({pred.vegasLines.spread.price > 0 ? '+' : ''}{pred.vegasLines.spread.price})
                          <span className="book-badge">{pred.vegasLines.spread.book}</span>
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Total */}
                  {pred.vegasLines.total && (
                    <div className="line-comparison">
                      <div className="detail-row">
                        <span className="label">Model Total:</span>
                        <span className="value">{pred.prediction?.total?.prediction?.toFixed(1)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="label">Vegas Total:</span>
                        <span className="value">
                          {pred.vegasLines.total.line}
                          {' '}
                          (O: {pred.vegasLines.total.overPrice > 0 ? '+' : ''}{pred.vegasLines.total.overPrice} / U: {pred.vegasLines.total.underPrice > 0 ? '+' : ''}{pred.vegasLines.total.underPrice})
                          <span className="book-badge">{pred.vegasLines.total.book}</span>
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Moneyline */}
                  {pred.vegasLines.moneyline && (
                    <div className="line-comparison">
                      <div className="detail-row">
                        <span className="label">Moneyline:</span>
                        <span className="value">
                          {pred.teams?.home?.abbreviation} {pred.vegasLines.moneyline.home > 0 ? '+' : ''}{pred.vegasLines.moneyline.home} / 
                          {pred.teams?.away?.abbreviation} {pred.vegasLines.moneyline.away > 0 ? '+' : ''}{pred.vegasLines.moneyline.away}
                          <span className="book-badge">{pred.vegasLines.moneyline.book}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Betting Opportunities */}
              {pred.opportunities && pred.opportunities.length > 0 && (
                <div className="recommendations">
                  <h4>🎯 Recommended Bets</h4>
                  {pred.opportunities.map((opp, j) => (
                    <div key={j} className="recommendation">
                      <div className="rec-header">
                        <span className="market-type">{opp.market}</span>
                        {opp.units && <span className="units-badge">{opp.units} Units</span>}
                      </div>
                      <div className="rec-pick">
                        {opp.pick}
                        {opp.odds && (
                          <span className="odds-badge">
                            {' '}({opp.odds > 0 ? '+' : ''}{opp.odds})
                          </span>
                        )}
                      </div>
                      <div className="rec-details">
                        <div className="detail-item">
                          <span className="detail-label">Model Line</span>
                          <span className="detail-value">{opp.modelLine}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Vegas Line</span>
                          <span className="detail-value">{opp.vegasLine}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Edge</span>
                          <span className="detail-value highlight">
                            {typeof opp.edge === 'number' ? Math.abs(opp.edge).toFixed(1) : opp.edge} pts
                          </span>
                        </div>
                      </div>
                      {opp.edgePercent && (
                        <div className="edge-display">
                          <div className="detail-row">
                            <span className="label">Edge %:</span>
                            <span className="value highlight">{Math.abs(opp.edgePercent).toFixed(1)}%</span>
                          </div>
                        </div>
                      )}
                      {opp.betSize && opp.kelly && (
                        <div className="kelly-sizing">
                          <div className="kelly-stat">
                            <span className="kelly-label">Kelly %</span>
                            <span className="kelly-value">{opp.kelly}%</span>
                          </div>
                          <div className="kelly-stat">
                            <span className="kelly-label">Bet Size</span>
                            <span className="kelly-value">${opp.betSize}</span>
                          </div>
                          <div className="kelly-stat">
                            <span className="kelly-label">Units</span>
                            <span className="kelly-value">{opp.units}</span>
                          </div>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="label">Book:</span>
                        <span className="value">{opp.book || 'Best Line'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Injury Report */}
              {pred.injuries && (
                <div className="injury-report">
                  <h4>🏥 Injury Report</h4>
                  <div className="injury-summary">{pred.injuries.summary}</div>
                  <div className="injury-grid">
                    <div className="injury-team">
                      <span className="team-label">{pred.teams.home.abbreviation}</span>
                      <span className={`impact-badge impact-${pred.injuries.home.impact.toLowerCase()}`}>
                        {pred.injuries.home.impact} ({pred.injuries.home.count})
                      </span>
                      {pred.injuries.home.details && pred.injuries.home.details.length > 0 && (
                        <div className="injury-details">
                          {pred.injuries.home.details.slice(0, 3).map((inj, idx) => (
                            <div key={idx} className="injury-item">
                              {inj.player}: {inj.status}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="injury-team">
                      <span className="team-label">{pred.teams.away.abbreviation}</span>
                      <span className={`impact-badge impact-${pred.injuries.away.impact.toLowerCase()}`}>
                        {pred.injuries.away.impact} ({pred.injuries.away.count})
                      </span>
                      {pred.injuries.away.details && pred.injuries.away.details.length > 0 && (
                        <div className="injury-details">
                          {pred.injuries.away.details.slice(0, 3).map((inj, idx) => (
                            <div key={idx} className="injury-item">
                              {inj.player}: {inj.status}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Depth Chart Analysis */}
              {pred.depth && (
                <div className="depth-analysis">
                  <h4>📊 Depth Chart</h4>
                  <div className="depth-summary">{pred.depth.summary}</div>
                  <div className="depth-grid">
                    <div className="depth-team">
                      <span className="team-label">{pred.teams.home.abbreviation}</span>
                      <span className={`depth-badge depth-${pred.depth.home.quality.toLowerCase()}`}>
                        {pred.depth.home.quality} ({pred.depth.home.score})
                      </span>
                    </div>
                    <div className="depth-team">
                      <span className="team-label">{pred.teams.away.abbreviation}</span>
                      <span className={`depth-badge depth-${pred.depth.away.quality.toLowerCase()}`}>
                        {pred.depth.away.quality} ({pred.depth.away.score})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="key-factors">
                <h4>Key Factors</h4>
                <div className="factors-grid">
                  <div className="factor">
                    <span className="factor-label">Home L10:</span>
                    <span className="factor-value">{pred.features?.homeL10?.netRtg || 'N/A'}</span>
                  </div>
                  <div className="factor">
                    <span className="factor-label">Away L10:</span>
                    <span className="factor-value">{pred.features?.awayL10?.netRtg || 'N/A'}</span>
                  </div>
                  <div className="factor">
                    <span className="factor-label">Games:</span>
                    <span className="factor-value">{pred.features?.homeL10?.games || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'inefficiencies' && (
        <div className="inefficiencies-view">
          <h2>🎯 Market Inefficiency Scanner</h2>
          <p className="subtitle">Lines that are significantly off from our Elite Ensemble model</p>
          
          {inefficiencies.length === 0 && (
            <div className="empty-state">
              <p>No significant market inefficiencies detected today.</p>
              <p className="note">We look for 3+ point edges on spreads and 5%+ probability edges.</p>
            </div>
          )}
          
          <div className="inefficiencies-list">
            {inefficiencies.map((ineff, i) => (
              <div key={i} className="inefficiency-card">
                <div className="card-row">
                  <div className="game-info">
                    <h3>{ineff.game}</h3>
                    <span className="market-badge">{ineff.market}</span>
                  </div>
                  {getEdgeBadge(ineff.edgePercent)}
                </div>
                
                <div className="pick-display">
                  <strong>Recommended Pick:</strong> {ineff.pick}
                </div>
                
                <div className="comparison">
                  <div className="comp-col">
                    <span className="comp-label">Model Line</span>
                    <span className="comp-value model">{ineff.modelLine}</span>
                  </div>
                  <div className="comp-arrow">→</div>
                  <div className="comp-col">
                    <span className="comp-label">Vegas Line</span>
                    <span className="comp-value market">{ineff.vegasLine}</span>
                  </div>
                  <div className="comp-col">
                    <span className="comp-label">Edge</span>
                    <span className="comp-value edge">{ineff.edge.toFixed(1)} pts</span>
                  </div>
                </div>
                
                <div className="betting-info">
                  <div className="bet-row">
                    <span className="label">Units:</span>
                    <span className="value">{ineff.units || 'N/A'}</span>
                  </div>
                  <div className="bet-row">
                    <span className="label">Book:</span>
                    <span className="value">{ineff.book || 'N/A'}</span>
                  </div>
                  {ineff.betSize && (
                    <div className="bet-row">
                      <span className="label">Suggested:</span>
                      <span className="value">${ineff.betSize}</span>
                    </div>
                  )}
                </div>
                
                <div className="confidence-bar">
                  <div className="bar-fill" style={{width: `${ineff.confidence || 60}%`}}></div>
                  <span className="bar-label">Confidence: {ineff.confidence || 60}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'kelly' && kellyPortfolio && (
        <div className="kelly-view">
          <h2>Kelly Criterion Portfolio Optimizer</h2>
          <p className="subtitle">Optimal bet sizing based on edge ($10/unit)</p>
          
          <div className="portfolio-summary">
            <div className="summary-stat">
              <span className="label">Total Bets</span>
              <span className="value">{kellyPortfolio.bets.length}</span>
            </div>
            <div className="summary-stat">
              <span className="label">Total Units</span>
              <span className="value">{kellyPortfolio.bets.reduce((sum, b) => sum + b.units, 0).toFixed(1)}U</span>
            </div>
            <div className="summary-stat">
              <span className="label">Total $</span>
              <span className="value">${kellyPortfolio.total.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="kelly-bets">
            {kellyPortfolio.bets.map((bet, i) => (
              <div key={i} className="kelly-bet-card">
                <div className="bet-header">
                  <h3>{bet.game}</h3>
                  <span className="market-badge">{bet.market}</span>
                </div>
                <div className="bet-details">
                  <div className="bet-row">
                    <span className="label">Edge:</span>
                    <span className="value">{bet.edge.toFixed(1)} pts ({bet.edgePercent.toFixed(1)}%)</span>
                  </div>
                  <div className="bet-row">
                    <span className="label">Kelly %:</span>
                    <span className="value">{(bet.kelly * 100).toFixed(1)}%</span>
                  </div>
                  <div className="bet-row stake">
                    <span className="label">Recommended:</span>
                    <span className="value">{bet.units.toFixed(1)} Units (${bet.stake})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ladder' && betLadder && (
        <div className="ladder-view">
          <h2>Bet Ladder - Progressive Staking</h2>
          <p className="subtitle">1-5 unit recommendations based on edge quality ($10/unit)</p>
          
          <div className="ladder-summary">
            <div className="summary-stat">
              <span className="label">Total Bets</span>
              <span className="value">{betLadder.bets.length}</span>
            </div>
            <div className="summary-stat">
              <span className="label">Total Units</span>
              <span className="value">{betLadder.totalUnits}U</span>
            </div>
            <div className="summary-stat">
              <span className="label">Total $</span>
              <span className="value">${betLadder.totalStake.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="ladder-bets">
            {betLadder.bets.map((bet, i) => (
              <div key={i} className="ladder-bet-card">
                <div className="bet-rank">{i + 1}</div>
                <div className="bet-content">
                  <div className="bet-header">
                    <h3>{bet.game}</h3>
                    <span className="rating">{bet.rating}</span>
                  </div>
                  <div className="bet-info">
                    <span className="market">{bet.market}</span>
                    {getEdgeBadge(bet.edgePercent)}
                  </div>
                  <div className="bet-stake">
                    <span className="units-display">{bet.units} Units</span>
                    <span className="amount">(${bet.stake})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="analytics-view">
          <h2>Advanced Analytics</h2>
          
          <div className="analytics-grid">
            <div className="analytics-card">
              <h3>Model Performance</h3>
              <div className="stat-row">
                <span>Average Confidence:</span>
                <span>{(predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length).toFixed(1)}%</span>
              </div>
              <div className="stat-row">
                <span>High Confidence Picks:</span>
                <span>{predictions.filter(p => p.confidence >= 65).length}</span>
              </div>
              <div className="stat-row">
                <span>Recommendations:</span>
                <span>{predictions.reduce((sum, p) => sum + p.recommendations.length, 0)}</span>
              </div>
            </div>
            
            <div className="analytics-card">
              <h3>Market Insights</h3>
              <div className="stat-row">
                <span>Inefficiencies Found:</span>
                <span>{inefficiencies.length}</span>
              </div>
              <div className="stat-row">
                <span>Elite Opportunities:</span>
                <span>{inefficiencies.filter(i => i.edgePercent >= 10).length}</span>
              </div>
              <div className="stat-row">
                <span>Average Edge:</span>
                <span>{inefficiencies.length > 0 ? (inefficiencies.reduce((sum, i) => sum + i.edgePercent, 0) / inefficiencies.length).toFixed(1) : 0}%</span>
              </div>
            </div>
            
            <div className="analytics-card">
              <h3>Unit Sizing</h3>
              <div className="stat-row">
                <span>Unit Value:</span>
                <span>${UNIT_VALUE}</span>
              </div>
              <div className="stat-row">
                <span>Recommended Units:</span>
                <span>{kellyPortfolio ? kellyPortfolio.bets.reduce((sum, b) => sum + b.units, 0).toFixed(1) : 0}U</span>
              </div>
              <div className="stat-row">
                <span>Total Stake:</span>
                <span>${kellyPortfolio ? kellyPortfolio.total.toLocaleString() : 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NBAPredictions;
