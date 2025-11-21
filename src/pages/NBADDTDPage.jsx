import React from 'react';
import NBADDTDPicks from '../components/NBADDTDPicks';

/**
 * NBA Double-Double & Triple-Double Picks Page
 * Live at: https://bgroundrobin.com/nba-ddtd
 */
export default function NBADDTDPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>🏀 NBA Double-Double & Triple-Double Picks</h1>
        <p className="page-description">
          Daily picks powered by our calibrated Gradient Boosting model with scaled Kelly criterion bet sizing.
        </p>
      </div>
      
      <NBADDTDPicks />
      
      <div className="page-footer">
        <p className="disclaimer">
          Picks are generated daily using historical data and advanced machine learning. 
          Past performance does not guarantee future results. Bet responsibly.
        </p>
      </div>
      
      <style jsx>{`
        .page-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        .page-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .page-header h1 {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
          color: #1a202c;
        }
        
        .page-description {
          font-size: 1.1rem;
          color: #4a5568;
          margin-bottom: 1rem;
        }
        
        .page-footer {
          margin-top: 3rem;
          padding-top: 2rem;
          border-top: 1px solid #e2e8f0;
        }
        
        .disclaimer {
          font-size: 0.875rem;
          color: #718096;
          text-align: center;
          font-style: italic;
        }
        
        @media (max-width: 768px) {
          .page-container {
            padding: 1rem;
          }
          
          .page-header h1 {
            font-size: 1.75rem;
          }
          
          .page-description {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
