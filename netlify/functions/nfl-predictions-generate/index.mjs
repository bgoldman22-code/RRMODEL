// netlify/functions/nfl-predictions-generate2/index.mjs
// Adapted to use getStore-based helper (../_lib/blobs-nfl.js)
import { nflBlobsGetJSON as nflGetJSON, nflBlobsPutJSON as nflSetJSON } from '../_lib/blobs-nfl.js';
import { getWeekSchedule } from '../_lib/schedule-source.mjs';
import { getWeatherImpact } from '../_lib/weather.mjs';
import { travelImpact } from '../_lib/travel.mjs';

// --- Team name → abbreviation map ---
function getTeamAbbreviation(fullName) {
  const nameMap = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Los Angeles Rams": "LA", "Los Angeles Chargers": "LAC",
    "Las Vegas Raiders": "LV", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "Seattle Seahawks": "SEA", "San Francisco 49ers": "SF", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
  };
  return nameMap[fullName] || fullName;
}

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week')) || 3;   // default to week 3
    const season = Number(url.searchParams.get('season')) || new Date().getFullYear();
    const force = url.searchParams.get('force') === '1';

    // 1) Load NFLVerse team form data
    let teamForm = await nflGetJSON('team_form.json', null);
    const meta = { teamForm: { source: teamForm ? 'blobs' : 'missing' } };

    if (!teamForm || force) {
      try {
        const response = await fetch((process.env.URL || '') + '/nflverse-team-form.json');
        if (response.ok) {
          teamForm = await response.json();
          await nflSetJSON('team_form.json', teamForm);
          meta.teamForm.source = 'nflverse_file';
        }
      } catch (e) {
        console.warn('Failed to load nflverse-team-form.json:', e);
      }
    }

    if (!teamForm || !teamForm.team_data) {
      return json({
        error: 'No team form data available',
        hint: 'Ensure /nflverse-team-form.json exists or run teamform-refresh'
      }, 400);
    }

    // 2) Get schedule
    const games = await getRealScheduleForWeek(week, season, teamForm.team_data);
    const schedule = await getWeekSchedule({ week, season, games });

    // 3) Generate predictions
    const rows = schedule.map(game => {
      const homeTeam = teamForm.team_data[game.home];
      const awayTeam = teamForm.team_data[game.away];
      if (!homeTeam || !awayTeam) return null;

      const homeStrength = calculateTeamStrength(homeTeam, true);
      const awayStrength = calculateTeamStrength(awayTeam, false);
      const strengthDiff = homeStrength - awayStrength;

      let homeProb = 0.5 + (strengthDiff * 0.35);
      const factors = [];
      if ((homeTeam.form || 0) > 0.05) factors.push('home_hot');
      if ((awayTeam.form || 0) > 0.05) factors.push('away_hot');
      if ((homeTeam.form || 0) < -0.05) factors.push('home_cold');
      if ((awayTeam.form || 0) < -0.05) factors.push('away_cold');

      homeProb = Math.max(0.15, Math.min(0.85, homeProb));
      const awayProb = 1 - homeProb;

      const pick = homeProb >= 0.5 ? game.home : game.away;
      const modelPickProb = homeProb >= 0.5 ? homeProb : awayProb;

      let ml_home = null, ml_away = null, marketProb = null, modelEdge = null, confidence = null;
      if (game.odds?.ml_home != null && game.odds?.ml_away != null) {
        ml_home = game.odds.ml_home;
        ml_away = game.odds.ml_away;
        const marketHome = americanToImplied(ml_home);
        const marketAway = americanToImplied(ml_away);
        marketProb = pick === game.home ? marketHome : marketAway;
        modelEdge = modelPickProb - marketProb;
        confidence = bucketConfidence(modelEdge);
      }

      return {
        gameId: game.gameId,
        matchup: `${game.away} @ ${game.home}`,
        start: game.start ?? null,
        pick,
        homeProb: round3(homeProb),
        awayProb: round3(awayProb),
        modelPickProb: round3(modelPickProb),
        marketProb: marketProb != null ? round3(marketProb) : null,
        modelEdge: modelEdge != null ? round3(modelEdge) : null,
        ml_home, ml_away,
        confidence,
        factors,
        oddsSource: game.oddsSource || 'none',
        teamStats: {
          home: {
            epa: round3(homeTeam.offense?.epa_per_play || 0),
            form: round3(homeTeam.form || 0),
            strength: round3(homeStrength)
          },
          away: {
            epa: round3(awayTeam.offense?.epa_per_play || 0),
            form: round3(awayTeam.form || 0),
            strength: round3(awayStrength)
          }
        }
      };
    }).filter(Boolean);

    rows.sort((a, b) => (b.modelEdge || 0) - (a.modelEdge || 0));

    return json({
      meta: { ...meta, week, season, games: rows.length, updatedAt: new Date().toISOString(), model: 'nflverse_epa_v1' },
      rows
    });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};

function calculateTeamStrength(teamData, isHome) {
  const offEPA = teamData.offense?.epa_per_play || 0;
  const defEPA = -(teamData.defense?.epa_allowed_per_play || 0);
  const recentForm = teamData.form || 0;
  let strength = 0.5 + (offEPA * 0.4) + (defEPA * 0.4) + (recentForm * 0.2);
  if (isHome) strength += 0.025;
  return Math.max(0.1, Math.min(0.9, strength));
}

async function getRealScheduleForWeek(week, season, teamData) {
  try {
    const scheduleUrl = process.env.NFL_SCHEDULE_URL || 'nfl-schedule-get';
    const baseUrl = process.env.URL || 'https://bgroundrobin.com';
    const response = await fetch(`${baseUrl}/.netlify/functions/${scheduleUrl}?week=${week}&season=${season}`);
    
    if (response.ok) {
      const data = await response.json();
      
      // FIXED: Check data.matchups FIRST since that's what your endpoint returns
      const rawGames = data.matchups || data.games || data.schedule || [];
      
      // Transform the raw games to match your expected format
      return rawGames.map(game => ({
        gameId: game.id || game.gameId || `${game.homeTeam || game.home}-${game.awayTeam || game.away}`,
        home: getTeamAbbreviation(game.homeTeam || game.home),
        away: getTeamAbbreviation(game.awayTeam || game.away), 
        start: game.kickoff || game.start || null,
        week,
        season
      }));
    }
  } catch (e) {
    console.warn('Failed to fetch real schedule:', e);
  }

  // Fallback mini generator
  const teams = Object.keys(teamData || {});
  const games = [];
  for (let i = 0; i < Math.min(16, Math.floor(teams.length / 2)); i++) {
    const home = teams[i * 2], away = teams[i * 2 + 1];
    if (home && away) games.push({ gameId: `W${week}G${i+1}`, week, season, home, away, start: null });
  }
  return games;
}

function round3(x) { return Math.round(x * 1000) / 1000; }
function americanToImplied(a) {
  const n = Number(a);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}
function bucketConfidence(edge) {
  if (edge == null) return null;
  const e = Math.abs(edge);
  if (e >= 0.15) return 9;
  if (e >= 0.12) return 8;
  if (e >= 0.09) return 7;
  if (e >= 0.06) return 6;
  if (e >= 0.04) return 5;
  if (e >= 0.03) return 4;
  if (e >= 0.02) return 3;
  if (e >= 0.01) return 2;
  return 1;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { 'content-type': 'application/json' }
  });
}
