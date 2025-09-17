import React, { useEffect, useState } from 'react';

/**
 * NFL Predictions Page
 * Updated to work with nfl-predictions-generate2 which handles real schedule data
 */

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const fmtPct = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : (typeof p === 'string' ? p : '—'));
const fmtOdds = (odds) => odds > 0 ? `+${odds}` : `${odds}`;

async function fetchSchedule(week = 3, season = 2024) {
  // First get the schedule data
  const scheduleUrl = `/.netlify/functions/nfl-schedule-get?week=${week}&season=${season}`;
  const scheduleRes = await fetch(scheduleUrl);
  if (!scheduleRes.ok) throw new Error(`Failed to get schedule: ${scheduleRes.status}`);
  const scheduleData = await scheduleRes.json();
  
  // Transform schedule data to the format expected by predictions function
  const games = (scheduleData.matchups || []).map(game => ({
    home_team: getTeamAbbreviation(game.homeTeam),
    away_team: getTeamAbbreviation(game.awayTeam), 
    game_id: game.id || `${game.homeTeam}-${game.awayTeam}`,
    kickoff: game.kickoff
  }));
  
  return games;
}

async function fetchPredictions(week = 3, season = 2024, force = false) {
  // Get schedule first
  const games = await fetchSchedule(week, season);
  
  if (games.length === 0) {
    throw new Error(`No games found for Week ${week}, ${season}`);
  }
  
  // Then get predictions for those games
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
  
  // Transform predictions back to the format expected by the UI
  return {
    rows: predictions.map(pred => ({
      gameId: pred.game_id,
      matchup: `${pred.away_team} @ ${pred.home_team}`,
      start: pred.kickoff,
      pick: pred.predictions.home_win_prob > 0.5 ? pred.home_team : pred.away_team,
      modelPickProb: Math.max(pred.predictions.home_win_prob, pred.predictions.away_win_prob),
      homeProb: pred.predictions.home_win_prob,
      awayProb: pred.predictions.away_win_prob,
      modelEdge: null, // Your function doesn't return this
      confidence: null, // Your function doesn't return this  
      ml_home: null,
      ml_away: null,
      teamStats: pred.teamStats
    })),
    meta: {
      week: week,
      season: season,
      games: predictions.length,
      model: 'advanced_nfl_predictions'
    }
  };
}

// Helper function to convert team names to abbreviations
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

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [week, setWeek] = useState(3);
  const [season, setSeason] = useState(2024);

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

  useEffect(() => { load(false); }, [week, season]);

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
          <div className="flex items-center gap-2">
            <label className="text-sm">Season:</label>
            <select 
              value={season} 
              onChange={(e) => setSeason(Number(e.target.value))}
              className="px-2 py-1 border rounded"
            >
              <option value={2024}>2024</option>
              <option value={2023}>2023</option>
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
              <th className="px-4 py-3 text-left font-medium">Pick</th>
              <th className="px-4 py-3 text-left font-medium">Model Prob</th>
              <th className="px-4 py-3 text-left font-medium">Market Odds</th>
              <th className="px-4 py-3 text-left font-medium">Edge</th>
              <th className="px-4 py-3 text-left font-medium">Confidence</th>
              <th className="px-4 py-3 text-left font-medium">Team Stats</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={8}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={8}>No predictions available for Week {week}, {season}.</td></tr>
            ) : (
              rows.map((r, idx) => {
                const kickoff = r.start ? new Date(r.start).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                }) : '—';
                
                const edge = r.modelEdge;
                const edgeColor = edge > 0 ? 'text-green-600' : edge < -0.05 ? 'text-red-600' : '';

                return (
                  <tr key={r.gameId || idx} className="border-t border-neutral-200 hover:bg-neutral-25">
                    <td className="px-4 py-3 font-medium">{fmt(r.matchup)}</td>
                    <td className="px-4 py-3">{kickoff}</td>
                    <td className="px-4 py-3 font-medium">{fmt(r.pick)}</td>
                    <td className="px-4 py-3">{fmtPct(r.modelPickProb)}</td>
                    <td className="px-4 py-3">
                      {r.ml_home && r.ml_away ? (
                        `${r.ml_home}/${r.ml_away}`
                      ) : '—'}
                    </td>
                    <td className={`px-4 py-3 ${edgeColor}`}>
                      {edge !== null && edge !== undefined ? `${edge > 0 ? '+' : ''}${(edge * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        (r.confidence || 0) >= 7 ? 'bg-green-100 text-green-800' :
                        (r.confidence || 0) >= 4 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {r.confidence || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-1">
                        <div>Home: EPA {r.teamStats?.home?.epa?.toFixed(3) || '—'}</div>
                        <div>Away: EPA {r.teamStats?.away?.epa?.toFixed(3) || '—'}</div>
                        <div>Form: {r.teamStats?.home?.form?.toFixed(3) || '—'}</div>
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
          <p><strong>Edge:</strong> Model probability vs market probability. Positive = model favors pick.</p>
          <p><strong>Confidence:</strong> Based on edge magnitude and other factors. Higher = stronger conviction.</p>
          <p><strong>EPA:</strong> Expected Points Added - offensive efficiency metric.</p>
        </div>
      )}
    </div>
  );
}
