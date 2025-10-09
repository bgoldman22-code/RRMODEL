
// --- Name → Abbreviation map (for schedule normalization) ---
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

export // --- DEBUG-ENHANCED SCHEDULE LOADER ---
async function getRealScheduleForWeek(week, season, teamData) {
  const scheduleFn = process.env.NFL_SCHEDULE_URL || 'nfl-schedule-get';
  const baseUrl = process.env.URL || 'https://bgroundrobin.com';
  const url = `${baseUrl}/.netlify/functions/${scheduleFn}?week=${encodeURIComponent(week)}&season=${encodeURIComponent(season)}`;

  try {
    console.log('[sched] Fetching schedule from:', url);
    const response = await fetch(url);
    console.log('[sched] Response status/ok:', response.status, response.ok);

    if (!response.ok) {
      console.warn('[sched] Non-OK response fetching schedule:', response.status);
    } else {
      const data = await response.json();
      const rawCount = (data && (Array.isArray(data.matchups) ? data.matchups.length : 0)) ||
                       (data && (Array.isArray(data.games) ? data.games.length : 0)) ||
                       (data && (Array.isArray(data.schedule) ? data.schedule.length : 0)) || 0;
      console.log('[sched] Raw schedule count:', rawCount);

      // Normalize from matchups first
      const mapped = (data.matchups || []).map(m => ({
        gameId: m.id ?? m.gameId ?? `${m.homeTeam}-${m.awayTeam}-${m.kickoff || ''}`,
        home: getTeamAbbreviation(m.homeTeam),
        away: getTeamAbbreviation(m.awayTeam),
        start: m.kickoff || m.start || m.gameTime
      }));

      console.log('[sched] Mapped games count:', mapped.length);
      if (mapped.length > 0) return mapped;

      // Fallback if only games/schedule exist
      const alt = (data.games || data.schedule || []).map(m => ({
        gameId: m.id ?? m.gameId ?? `${m.home || m.homeTeam}-${m.away || m.awayTeam}-${m.start || ''}`,
        home: getTeamAbbreviation(m.home || m.homeTeam),
        away: getTeamAbbreviation(m.away || m.awayTeam),
        start: m.start || m.kickoff || m.gameTime
      }));
      console.log('[sched] Alt mapped games count:', alt.length);
      if (alt.length > 0) return alt;
    }
  } catch (e) {
    console.warn('[sched] Failed to fetch real schedule:', e && (e.stack || e.message || e));
  }

  // FINAL FALLBACK PATH
  console.log('[sched] Using fallback schedule generation');
  // If you have a known local/static schedule fallback, call it here:
  try {
    if (typeof buildLocalSchedule === 'function') {
      const fb = await buildLocalSchedule(week, season, teamData);
      console.log('[sched] Fallback local schedule count:', Array.isArray(fb) ? fb.length : '(not array)');
      return Array.isArray(fb) ? fb : [];
    }
  } catch (e) {
    console.warn('[sched] Fallback buildLocalSchedule failed:', e && (e.stack || e.message || e));
  }
  return [];
}

