// src/pages/SoccerBTTS.jsx
import React, { useEffect, useState } from 'react';

/**
 * Soccer Both Teams to Score (BTTS) Predictions Page
 * Shows model predictions alongside live sportsbook odds with value betting analysis
 */

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const fmtOdds = (odds) => odds > 0 ? `+${odds}` : `${odds}`;
const fmtDecimal = (odds) => odds ? odds.toFixed(2) : '—';
const fmtPercent = (prob) => prob ? `${Math.round(prob * 100)}%` : '—';

async function fetchBTTSPredictions(league = 'premier-league', limit = 20) {
  const url = `/.netlify/functions/soccer-btts-predictions?league=${league}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'cache-control': 'no-cache' }
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const response = await res.json();
  
  return {
    predictions: response.predictions || [],
    metadata: response.metadata || {},
    league: response.league || league
  };
}

export default function SoccerBTTS() {
  const [predictions, setPredictions] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [selectedLeague, setSelectedLeague] = useState('premier-league');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const leagues = [
    { value: 'premier-league', label: 'Premier League' },
    { value: 'bundesliga', label: 'Bundesliga' }, 
    { value: 'champions-league', label: 'Champions League' }
  ];

  const load = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBTTSPredictions(selectedLeague, 20);
      setPredictions(Array.isArray(data.predictions) ? data.predictions : []);
      setMetadata(data.metadata || {});
    } catch (e) {
      setError(e.message || 'Failed to load BTTS predictions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, [selectedLeague]);

  const getConfidenceColor = (confidence) => {
    if (confidence >= 70) return 'text-green-600 bg-green-50';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-50'; 
    return 'text-gray-600 bg-gray-50';
  };

  const getRecommendationColor = (recommendation) => {
    switch (recommendation) {
      case 'BET': return 'bg-green-100 text-green-800';
      case 'CONSIDER': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-red-100 text-red-800';
    }
  };

  const getBTTSPredictionColor = (prediction, confidence) => {
    const baseColor = prediction === 'YES' ? 'text-green-600' : 'text-red-600';
    const intensity = confidence >= 70 ? 'font-bold' : confidence >= 60 ? 'font-semibold' : 'font-medium';
    return `${baseColor} ${intensity}`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Soccer BTTS Predictions</h1>
          {metadata && (
            <p className="text-sm text-gray-600">
              {metadata.total_fixtures} fixtures • Model: {metadata.model_version} • High confidence: {metadata.high_confidence}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm">League:</label>
            <select 
              value={selectedLeague} 
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="px-2 py-1 border rounded"
            >
              {leagues.map(league => (
                <option key={league.value} value={league.value}>{league.label}</option>
              ))}
            </select>
          </div>
          <button
            className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90"
            onClick={() => load(true)}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">Error: {error}</div>
      )}

      {predictions.length > 0 && predictions.some(p => p.fixture_source === 'demo') && (
        <div className="mb-4 p-3 bg-orange-50 text-orange-700 rounded-lg border border-orange-200">
          <strong>📋 Demo Mode:</strong> Live {selectedLeague.replace('-', ' ')} fixtures are currently unavailable. 
          Showing example predictions with realistic team stats for demonstration purposes.
        </div>
      )}

      <div className="overflow-auto rounded-2xl border border-neutral-200">
        <table className="min-w-full text-sm">
          <caption className="px-4 py-2 text-xs text-gray-600 text-left">
            ⚽ BTTS (Both Teams to Score) predictions using team scoring form, defensive records, and historical matchup data.
            💰 Value bets identified using Kelly Criterion with live sportsbook odds comparison.
          </caption>
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Fixture</th>
              <th className="px-4 py-3 text-left font-medium">Kickoff</th>
              <th className="px-4 py-3 text-left font-medium">BTTS Prediction</th>
              <th className="px-4 py-3 text-left font-medium">Market Odds</th>
              <th className="px-4 py-3 text-left font-medium">Value Bet</th>
              <th className="px-4 py-3 text-left font-medium">Team Form</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={6}>Loading predictions…</td></tr>
            ) : predictions.length === 0 ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={6}>No BTTS predictions available for {selectedLeague}.</td></tr>
            ) : (
              predictions.map((pred, idx) => {
                const kickoff = pred.kickoff ? new Date(pred.kickoff).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                }) : '—';

                return (
                  <tr key={pred.fixture_id || idx} className="border-t border-neutral-200 hover:bg-neutral-25">
                    <td className="px-4 py-3">
                      <div className="font-medium">{pred.matchup}</div>
                      <div className="text-xs text-gray-500">{pred.venue}</div>
                      <div className="text-xs text-gray-500">{pred.league}</div>
                      {pred.fixture_source === 'demo' && (
                        <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded mt-1">
                          📋 Demo fixture - real data unavailable
                        </div>
                      )}
                    </td>
                    
                    <td className="px-4 py-3">{kickoff}</td>
                    
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className={`font-medium ${getBTTSPredictionColor(pred.btts_prediction, pred.confidence)}`}>
                          BTTS {pred.btts_prediction}
                        </div>
                        <div className="text-xs text-gray-600">
                          {Math.round(pred.btts_probability * 100)}% probability
                        </div>
                        <div className={`text-xs px-2 py-1 rounded ${getConfidenceColor(pred.confidence)}`}>
                          {pred.confidence}% confidence
                        </div>
                        <div className="text-xs text-purple-600">
                          {pred.edge_pct}% edge
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-4 py-3">
                      {pred.market_odds?.btts_yes ? (
                        <div className="space-y-1">
                          <div className="text-sm">
                            <span className="font-medium">YES:</span> {fmtDecimal(pred.market_odds.btts_yes)} 
                            <span className="text-xs text-gray-500 ml-1">
                              ({fmtOdds(pred.market_odds.btts_yes_american)})
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">NO:</span> {fmtDecimal(pred.market_odds.btts_no)}
                            <span className="text-xs text-gray-500 ml-1">
                              ({fmtOdds(pred.market_odds.btts_no_american)})
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            via {pred.market_odds.bookmaker}
                          </div>
                          <div className="text-xs text-gray-500">
                            Implied: {fmtPercent(pred.market_odds.implied_prob_yes)} / {fmtPercent(pred.market_odds.implied_prob_no)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-500">No odds available</div>
                      )}
                    </td>
                    
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${getRecommendationColor(pred.value_bet.recommendation)}`}>
                          {pred.value_bet.recommendation}
                        </span>
                        {pred.value_bet.selection && (
                          <>
                            <div className="text-sm font-medium text-green-600">
                              Bet {pred.value_bet.selection}
                            </div>
                            <div className="text-xs text-gray-600">
                              Stake: {Math.round(pred.value_bet.stake_fraction * 100)}% of bankroll
                            </div>
                            <div className="text-xs text-green-600">
                              Expected value: {pred.value_bet.expected_value > 0 ? '+' : ''}{Math.round(pred.value_bet.expected_value * 100)}%
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-1">
                        <div><strong>Home:</strong> {pred.factors.home_goals_pg} goals/game</div>
                        <div><strong>Away:</strong> {pred.factors.away_goals_pg} goals/game</div>
                        <div><strong>Home conceded:</strong> {pred.factors.home_conceded_pg}/game</div>
                        <div><strong>Away conceded:</strong> {pred.factors.away_conceded_pg}/game</div>
                        <div><strong>Home BTTS rate:</strong> {fmtPercent(pred.factors.home_btts_rate)}</div>
                        <div><strong>Away BTTS rate:</strong> {fmtPercent(pred.factors.away_btts_rate)}</div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {predictions.length > 0 && (
        <div className="mt-4 text-xs text-gray-500">
          <p><strong>BTTS Prediction:</strong> Model's recommended bet (YES/NO) with confidence percentage.</p>
          <p><strong>Value Bet:</strong> Calculated using Kelly Criterion - only recommends when expected value is positive.</p>
          <p><strong>Team Form:</strong> Goals scored/conceded per game and historical BTTS rates.</p>
          <p><strong>Edge:</strong> Model probability vs baseline (coin flip) difference.</p>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
        <p className="text-sm text-blue-700">
          <strong>Disclaimer:</strong> Soccer predictions are for entertainment and educational purposes only. 
          Sports betting involves risk and should only be done with money you can afford to lose. 
          Please gamble responsibly and never bet more than recommended stake percentages.
        </p>
      </div>
    </div>
  );
}