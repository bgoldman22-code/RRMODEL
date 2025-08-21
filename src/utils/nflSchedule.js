// src/utils/nflSchedule.js
import schedule from '../../data/nfl-schedule-2025.json';
export function getWeeksAvailable(){
  const weeks = new Set();
  for (const g of schedule) weeks.add(g.week);
  return Array.from(weeks).sort((a,b)=>a-b);
}
export function getGamesForWeek(week){
  return schedule.filter(g => g.week === week);
}
