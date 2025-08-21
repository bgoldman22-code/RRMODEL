import schedule from '../../data/nfl-schedule-2025.json';

// Returns [1, 2, ...] from schedule entries
export function getWeeksAvailable() {
  const set = new Set(schedule.map(g => g.week));
  return Array.from(set).sort((a,b) => a - b);
}

export function getGamesForWeek(week) {
  return schedule.filter(g => Number(g.week) === Number(week));
}
