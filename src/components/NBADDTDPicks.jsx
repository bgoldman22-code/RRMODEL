/**
 * NBA DD/TD Picks Component
 * Displays daily double-double and triple-double picks from the model
 * Shows both recommended picks with Kelly unit sizing AND all high probability plays
 */

import React, { useState, useEffect } from 'react';

export default function NBADDTDPicks() {
  const [picks, setPicks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('recommended');

  useEffect(() => {
    fetchPicks();
  }, []);

  async function fetchPicks() {
    try {
      setLoading(true);
      const response = await fetch('/.netlify/functions/nba-ddtd-picks');
      
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

  // Format odds with + sign
  function formatOdds(odds) {
    return odds > 0 ? `+${odds}` : odds;
  }

  // Get data for display
  const recommendedDD = picks?.recommended_picks?.dd || [];
  const recommendedTD = picks?.recommended_picks?.td || [];
  const highProbDD = picks?.high_probability || [];
  const totalUnits = recommendedDD.reduce((sum, p) => sum + (p.bet_units || 0), 0) + 
                     recommendedTD.reduce((sum, p) => sum + (p.bet_units || 0), 0);
  const totalAmount = recommendedDD.reduce((sum, p) => sum + (p.bet_amount || 0), 0) + 
                      recommendedTD.reduce((sum, p) => sum + (p.bet_amount || 0), 0);

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
  if (!picks) {
    return (
      <div className="nba-ddtd-picks no-picks">
        <h2>🏀 Double-Double & Triple-Double Picks</h2>
        <p>No picks available for today.</p>
      </div>
    );
  }

  return (
    <div className="nba-ddtd-picks">
      {/* Header with Stats */}
      <div className="header">
        <h2>🏀 Double-Double & Triple-Double Picks</h2>
        <div className="meta">
          <span className="date">📅 {picks.date}</span>
          <span className="model">🤖 Model: {picks.model_version}</span>
          <span className="generated">Generated: {new Date(picks.generated_at).toLocaleTimeString()}</span>
        </div>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-label">Recommended Picks</div>
            <div className="stat-value">{recommendedDD.length + recommendedTD.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Total Units</div>
            <div className="stat-value">{totalUnits.toFixed(1)}U</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Total $ Amount</div>
            <div className="stat-value">${totalAmount.toFixed(0)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Bankroll</div>
            <div className="stat-value">${picks.bankroll}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'recommended' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommended')}
        >
          🔥 Recommended Picks ({recommendedDD.length + recommendedTD.length})
        </button>
        <button 
          className={`tab ${activeTab === 'highprob' ? 'active' : ''}`}
          onClick={() => setActiveTab('highprob')}
        >
          📊 All {'>'}35% Probability ({highProbDD.length})
        </button>
      </div>

      {/* Recommended Picks Tab */}
      {activeTab === 'recommended' && (
        <div className="tab-content">
          {/* Double-Double Picks */}
          {recommendedDD.length > 0 && (
            <div className="picks-section">
              <h3>🔥 Double-Double Picks</h3>
              <div className="picks-table-container">
                <table className="picks-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Game</th>
                      <th>Model %</th>
                      <th>Best Odds</th>
                      <th>Bookmaker</th>
                      <th>Edge</th>
                      <th>Units</th>
                      <th>Bet $</th>
                      <th>Stats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendedDD.map((pick, idx) => (
                      <tr key={idx}>
                        <td className="player-name">
                          {pick.player}
                          {pick.l20_dd_rate >= 0.50 && <span className="badge hot">🔥 Hot</span>}
                        </td>
                        <td className="game">{pick.game}</td>
                        <td className="prob">{(pick.model_prob * 100).toFixed(1)}%</td>
                        <td className="odds">{formatOdds(pick.best_odds)}</td>
                        <td className="bookmaker">{pick.bookmaker}</td>
                        <td 
                          className="edge"
                          style={{ 
                            color: getEdgeColor(pick.edge),
                            fontWeight: 'bold'
                          }}
                        >
                          {(pick.edge * 100).toFixed(1)}%
                        </td>
                        <td className="units">{pick.bet_units.toFixed(1)}U</td>
                        <td className="amount">${pick.bet_amount.toFixed(0)}</td>
                        <td className="stats-cell">
                          <div>{pick.stats.pts.toFixed(1)} pts</div>
                          <div>{pick.stats.reb.toFixed(1)} reb</div>
                          <div>{pick.stats.ast.toFixed(1)} ast</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Triple-Double Picks */}
          {recommendedTD.length > 0 && (
            <div className="picks-section">
              <h3>⭐ Triple-Double Picks</h3>
              <div className="picks-table-container">
                <table className="picks-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Game</th>
                      <th>Model %</th>
                      <th>Best Odds</th>
                      <th>Bookmaker</th>
                      <th>Edge</th>
                      <th>Units</th>
                      <th>Bet $</th>
                      <th>Stats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendedTD.map((pick, idx) => (
                      <tr key={idx}>
                        <td className="player-name">
                          {pick.player}
                          {pick.l20_td_rate === 0 && <span className="badge warning">⚠️ No recent TDs</span>}
                        </td>
                        <td className="game">{pick.game}</td>
                        <td className="prob">{(pick.model_prob * 100).toFixed(1)}%</td>
                        <td className="odds">{formatOdds(pick.best_odds)}</td>
                        <td className="bookmaker">{pick.bookmaker}</td>
                        <td 
                          className="edge"
                          style={{ 
                            color: getEdgeColor(pick.edge),
                            fontWeight: 'bold'
                          }}
                        >
                          {(pick.edge * 100).toFixed(1)}%
                        </td>
                        <td className="units">{pick.bet_units.toFixed(1)}U</td>
                        <td className="amount">${pick.bet_amount.toFixed(0)}</td>
                        <td className="stats-cell">
                          <div>{pick.stats.pts.toFixed(1)} pts</div>
                          <div>{pick.stats.reb.toFixed(1)} reb</div>
                          <div>{pick.stats.ast.toFixed(1)} ast</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {recommendedDD.length === 0 && recommendedTD.length === 0 && (
            <div className="no-picks">
              <p>No recommended picks for today</p>
              <p className="sub">Check the "All {'>'}35% Probability" tab for other potential plays</p>
            </div>
          )}
        </div>
      )}

      {/* High Probability Tab */}
      {activeTab === 'highprob' && (
        <div className="tab-content">
          <div className="picks-section">
            <h3>📊 All Players with {'>'}35% DD Probability</h3>
            {highProbDD.length > 0 ? (
              <div className="picks-table-container">
                <table className="picks-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Game</th>
                      <th>Model %</th>
                      <th>Best Odds</th>
                      <th>Bookmaker</th>
                      <th>Edge</th>
                      <th>L20 Stats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highProbDD.map((pick, idx) => (
                      <tr key={idx} className={pick.has_positive_edge ? '' : 'no-edge'}>
                        <td className="player-name">
                          {pick.player}
                          {!pick.has_positive_edge && <span className="badge no-edge">No Edge</span>}
                        </td>
                        <td className="game">{pick.game}</td>
                        <td className="prob">{(pick.model_prob * 100).toFixed(1)}%</td>
                        <td className="odds">{pick.best_odds ? formatOdds(pick.best_odds) : 'N/A'}</td>
                        <td className="bookmaker">{pick.bookmaker || 'N/A'}</td>
                        <td 
                          className="edge"
                          style={{ 
                            color: pick.has_positive_edge ? getEdgeColor(pick.edge) : '#ef4444',
                            fontWeight: 'bold'
                          }}
                        >
                          {pick.edge ? `${(pick.edge * 100).toFixed(1)}%` : 'N/A'}
                        </td>
                        <td className="stats-cell">
                          <div>{pick.stats.pts.toFixed(1)} pts</div>
                          <div>{pick.stats.reb.toFixed(1)} reb</div>
                          <div>{pick.stats.ast.toFixed(1)} ast</div>
                          <div className="dd-rate">DD: {(pick.l20_dd_rate * 100).toFixed(0)}%</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-picks">
                <p>No players with {'>'}35% probability today</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <div className="info-box">
          <h4>ℹ️ Betting Guide</h4>
          <ul>
            <li><strong>Units:</strong> Kelly Criterion (Quarter Kelly) with ${picks.unit_size}/unit</li>
            <li><strong>Bankroll:</strong> ${picks.bankroll} total</li>
            <li><strong>Edge:</strong> Model probability minus implied odds probability</li>
            <li><strong>Best Odds:</strong> Highest available odds across major sportsbooks</li>
            <li><strong>Always verify</strong> player status and odds before placing bets</li>
          </ul>
        </div>
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
          margin-bottom: 1rem;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .stat-box {
          background: #334155;
          padding: 1rem;
          border-radius: 6px;
          text-align: center;
        }

        .stat-label {
          font-size: 0.75rem;
          color: #94a3b8;
          margin-bottom: 0.5rem;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: bold;
          color: #f1f5f9;
        }

        .tabs {
          display: flex;
          border-bottom: 2px solid #334155;
          margin-bottom: 1.5rem;
          gap: 0.5rem;
        }

        .tab {
          padding: 0.75rem 1.5rem;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          border-bottom: 3px solid transparent;
          transition: all 0.2s;
        }

        .tab:hover {
          color: #cbd5e1;
        }

        .tab.active {
          color: #3b82f6;
          border-bottom-color: #3b82f6;
        }

        .tab-content {
          min-height: 300px;
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
          white-space: nowrap;
        }

        .picks-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #334155;
          color: #cbd5e1;
        }

        .picks-table tbody tr:hover {
          background: #2d3748;
        }

        .picks-table tbody tr.no-edge {
          opacity: 0.6;
        }

        .player-name {
          font-weight: 600;
          color: #f1f5f9;
        }

        .badge {
          display: inline-block;
          margin-left: 0.5rem;
          padding: 0.125rem 0.5rem;
          font-size: 0.7rem;
          border-radius: 3px;
        }

        .badge.hot {
          background: #dc2626;
          color: white;
        }

        .badge.warning {
          background: #f59e0b;
          color: white;
        }

        .badge.no-edge {
          background: #6b7280;
          color: white;
        }

        .game {
          font-size: 0.8rem;
          color: #94a3b8;
        }

        .bookmaker {
          font-size: 0.75rem;
          color: #94a3b8;
        }

        .units {
          font-weight: bold;
          color: #22c55e;
        }

        .amount {
          font-weight: 600;
        }

        .stats-cell {
          font-size: 0.75rem;
          line-height: 1.3;
        }

        .stats-cell .dd-rate {
          margin-top: 0.25rem;
          color: #94a3b8;
          font-style: italic;
        }

        .footer {
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid #334155;
        }

        .info-box {
          background: #334155;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
        }

        .info-box h4 {
          margin: 0 0 0.75rem 0;
          color: #f1f5f9;
          font-size: 0.875rem;
        }

        .info-box ul {
          margin: 0;
          padding-left: 1.5rem;
          font-size: 0.75rem;
          color: #94a3b8;
          line-height: 1.6;
        }

        .refresh-btn {
          padding: 0.75rem 1.5rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          width: 100%;
        }

        .refresh-btn:hover {
          background: #2563eb;
        }

        .loading, .error, .no-picks {
          text-align: center;
          padding: 3rem 2rem;
          color: #94a3b8;
        }

        .no-picks p {
          margin: 0.5rem 0;
        }

        .no-picks .sub {
          font-size: 0.875rem;
          color: #64748b;
        }

        @media (max-width: 768px) {
          .stats-row {
            grid-template-columns: repeat(2, 1fr);
          }

          .tabs {
            flex-direction: column;
          }

          .tab {
            text-align: left;
            border-bottom: 1px solid #334155;
            border-left: 3px solid transparent;
          }

          .tab.active {
            border-bottom-color: #334155;
            border-left-color: #3b82f6;
          }

          .picks-table {
            font-size: 0.75rem;
          }

          .picks-table th,
          .picks-table td {
            padding: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
