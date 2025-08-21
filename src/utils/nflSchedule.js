// src/utils/nflSchedule.js
import schedule from '../../data/nfl-schedule-2025.json';

const DAY_MS = 24 * 60 * 60 * 1000;

// Find the Thursday of the week window (Thu–Mon) that contains the given date
function getWindowAnchor(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // JS: 0=Sun..6=Sat; We want Thursday (4)
  const day = d.getUTCDay();
  const diffToThu = (day <= 4) ? (4 - day) : (11 - day); // how many days until Thu this week (or next)
  const thu = new Date(d.getTime() + diffToThu * DAY_MS);
  // If date is already past Monday (i.e., Tue/Wed) relative to the current window, we still use upcoming Thu
  return thu;
}

export function getGamesInWindow(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const anchorThu = getWindowAnchor(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
  const mon = new Date(anchorThu.getTime() + 4 * DAY_MS); // Thu +4 days = Mon

  return schedule.filter(g => {
    const [y,m,d] = g.date.split('-').map(Number);
    const gd = new Date(Date.UTC(y, m-1, d));
    return gd >= anchorThu && gd <= mon;
  });
}

export function nextThursdayISO(now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay();
  const diff = (day <= 4) ? (4 - day) : (11 - day);
  const thu = new Date(d.getTime() + diff * DAY_MS);
  return thu.toISOString().slice(0,10);
}
