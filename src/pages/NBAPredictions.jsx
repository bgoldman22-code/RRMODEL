import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './NBAPredictions.css';

/**
 * NBA Predictions - Elite Pro Bettor Interface
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
  
  // Unit-based betting (remove personal bankroll)
  const UNIT_VALUE = 10; // $10 per unit (based on $5000 bankroll)
  const BANKROLL_UNITS = 500; // Total units in bankroll
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
      const response = await fetch('/.netlify/functions/nba-predictions-clean');
      const data = await response.json();
      
      if (data.ok) {
        setPredictions(data.predictions);
        
        // Process advanced analytics
        processAnalytics(data.predictions);
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
      if (pred.edge?.spread && Math.abs(pred.edge.spread.edge) >= 3) {
        ineffs.push({
          ...pred,
          market: 'SPREAD',
          edge: pred.edge.spread.edge,
          edgePercent: pred.edge.spread.edgePercent
        });
      }
      
      if (pred.edge?.total && Math.abs(pred.edge.total.edge) >= 3) {
        ineffs.push({
          ...pred,
          market: 'TOTAL',
          edge: pred.edge.total.edge,
          edgePercent: pred.edge.total.edgePercent
        });
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
                  <span className="value">{pred.predictedSpread > 0 ? '+' : ''}{pred.predictedSpread}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Predicted Total:</span>
                  <span className="value">{pred.predictedTotal}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Home Win Prob:</span>
                  <span className="value">{pred.homeWinProb}%</span>
                </div>
              </div>

              {pred.marketOdds && (
                <div className="market-comparison">
                  <h4>Market Odds</h4>
                  <div className="detail-row">
                    <span className="label">Market Spread:</span>
                    <span className="value">{pred.marketOdds.spread}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Market Total:</span>
                    <span className="value">{pred.marketOdds.total}</span>
                  </div>
                </div>
              )}

              {pred.recommendations && pred.recommendations.length > 0 && (
                <div className="recommendations">
                  <h4>🎯 Best Bets</h4>
                  {pred.recommendations.map((rec, j) => (
                    <div key={j} className="recommendation">
                      <div className="rec-header">
                        <span className="market">{rec.market}</span>
                        <span className="rating">{rec.rating}</span>
                      </div>
                      <div className="rec-pick">
                        <strong>{rec.pick}</strong> ({rec.line})
                      </div>
                      {getEdgeBadge(rec.edgePercent)}
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
                    <span className="factor-value">{pred.keyFactors.homeL10NetRating}</span>
                  </div>
                  <div className="factor">
                    <span className="factor-label">Away L10:</span>
                    <span className="factor-value">{pred.keyFactors.awayL10NetRating}</span>
                  </div>
                  <div className="factor">
                    <span className="factor-label">Pace:</span>
                    <span className="factor-value">{pred.keyFactors.paceMatchup}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'inefficiencies' && (
        <div className="inefficiencies-view">
          <h2>Market Inefficiency Scanner</h2>
          <p className="subtitle">Lines that are significantly off from our model</p>
          
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
                
                <div className="comparison">
                  <div className="comp-col">
                    <span className="comp-label">Model Line</span>
                    <span className="comp-value model">{ineff.market === 'SPREAD' ? ineff.predictedSpread : ineff.predictedTotal}</span>
                  </div>
                  <div className="comp-arrow">→</div>
                  <div className="comp-col">
                    <span className="comp-label">Market Line</span>
                    <span className="comp-value market">{ineff.market === 'SPREAD' ? ineff.marketOdds.spread : ineff.marketOdds.total}</span>
                  </div>
                  <div className="comp-col">
                    <span className="comp-label">Edge</span>
                    <span className="comp-value edge">{ineff.edge.toFixed(1)} pts</span>
                  </div>
                </div>
                
                <div className="confidence-bar">
                  <div className="bar-fill" style={{width: `${ineff.confidence}%`}}></div>
                  <span className="bar-label">Confidence: {ineff.confidence}%</span>
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
