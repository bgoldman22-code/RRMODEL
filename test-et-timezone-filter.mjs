/**
 * Test ET timezone filtering for NHL games
 */

// Get today in ET timezone
const todayET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const [month, day, year] = todayET.split(/[\/,\s]/);
const today = `${year}-${month}-${day}`;

console.log(`🗓️  Today in ET: ${todayET}`);
console.log(`🔍 Formatted as: ${today}\n`);

const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
const response = await fetch(scheduleUrl);
const schedule = await response.json();

const allGames = [];
if (schedule.gameWeek) {
  for (const day of schedule.gameWeek) {
    if (day.games) {
      allGames.push(...day.games);
    }
  }
}

console.log(`📊 Total games in week: ${allGames.length}\n`);

// Filter games by ET timezone
const todayGames = allGames.filter(g => {
  if (!g.startTimeUTC) return false;
  
  const gameTimeET = new Date(g.startTimeUTC).toLocaleString('en-US', { 
    timeZone: 'America/New_York', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  const [gMonth, gDay, gYear] = gameTimeET.split(/[\/,\s]/);
  const gameDate = `${gYear}-${gMonth}-${gDay}`;
  
  return gameDate === today;
});

console.log(`✅ Games found for ${today}: ${todayGames.length}\n`);

if (todayGames.length > 0) {
  console.log(`🏒 TODAY'S GAMES:\n`);
  for (const game of todayGames) {
    const gameTimeET = new Date(game.startTimeUTC).toLocaleString('en-US', { 
      timeZone: 'America/New_York', 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    console.log(`   ${game.awayTeam?.abbrev} @ ${game.homeTeam?.abbrev}`);
    console.log(`   Time ET: ${gameTimeET}`);
    console.log(`   UTC: ${game.startTimeUTC}`);
    console.log('');
  }
} else {
  console.log('❌ No games found');
}
