import schedule from '../../data/nfl-schedule-2025.json';
export function getWeeksAvailable(){
  const s = new Set(schedule.map(g=>g.week));
  return Array.from(s).sort((a,b)=>a-b);
}
export function getGamesForWeek(week){
  return schedule.filter(g=>g.week===week);
}
