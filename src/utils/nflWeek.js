// src/utils/nflWeek.js
// Utility to calculate current NFL week based on date

export function getCurrentNFLWeek() {
  const now = new Date();
  const year = now.getFullYear();
  
  // NFL season typically starts first week of September
  // Week 1 usually starts around September 5-12
  // For 2025, let's approximate based on current date
  
  if (year === 2025) {
    // 2025 NFL season started September 5, 2025 (Thursday)
    const seasonStart = new Date('2025-09-05');
    const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
    
    if (daysSinceStart < 0) {
      return 1; // Preseason/early
    }
    
    // Each week is 7 days, but account for Thursday start
    const weekNumber = Math.floor(daysSinceStart / 7) + 1;
    
    // Cap at reasonable max (18 weeks regular season + 4 playoffs = 22)
    return Math.min(Math.max(weekNumber, 1), 22);
  }
  
  // For other years, use a similar calculation
  // This is a simplified version - could be enhanced with actual NFL schedule data
  const septemberStart = new Date(year, 8, 5); // September 5th
  const daysSinceStart = Math.floor((now - septemberStart) / (1000 * 60 * 60 * 24));
  
  if (daysSinceStart < 0) {
    return 1;
  }
  
  const weekNumber = Math.floor(daysSinceStart / 7) + 1;
  return Math.min(Math.max(weekNumber, 1), 22);
}

// Alternative: Get week from data metadata if available
export async function getCurrentNFLWeekFromData() {
  try {
    const response = await fetch('/data/nfl-td-comprehensive-latest.json');
    const data = await response.json();
    return data.metadata?.week || getCurrentNFLWeek();
  } catch (error) {
    console.warn('Could not fetch current week from data, using date calculation:', error);
    return getCurrentNFLWeek();
  }
}