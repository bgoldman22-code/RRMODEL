// nfl-model-v4.1/scripts/_lib/schedule.mjs
// Week detection and schedule management for V4.1 pipeline
// Matches the existing NFL pipeline's week detection system

export function detectCurrentWeek() {
  const now = new Date();
  
  // 2025 NFL Season started September 4, 2025 (Thursday Night Football)
  const seasonStart = new Date('2025-09-04');
  
  // NFL weeks run Tuesday to Monday
  const nowDay = now.getDay(); // 0=Sunday, 1=Monday, 2=Tuesday...
  let adjustedDate = new Date(now);
  
  // If it's Monday, it's still the current week (final day)
  if (nowDay === 1) {
    adjustedDate.setDate(adjustedDate.getDate() - 1);
  }
  
  // Calculate days since season start with adjustment
  const daysSinceStart = Math.floor((adjustedDate - seasonStart) / (24 * 60 * 60 * 1000));
  
  // Convert to weeks with proper NFL week boundaries
  const weeksSinceStart = Math.floor(daysSinceStart / 7) + 1;
  
  // Clamp to reasonable range (Weeks 1-22 to include playoffs)
  let currentWeek = Math.max(1, Math.min(22, weeksSinceStart));
  
  // PREDICTION MODE: On Tuesday-Thursday, predict NEXT week (current week is done)
  if (nowDay >= 2 && nowDay <= 4) {
    currentWeek = currentWeek + 1;
    console.log(`📅 Current NFL Week: ${currentWeek} (NEXT WEEK - predicting upcoming games) (${now.toDateString()})`)
  } else {
    console.log(`📅 Current NFL Week: ${currentWeek} (${now.toDateString()})`)
  }
  
  return currentWeek;
}

export function getCurrentSeason() {
  // 2025-2026 season
  return 2025;
}

export function getSeasonDisplay() {
  return '2025-2026';
}
