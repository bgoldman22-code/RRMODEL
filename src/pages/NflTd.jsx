// src/pages/NflTd.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { ENABLE_NFL_TD } from '../config/features';
import { getWeeksAvailable, getGamesForWeek } from '../utils/nflSchedule';
import NflTdTable from '../components/NflTdTable';

function qsWeek(){ const w = parseInt(new URLSearchParams(location.search).get('week')||'',10); return Number.isFinite(w)? w : null; }

export default function NflTd(){
  const weeks = getWeeksAvailable();
  const [week, setWeek] = useState(qsWeek() || (weeks.includes(1)?1:weeks[0]||1));
  const games = useMemo(()=> getGamesForWeek(week), [week]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(()=>{
    const params = new URLSearchParams(location.search);
    params.set('week', String(week));
    history.replaceState(null, '', `?${params.toString()}`);
  }, [week]);

  useEffect(()=>{
    if (!ENABLE_NFL_TD) return;
    setLoading(true); setErr(null);
    
    // Get schedule data first
    fetch(`/.netlify/functions/nfl-schedule-get?week=${week}&season=2025`)
      .then(r => r.json())
      .then(scheduleData => {
        if (!scheduleData.matchups) throw new Error('No schedule data');
        
        // Format games for TD prediction
        const games = scheduleData.matchups.map(game => ({
          game_id: game.id || `${game.homeTeam}-${game.awayTeam}`,
          home_team: getTeamAbbreviation(game.homeTeam),
          away_team: getTeamAbbreviation(game.awayTeam)
        }));
        
        // Call TD predictions with corrected API format
        return fetch(`/.netlify/functions/nfl-td-predictions?week=${week}&season=2025`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ games })
        });
      })
      .then(r => r.json())
      .then(j => {
        if (!j || !j.rows) throw new Error('Bad TD response');
        setRows(j.rows);
      })
      .catch(e => setErr(e.message || 'Error'))
      .finally(() => setLoading(false));
  }, [week]);

  // Helper function for team name mapping
  function getTeamAbbreviation(fullName) {
    const nameMap = {
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
