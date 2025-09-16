// netlify/functions/nfl-predictions-generate/getRealScheduleForWeek.js
// Extracted helper with absolute URL fix

export async function getRealScheduleForWeek(week, season, teamData) {
  try {
    const scheduleUrl = process.env.NFL_SCHEDULE_URL || 'nfl-schedule-get';
    const baseUrl = process.env.URL || 'https://bgroundrobin.com'; // <- absolute base
    const response = await fetch(`${baseUrl}/.netlify/functions/${scheduleUrl}?week=${week}&season=${season}`);
    if (response.ok) {
      const data = await response.json();
      return data.matchups || data.games || data.schedule || [];
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
