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
    // CURRENT: September 24, 2025 = Week 4
    const seasonStart = new Date('2025-09-05');
    const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
    
    if (daysSinceStart < 0) {
      return 1; // Preseason/early
    }
    
    // Updated calculation for accurate Week 4 detection
    // Week 1: Sept 5-11 (Days 0-6)
    // Week 2: Sept 12-18 (Days 7-13) 
    // Week 3: Sept 19-22 (Days 14-17)
    // Week 4: Sept 23+ (Days 18+)
    let weekNumber;
    if (daysSinceStart <= 6) weekNumber = 1;
    else if (daysSinceStart <= 13) weekNumber = 2;
    else if (daysSinceStart <= 17) weekNumber = 3;
    else weekNumber = Math.floor((daysSinceStart - 18) / 7) + 4;
    
    const calculatedWeek = Math.min(Math.max(weekNumber, 1), 18);
    
    // Debug logging for verification
    const monthDay = `${now.getMonth() + 1}/${now.getDate()}`;
    console.log(`🏈 NFL Week Detection: ${monthDay} (Day ${daysSinceStart}) = Week ${calculatedWeek}`);
    
    return calculatedWeek;
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