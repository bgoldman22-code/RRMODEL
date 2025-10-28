import React, { useState, useEffect } from 'react';

const NBAPredictionsV2 = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/.netlify/functions/nba-predictions-elite-v2');
      const data = await response.json();

      if (!data.ok || !data.predictions || data.predictions.length === 0) {
        setError(data.message || 'No games available');
        return;
      }

      setPredictions(data.predictions);
    } catch (err) {
      setError(`Error loading predictions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderGame = (pred) => {
    const confidence = pred.prediction?.confidence || 0;
    const confidenceClass = confidence > 65 ? 'HIGH' : confidence > 50 ? 'MEDIUM' : 'LOW';
    
    // Extract values from nested structure
    const spread = pred.prediction?.spread?.prediction || 0;
    const total = pred.prediction?.total?.prediction || 0;
    const homeWinProb = pred.prediction?.winProbability?.home || 0;
    const favorite = pred.prediction?.spread?.favorite || 'home';
    
    // Format spread display
    const spreadDisplay = favorite === 'home' 
      ? (spread > 0 ? `-${spread}` : `+${Math.abs(spread)}`)
      : (spread > 0 ? `+${spread}` : `-${Math.abs(spread)}`);
    
    // Determine pick recommendation
    const homeTeam = pred.game.split(' @ ')[1];
    const awayTeam = pred.game.split(' @ ')[0];
    const favoriteName = favorite === 'home' ? homeTeam : awayTeam;
    const pickSummary = `Model Pick: ${favoriteName} ${Math.abs(spread)} (${homeWinProb.toFixed(1)}% home win prob)`;
    
    // Process betting opportunities
    const betRecommendations = pred.opportunities?.map((opp, idx) => {
      const edgeClass = opp.edge > 10 ? 'bet-rec' : opp.edge > 5 ? 'bet-rec low-edge' : 'bet-rec skip';
      const edgeColor = opp.edge > 5 ? 'edge-positive' : 'edge-negative';
      
      return (
        <div key={idx} className={edgeClass}>
          <strong>{opp.market}: {opp.pick}</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
            <span>Edge: <span className={edgeColor}>{opp.edge}%</span></span>
            <span>Odds: {opp.odds > 0 ? '+' : ''}{opp.odds}</span>
            <span>{opp.book}</span>
          </div>
          {opp.units && <div style={{ color: '#00ff88', fontSize: '12px' }}>Rec: {opp.units} units</div>}
        </div>
      );
    }) || [];

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
            <div className="stat-label">Home Win Prob</div>
            <div className="stat-value">{homeWinProb.toFixed(1)}%</div>
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
              <div className="vegas-value">{pred.vegasLines.spread?.line || 'N/A'}</div>
            </div>
            <div className="vegas-stat">
              <div className="vegas-label">Vegas Total</div>
              <div className="vegas-value">{pred.vegasLines.total?.line || 'N/A'}</div>
            </div>
            <div className="vegas-stat">
              <div className="vegas-label">Home ML</div>
              <div className="vegas-value">
                {pred.vegasLines.moneyline?.home > 0 ? '+' : ''}{pred.vegasLines.moneyline?.home || 'N/A'}
              </div>
            </div>
            <div className="vegas-stat">
              <div className="vegas-label">Away ML</div>
              <div className="vegas-value">
                {pred.vegasLines.moneyline?.away > 0 ? '+' : ''}{pred.vegasLines.moneyline?.away || 'N/A'}
              </div>
            </div>
          </div>
        )}
        
        {betRecommendations.length > 0 && (
          <div className="recommendations">
            <div className="rec-header">🎯 Betting Recommendations</div>
            {betRecommendations}
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
          border-left: 3px solid #ffa500;
        }
        .rec-header {
          color: #ffa500;
          font-weight: bold;
          margin-bottom: 10px;
          font-size: 16px;
        }
        .bet-rec {
          background: #1a1f3a;
          padding: 10px;
          margin: 8px 0;
          border-radius: 6px;
          border-left: 3px solid #00ff88;
        }
        .bet-rec.skip {
          border-left-color: #ff4444;
        }
        .bet-rec.low-edge {
          border-left-color: #ffa500;
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
        .edge-negative { 
          color: #ff4444; 
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