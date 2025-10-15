/**
 * Debug NHL Schedule API
 * Check what dates/games are being returned
 */

const today = new Date().toISOString().split('T')[0];
console.log(`🔍 Checking NHL schedule for: ${today}`);
console.log(`   Current time: ${new Date().toISOString()}`);
console.log(`   Current time ET: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
console.log(`\n📡 Fetching: ${scheduleUrl}\n`);

const response = await fetch(scheduleUrl);
const schedule = await response.json();

console.log('📊 FULL RESPONSE:\n');
console.log(JSON.stringify(schedule, null, 2));

console.log('\n\n📅 GAME WEEK BREAKDOWN:\n');

if (schedule.gameWeek) {
  for (const day of schedule.gameWeek) {
    console.log(`\n📆 ${day.date || 'Unknown date'}:`);
    if (day.games && day.games.length > 0) {
      console.log(`   ${day.games.length} games:`);
      for (const game of day.games) {
        console.log(`   - ${game.awayTeam?.abbrev || '???'} @ ${game.homeTeam?.abbrev || '???'}`);
        console.log(`     gameDate: ${game.gameDate}`);
        console.log(`     Starts with ${today}? ${game.gameDate?.startsWith(today)}`);
      }
    } else {
      console.log(`   No games`);
    }
  }
}

console.log('\n\n🎯 FILTERING TEST:\n');

// Extract all games
const allGames = [];
if (schedule.gameWeek) {
  for (const day of schedule.gameWeek) {
    if (day.games) {
      allGames.push(...day.games);
    }
  }
}

console.log(`Total games in week: ${allGames.length}`);

// Filter like the scanner does
const todayGames = allGames.filter(g => g.gameDate?.startsWith(today));
console.log(`Games matching "${today}": ${todayGames.length}`);

if (todayGames.length > 0) {
  console.log('\n✅ MATCHED GAMES:');
  for (const game of todayGames) {
    console.log(`   ${game.awayTeam?.abbrev} @ ${game.homeTeam?.abbrev}`);
    console.log(`   gameDate: ${game.gameDate}`);
  }
} else {
  console.log('\n❌ NO GAMES MATCHED!');
  console.log('\nAll game dates found:');
  for (const game of allGames) {
    console.log(`   ${game.gameDate}`);
  }
}
