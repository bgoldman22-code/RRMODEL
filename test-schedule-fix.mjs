/**
 * Test NHL schedule filtering fix locally
 */

const today = new Date().toISOString().split('T')[0];
console.log(`🔍 Testing filter for date: ${today}\n`);

const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
const response = await fetch(scheduleUrl);
const schedule = await response.json();

// Extract all games
const allGames = [];
if (schedule.gameWeek) {
  for (const day of schedule.gameWeek) {
    if (day.games) {
      allGames.push(...day.games);
    }
  }
}

console.log(`📊 Total games in week: ${allGames.length}\n`);

// OLD FILTER (broken)
const oldFilter = allGames.filter(g => g.gameDate?.startsWith(today));
console.log(`❌ OLD FILTER (gameDate): ${oldFilter.length} games`);

// NEW FILTER (fixed)
const newFilter = allGames.filter(g => {
  const gameDate = g.startTimeUTC || g.gameDate;
  return gameDate?.startsWith(today);
});
console.log(`✅ NEW FILTER (startTimeUTC): ${newFilter.length} games\n`);

if (newFilter.length > 0) {
  console.log(`🏒 TODAY'S GAMES (${today}):\n`);
  for (const game of newFilter) {
    console.log(`   ${game.awayTeam?.abbrev} @ ${game.homeTeam?.abbrev}`);
    console.log(`   Start: ${game.startTimeUTC}`);
    console.log(`   Venue: ${game.venue?.default}`);
    console.log('');
  }
} else {
  console.log('❌ Still no games found - something else is wrong');
}
