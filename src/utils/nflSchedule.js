import schedule from '../../data/nfl-schedule-2025.json';

export function getWeeksAvailable() {
  // unique weeks from the schedule file
  const set = new Set(schedule.map(g => g.week));
  return Array.from(set).sort((a,b) => a - b);
}

export function getGamesForWeek(week) {
  return schedule.filter(g => g.week === Number(week));
}
