// src/pages/NFL_TD.jsx
import React, { useEffect, useMemo, useState } from 'react';

// Simple error boundary for runtime errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    // You can log errorInfo here if needed
  }
  render() {
    if (this.state.hasError) {
      return <div style={{color:'red',padding:'2em'}}>
        <h2>Something went wrong in NFL TD page.</h2>
        <pre>{String(this.state.error)}</pre>
      </div>;
    }
    return this.props.children;
  }
}
// Canonical version: fetches schedule and player data from committed JSON files
import NflTdTable from '../components/NflTdTable';

function qsWeek(){ const w = parseInt(new URLSearchParams(location.search).get('week')||'',10); return Number.isFinite(w)? w : null; }

function getTeamAbbreviation(fullName) {
  const nameMap = {
    'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL', 'Buffalo Bills': 'BUF',
    'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI', 'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE',
    'Dallas Cowboys': 'DAL', 'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX', 'Kansas City Chiefs': 'KC',
    'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC', 'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA',
    'Minnesota Vikings': 'MIN', 'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
    'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT', 'San Francisco 49ers': 'SF',
    'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB', 'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
  };
  return nameMap[fullName] || fullName;
}

function NflTdInner(){
  const [week, setWeek] = useState(qsWeek() || 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(()=>{
    const params = new URLSearchParams(location.search);
    params.set('week', String(week));
    history.replaceState(null, '', `?${params.toString()}`);
  }, [week]);

  useEffect(()=>{
    setLoading(true); setErr(null);
    // Load schedule from committed JSON
    fetch('/public/data/nfl-schedule-2025.json')
      .then(r => r.json())
      .then(scheduleData => {
        if (!scheduleData.weeks || !scheduleData.weeks[week]) throw new Error('No schedule data');
        const matchups = scheduleData.weeks[week].matchups || [];
        // Format games for TD prediction
        const games = matchups.map(game => ({
          game_id: game.id || `${game.homeTeam}-${game.awayTeam}`,
          home_team: getTeamAbbreviation(game.homeTeam),
          away_team: getTeamAbbreviation(game.awayTeam)
        }));
        // Load player data from committed JSON
        return fetch('/public/nfl-anytime-td-player-data.json')
          .then(r => r.json())
          .then(playerData => {
            // Flatten player data for table
            const players = Object.values(playerData.players || {});
            // Build rows for each game/player
            const rows = [];
            for (const game of games) {
              for (const player of players) {
                if (player.team === game.home_team || player.team === game.away_team) {
                  rows.push({
                    ...player,
                    game: `${game.away_team} @ ${game.home_team}`
                  });
                }
              }
            }
            setRows(rows);
          });
      })
      .catch(e => setErr(e.message || 'Error'))
      .finally(() => setLoading(false));
  }, [week]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-2">NFL — Anytime TD Candidates (from committed JSON)</h1>
      <div className="mb-4 flex gap-2 items-center">
        <label>Week:
          <select value={week} onChange={e => setWeek(Number(e.target.value))} className="ml-2 border rounded px-2 py-1">
            {[...Array(18)].map((_,i) => <option key={i+1} value={i+1}>{i+1}</option>)}
          </select>
        </label>
        {loading && <span className="text-gray-500 ml-2">Loading…</span>}
        {err && <span className="text-red-600 ml-2">{err}</span>}
      </div>
      <NflTdTable rows={rows} />
    </div>
  );
}

export default function NflTdPage() {
  return <ErrorBoundary><NflTdInner /></ErrorBoundary>;
}
      "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
      "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
      "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
      "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
      "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
      "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
      "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
      "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
      "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
      "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
      "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
    };
    return nameMap[fullName] || fullName;
  }

  if (!ENABLE_NFL_TD){
    return <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-3 text-sm text-gray-500">
        <a href="/nfl">NFL</a> / Anytime TD
      </div>
      <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
      <p className="text-sm opacity-70">This feature is currently disabled.</p>
    </div>;
  }

  const topEV = useMemo(()=> rows.filter(r=> typeof r.value==='number').slice(0, 20), [rows]);
  const highProb = useMemo(()=> rows.slice().sort((a,b)=> b.td_prob - a.td_prob).slice(0, 20), [rows]);
  const longshots = useMemo(()=> rows.filter(r=> r.model_american >= 300).slice(0, 20), [rows]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-3 text-sm text-gray-500">
        <a href="/nfl">NFL</a> / Anytime TD
      </div>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">NFL — Anytime TD</h1>
        <select className="border rounded px-2 py-1" value={week} onChange={e=> setWeek(parseInt(e.target.value,10))}>
          {weeks.map(w=> <option key={w} value={w}>Week {w}</option>)}
        </select>
      </div>

      {err && <div className="text-red-600 mb-3">{String(err)}</div>}
      {loading && <div className="opacity-70">Loading…</div>}

      {!loading && <>
        <NflTdTable title="Top EV / Value" rows={topEV} emptyText="No EV edges yet (odds-agnostic mode)" />
        <NflTdTable title="Highest Model Probability" rows={highProb} emptyText="No players" />
        <NflTdTable title="Longshot Radar (≥ +300)" rows={longshots} emptyText="No longshots" />
      </>}
    </div>
  );
}


export default function NflTd() {
  return (
    <ErrorBoundary>
      <NflTdInner />
    </ErrorBoundary>
  );
}
