import React, { useEffect, useState } from 'react';

/**
 * NFL Predictions Page with Live Odds Display
 * Shows real sportsbook lines alongside model predictions
 */

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const fmtOdds = (odds) => odds > 0 ? `+${odds}` : `${odds}`;

async function fetchSchedule(week = 3, season = 2025) {
  const scheduleUrl = `/.netlify/functions/nfl-schedule-get?week=${week}&season=${season}`;
  const scheduleRes = await fetch(scheduleUrl);
  if (!scheduleRes.ok) throw new Error(`Failed to get schedule: ${scheduleRes.status}`);
  const scheduleData = await scheduleRes.json();
  
  const games = (scheduleData.matchups || []).map(game => ({
    home_team: getTeamAbbreviation(game.homeTeam),
    away_team: getTeamAbbreviation(game.awayTeam), 
    game_id: game.id || `${game.homeTeam}-${game.awayTeam}`,
    start: game.kickoff
  }));
  
  return games;
}

async function fetchPredictions(week = 3, season = 2025, force = false) {
  const games = await fetchSchedule(week, season);
  
  if (games.length === 0) {
    throw new Error(`No games found for Week ${week}, ${season}`);
  }
  
  const url = `/.netlify/functions/nfl-predictions-generate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'cache-control': 'no-cache' 
    },
    body: JSON.stringify({
      season: season.toString(),
      games: games
    })
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const predictions = await res.json();
  
  return {
    rows: predictions.map(pred => ({
      gameId: pred.game_id,
      matchup: `${pred.away_team} @ ${pred.home_team}`,
      start: pred.start,
      predictions: pred.predictions,
      odds: pred.odds, // Include live odds
      home_team: pred.home_team,
      away_team: pred.away_team,
      teamStats: pred.teamStats,
      modelEnhancements: pred.modelEnhancements
    })),
    meta: {
      week: week,
      season: season,
      games: predictions.length,
      model: 'advanced_nfl_predictions'
    }
  };
}

function getTeamAbbreviation(fullName) {
  const nameMap = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Los Angeles Rams": "LAR", "Los Angeles Chargers": "LAC",
    "Las Vegas Raiders": "LV", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "Seattle Seahawks": "SEA", "San Francisco 49ers": "SF", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
  };
  return nameMap[fullName] || fullName;
}

// Helper function to format spread display based on pick
function formatSpreadDisplay(spread, homeTeam, awayTeam) {
  if (!spread || !spread.pick || spread.pick === 'push') {
    return {
      displayPick: spread?.pick || '—',
      displayLine: spread?.line ? `${spread.line}` : '—'
    };
  }
  
  const marketLine = spread.line || 0;
  
  // If picking the home team, show the line as-is
  // If picking the away team, flip the sign to show what they're getting
  if (spread.pick === homeTeam) {
    return {
      displayPick: homeTeam,
      displayLine: marketLine > 0 ? `+${marketLine}` : `${marketLine}`
    };
  } else if (spread.pick === awayTeam) {
    return {
      displayPick: awayTeam,
      displayLine: marketLine > 0 ? `${-marketLine}` : `+${Math.abs(marketLine)}`
    };
  }
  
  return {
    displayPick: spread.pick,
    displayLine: `${marketLine}`
  };
}

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [week, setWeek] = useState(3);
  const season = 2025;

  const load = async (force = false) => {
    setLoading(true); 
    setError(null);
    try {
      const data = await fetchPredictions(week, season, force);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setMeta(data.meta || null);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, [week]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">NFL Predictions</h1>
          {meta && (
            <p className="text-sm text-gray-600">
              Week {meta.week}, {meta.season} • {meta.games} games • Model: {meta.model}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm">Week:</label>
            <select 
              value={week} 
              onChange={(e) => setWeek(Number(e.target.value))}
              className="px-2 py-1 border rounded"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(w => (
                <option key={w} value={w}>Week {w}</option>
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

      <div className="overflow-auto rounded-2xl border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Matchup</th>
              <th className="px-4 py-3 text-left font-medium">Kickoff</th>
              <th className="px-4 py-3 text-left font-medium">Moneyline</th>
              <th className="px-4 py-3 text-left font-medium">Spread</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">Best Edge</th>
              <th className="px-4 py-3 text-left font-medium">Team Stats</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={7}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={7}>No predictions available for Week {week}, {season}.</td></tr>
            ) : (
              rows.map((r, idx) => {
                const kickoff = r.start ? new Date(r.start).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                }) : '—';
                
                const ml = r.predictions?.moneyline;
                const spread = r.predictions?.spread;
                const total = r.predictions?.total;
                const odds = r.odds || {};
                
                const bestEdge = Math.max(
                  Math.abs(ml?.edge || 0),
                  spread?.confidence > 60 ? (spread.confidence - 50) : 0,
                  total?.confidence > 60 ? (total.confidence - 50) : 0
                );

                // Format spread display to show correct team and line
                const spreadDisplay = formatSpreadDisplay(spread, r.home_team, r.away_team);

                const PickBadge = ({ pick, confidence, type, modelValue, marketValue }) => (
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{pick}</div>
                    <div className={`text-xs px-2 py-1 rounded ${
                      confidence >= 70 ? 'bg-green-100 text-green-800' :
                      confidence >= 60 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {confidence}%
                    </div>
                    {/* Display market line */}
                    {marketValue && (
                      <div className="text-xs text-gray-600">
                        Line: {marketValue}
                      </div>
                    )}
                    {/* Display model prediction vs market */}
                    {modelValue && marketValue && (
                      <div className="text-xs text-blue-600">
                        Model: {modelValue}
                      </div>
                    )}
                  </div>
                );

                return (
                  <tr key={r.gameId || idx} className="border-t border-neutral-200 hover:bg-neutral-25">
                    <td className="px-4 py-3 font-medium">{fmt(r.matchup)}</td>
                    <td className="px-4 py-3">{kickoff}</td>
                    
                    {/* Moneyline Column */}
                    <td className="px-4 py-3">
                      {ml ? (
                        <div className="space-y-2">
                          <PickBadge 
                            pick={ml.pick}
                            confidence={ml.confidence}
                            type="ml"
                          />
                          {/* Display real moneyline odds */}
                          {(odds.moneyline?.home || odds.moneyline?.away) && (
                            <div className="text-xs text-gray-500">
                              <div>{r.away_team}: {fmtOdds(odds.moneyline.away) || '—'}</div>
                              <div>{r.home_team}: {fmtOdds(odds.moneyline.home) || '—'}</div>
                            </div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    
                    {/* Spread Column - UPDATED with proper display */}
                    <td className="px-4 py-3">
                      {spread ? (
                        <PickBadge 
                          pick={spreadDisplay.displayPick}
                          confidence={spread.confidence}
                          type="spread"
                          modelValue={spread.predicted ? `${spread.predicted > 0 ? '+' : ''}${spread.predicted}` : null}
                          marketValue={spreadDisplay.displayLine}
                        />
                      ) : '—'}
                    </td>
                    
                    {/* Total Column */}
                    <td className="px-4 py-3">
                      {total ? (
                        <PickBadge 
                          pick={total.pick === 'over' ? 'Over' : total.pick === 'under' ? 'Under' : 'Push'}
                          confidence={total.confidence}
                          type="total"
                          modelValue={total.predicted ? `${total.predicted}` : null}
                          marketValue={total.line ? `${total.line}` : null}
                        />
                      ) : '—'}
                    </td>
                    
                    {/* Best Edge Column */}
                    <td className="px-4 py-3">
                      <span className={`font-medium ${
                        bestEdge > 10 ? 'text-green-600' : 
                        bestEdge > 5 ? 'text-yellow-600' : 
                        'text-gray-600'
                      }`}>
                        {bestEdge > 0 ? `${bestEdge.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    
                    {/* Team Stats Column */}
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-1">
                        <div>Home: EPA {r.teamStats?.home?.strength?.toFixed(3) || '—'}</div>
                        <div>Away: EPA {r.teamStats?.away?.strength?.toFixed(3) || '—'}</div>
                        <div>Form: {r.teamStats?.home?.form?.toFixed(3) || '—'}</div>
                        {/* Show if live odds integrated */}
                        {r.modelEnhancements?.oddsIntegrated && (
                          <div className="text-green-600">Live odds ✓</div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {rows.length > 0 && (
        <div className="mt-4 text-xs text-gray-500">
          <p><strong>Pick:</strong> Model's recommended bet with confidence percentage.</p>
          <p><strong>Line:</strong> Displayed from the perspective of the picked team. <strong>Model:</strong> Model's prediction.</p>
          <p><strong>Edge:</strong> Model probability vs market probability difference.</p>
          <p><strong>Live odds ✓:</strong> Real sportsbook data integrated for this game.</p>
        </div>
      )}
    </div>
  );
}
