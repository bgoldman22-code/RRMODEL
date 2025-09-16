
// --- Normalize team names to abbreviations ---
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
// netlify/functions/nfl-predictions-generate/getRealScheduleForWeek.js
// Extracted helper with absolute URL fix

export async function getRealScheduleForWeek(week, season, teamData) {
  try {
    const scheduleUrl = process.env.NFL_SCHEDULE_URL || 'nfl-schedule-get';
    const baseUrl = process.env.URL || 'https://bgroundrobin.com'; // <- absolute base
    const response = await fetch(`${baseUrl}/.netlify/functions/${scheduleUrl}?week=${week}&season=${season}`);
    if (response.ok) {
      const data = await response.json();
      return (data.matchups || []).map(m => ({
  gameId: m.id,
  home: getTeamAbbreviation(m.homeTeam),
  away: getTeamAbbreviation(m.awayTeam),
  start: m.kickoff
})) || [];
    }
  } catch (e) {
    console.warn('[nfl-predictions] schedule bridge failed, using fallback:', e);
  }

  // Fallback mini generator (kept minimal)
  const teams = Object.keys(teamData || {});
  const games = [];
  for (let i = 0; i < Math.min(16, Math.floor(teams.length / 2)); i++) {
    const home = teams[i * 2], away = teams[i * 2 + 1];
    if (home && away) games.push({ gameId: `W${week}G${i+1}`, week, season, home, away, start: null });
  }
  return games;
}
