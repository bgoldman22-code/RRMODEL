import React from 'react';
import { getCurrentNFLWeekFromData } from '../../utils/nflWeek.js';

const fmtLocal = (iso) => {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(d);
  } catch { return iso; }
};

const Cell = ({children}) => <td className="px-3 py-2 align-top">{children}</td>;

export default function NFLPredictionsPage() {
  const [data, setData] = React.useState({ rows: [], updated: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [week, setWeek] = React.useState('4'); // Will be updated to current week
  const [season, setSeason] = React.useState('2025');

  // Initialize with current NFL week
  React.useEffect(() => {
    const initializeWeek = async () => {
      try {
        const currentWeek = await getCurrentNFLWeekFromData();
        setWeek(currentWeek.toString());
      } catch (error) {
        console.warn('Could not determine current NFL week, using default');
      }
    };
    initializeWeek();
  }, []);

  const loadPredictions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First get the schedule
      const scheduleRes = await fetch(`/.netlify/functions/nfl-schedule-get?week=${week}&season=${season}`);
      const scheduleData = await scheduleRes.json();
      
      // Handle both 'games' and 'matchups' array names
      const games = scheduleData.games || scheduleData.matchups || [];
      
      if (games.length === 0) {
        setData({ rows: [], updated: null });
        setLoading(false);
        return;
      }

      // Convert team names to abbreviations if needed
      const teamNameToAbbr = {
        'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
        'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
        'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
        'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
        'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
        'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
        'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
        'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
        'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
        'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
        'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
      };

      // Transform games to expected format
      const transformedGames = games.map(game => ({
        game_id: game.id,
        home_team: teamNameToAbbr[game.homeTeam] || game.home_team,
        away_team: teamNameToAbbr[game.awayTeam] || game.away_team,
        start: game.kickoff
      }));

      // Then get predictions
      const predictionsRes = await fetch('/.netlify/functions/nfl-predictions-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season: season,
          week: parseInt(week, 10), // Include week in POST body
          games: transformedGames
        })
      });
      
      const predictions = await predictionsRes.json();
      
      // Transform data for display
      const rows = predictions.map(game => ({
        id: game.game_id,
        kickoff: game.start,
        matchup: `${game.away_team} @ ${game.home_team}`,
        away_abbr: game.away_team,
        home_abbr: game.home_team,
        
        // Predictions from nested structure
        pick_ml: game.predictions?.moneyline ? {
          team: game.predictions.moneyline.pick,
          type: 'ML',
          confidence: game.predictions.moneyline.confidence / 100
        } : null,
        
        pick_spread: game.predictions?.spread ? {
          team: game.predictions.spread.pick,
          line: game.predictions.spread.line,
          confidence: game.predictions.spread.confidence / 100
        } : null,
        
        pick_total: game.predictions?.total ? {
          side: game.predictions.total.pick,
          line: game.predictions.total.line,
          confidence: game.predictions.total.confidence / 100
        } : null,
        
        // Odds lines (you may need to adjust based on your odds data structure)
        ml_home_best: game.odds?.ml_home || null,
        ml_away_best: game.odds?.ml_away || null,
        spread_line: game.odds?.spread_line || game.predictions?.spread?.line || null,
        spread_team: game.home_team, // Assuming spread is shown for home team
        total_line: game.odds?.total_line || game.predictions?.total?.line || null,
        total_side: 'O/U'
      }));
      
      setData({ 
        rows, 
        updated: new Date().toISOString() 
      });
      
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [week, season]);

  React.useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">NFL Predictions</h1>
          {data.updated && <span className="text-sm text-gray-500">updated {fmtLocal(data.updated)}</span>}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Week:</label>
            <select 
              value={week} 
              onChange={(e) => setWeek(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {Array.from({length: 18}, (_, i) => (
                <option key={i+1} value={i+1}>Week {i+1}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Season:</label>
            <select 
              value={season} 
              onChange={(e) => setSeason(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>
          </div>
          
          <button 
            onClick={loadPredictions}
            className="bg-black text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">Error: {error}</div>}

      {!loading && !error && data.rows.length === 0 && (
        <div className="text-gray-500">No predictions available for Week {week}, {season}</div>
      )}

      {!loading && !error && data.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Kickoff (Local)</th>
                <th className="px-3 py-2 text-left">Matchup</th>
                <th className="px-3 py-2 text-left">Moneyline, Spread, Total Lines</th>
                <th className="px-3 py-2 text-left">Moneyline Pick</th>
                <th className="px-3 py-2 text-left">Spread Pick</th>
                <th className="px-3 py-2 text-left">O/U Pick</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {data.rows.map(r => {
                const lines = [
                  (r.ml_home_best!=null || r.ml_away_best!=null) ? `ML: ${r.away_abbr} ${r.ml_away_best ?? '—'} / ${r.home_abbr} ${r.ml_home_best ?? '—'}` : null,
                  (r.spread_line!=null) ? `Spread: ${r.spread_team} ${r.spread_line}` : null,
                  (r.total_line!=null) ? `Total: ${r.total_side||'—'} ${r.total_line}` : null,
                ].filter(Boolean).join(' · ');

                const ml = r.pick_ml;
                const sp = r.pick_spread;
                const to = r.pick_total;

                const Badge = ({text, conf}) => (
                  <div className="inline-flex items-center gap-2">
                    <span className="font-medium">{text}</span>
                    {conf!=null && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">
                        {(conf*100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                );

                return (
                  <tr key={r.id} className="border-t border-gray-200">
                    <Cell>{fmtLocal(r.kickoff)}</Cell>
                    <Cell>{r.matchup}</Cell>
                    <Cell>{lines || '—'}</Cell>
                    <Cell>{ml ? <Badge text={`${ml.team} (${ml.type})`} conf={ml.confidence}/> : '—'}</Cell>
                    <Cell>{sp ? <Badge text={`${sp.team} ${sp.line ?? ''}`} conf={sp.confidence}/> : '—'}</Cell>
                    <Cell>{to ? <Badge text={`${to.side} ${to.line ?? ''}`} conf={to.confidence}/> : '—'}</Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
