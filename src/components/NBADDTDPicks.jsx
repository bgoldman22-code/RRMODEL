/**
 * NBA DD/TD Picks Component
 * Displays daily double-double and triple-double picks from the model
 */

import React, { useState, useEffect } from 'react';

export default function NBADDTDPicks() {
  const [picks, setPicks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPicks();
  }, []);

  async function fetchPicks() {
    try {
      setLoading(true);
      const response = await fetch('/.netlify/functions/nbaddtd-picks');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPicks(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching DD/TD picks:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Edge color coding
  function getEdgeColor(edge) {
    if (edge >= 0.30) return '#10b981'; // green-500 - excellent
    if (edge >= 0.20) return '#22c55e'; // green-400 - good
    if (edge >= 0.10) return '#84cc16'; // lime-500 - decent
    return '#eab308'; // yellow-500 - marginal
  }

  // Loading state
  if (loading) {
    return (
      <div className="nba-ddtd-picks loading">
        <h2>🏀 Double-Double & Triple-Double Picks</h2>
        <p>Loading today's picks...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="nba-ddtd-picks error">
        <h2>🏀 Double-Double & Triple-Double Picks</h2>
        <p style={{ color: '#ef4444' }}>Error: {error}</p>
        <button onClick={fetchPicks}>Retry</button>
      </div>
    );
  }

  // No picks available
  if (!picks || (!picks.picks?.dd?.length && !picks.picks?.td?.length)) {
    return (
      <div className="nba-ddtd-picks no-picks">
        <h2>🏀 Double-Double & Triple-Double Picks</h2>
        <p>No picks available for today.</p>
        {picks?.date && <p className="date">Date: {picks.date}</p>}
      </div>
    );
  }

  return (
    <div className="nba-ddtd-picks">
      <div className="header">
        <h2>🏀 Double-Double & Triple-Double Picks</h2>
        <div className="meta">
          <span className="date">📅 {picks.date}</span>
          <span className="model">🤖 Model: {picks.model_version}</span>
          <span className="summary">
            {picks.summary.total_dd} DD, {picks.summary.total_td} TD
          </span>
        </div>
      </div>

      {/* Double-Double Picks */}
      {picks.picks.dd.length > 0 && (
        <div className="picks-section">
          <h3>🔥 Double-Double Picks</h3>
          <div className="picks-table-container">
            <table className="picks-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Game</th>
                  <th>Model Prob</th>
                  <th>Best Odds</th>
                  <th>Edge</th>
                  <th>L20 Rate</th>
                  <th>Avg Min</th>
                </tr>
              </thead>
              <tbody>
                {picks.picks.dd.map((pick, idx) => (
                  <tr key={idx}>
                    <td className="player-name">{pick.player}</td>
                    <td className="game">{pick.game}</td>
                    <td className="prob">{(pick.model_prob * 100).toFixed(1)}%</td>
                    <td className="odds">{pick.best_odds > 0 ? '+' : ''}{pick.best_odds}</td>
                    <td 
                      className="edge"
                      style={{ 
                        color: getEdgeColor(pick.edge),
                        fontWeight: 'bold'
                      }}
                    >
                      {(pick.edge * 100).toFixed(1)}%
                    </td>
                    <td className="rate">{(pick.l20_dd_rate * 100).toFixed(0)}%</td>
                    <td className="minutes">{pick.avg_minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Triple-Double Picks */}
      {picks.picks.td.length > 0 && (
        <div className="picks-section">
          <h3>⭐ Triple-Double Picks</h3>
          <div className="picks-table-container">
            <table className="picks-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Game</th>
                  <th>Model Prob</th>
                  <th>Best Odds</th>
                  <th>Edge</th>
                  <th>L20 Rate</th>
                  <th>Avg Min</th>
                </tr>
              </thead>
              <tbody>
                {picks.picks.td.map((pick, idx) => (
                  <tr key={idx}>
                    <td className="player-name">{pick.player}</td>
                    <td className="game">{pick.game}</td>
                    <td className="prob">{(pick.model_prob * 100).toFixed(1)}%</td>
                    <td className="odds">{pick.best_odds > 0 ? '+' : ''}{pick.best_odds}</td>
                    <td 
                      className="edge"
                      style={{ 
                        color: getEdgeColor(pick.edge),
                        fontWeight: 'bold'
                      }}
                    >
                      {(pick.edge * 100).toFixed(1)}%
                    </td>
                    <td className="rate">{(pick.l20_td_rate * 100).toFixed(0)}%</td>
                    <td className="minutes">{pick.avg_minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="footer">
        <p className="disclaimer">
          ⚠️ These are model predictions based on historical data. Not financial advice. 
          Bet responsibly.
        </p>
        <button onClick={fetchPicks} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>

      <style jsx>{`
        .nba-ddtd-picks {
          margin: 2rem 0;
          padding: 1.5rem;
          background: #1e293b;
          border-radius: 8px;
        }

        .header {
          margin-bottom: 1.5rem;
        }

        .header h2 {
          margin: 0 0 0.5rem 0;
          color: #f1f5f9;
        }

        .meta {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          font-size: 0.875rem;
          color: #94a3b8;
        }

        .picks-section {
          margin-bottom: 2rem;
        }

        .picks-section h3 {
          margin: 0 0 1rem 0;
          color: #f1f5f9;
        }

        .picks-table-container {
          overflow-x: auto;
        }

        .picks-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .picks-table th {
          background: #334155;
          color: #e2e8f0;
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
        }

        .picks-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #334155;
          color: #cbd5e1;
        }

        .picks-table tbody tr:hover {
          background: #2d3748;
        }

        .player-name {
          font-weight: 600;
          color: #f1f5f9;
        }

        .game {
          font-size: 0.8rem;
          color: #94a3b8;
        }

        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #334155;
        }

        .disclaimer {
          font-size: 0.75rem;
          color: #94a3b8;
          margin: 0;
        }

        .refresh-btn {
          padding: 0.5rem 1rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
        }

        .refresh-btn:hover {
          background: #2563eb;
        }

        .loading, .error, .no-picks {
          text-align: center;
          padding: 2rem;
          color: #94a3b8;
        }

        @media (max-width: 768px) {
          .picks-table {
            font-size: 0.75rem;
          }

          .picks-table th,
          .picks-table td {
            padding: 0.5rem;
          }

          .footer {
            flex-direction: column;
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
