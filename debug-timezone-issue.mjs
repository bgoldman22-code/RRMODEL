/**
 * Debug timezone issue for NBA predictions
 */

console.log('🕐 TIMEZONE DEBUG');
console.log('='.repeat(60));

// What the function currently does
const serverDate = new Date();
const serverToday = serverDate.toISOString().split('T')[0].replace(/-/g, '');

console.log('\n📍 Server (Netlify UTC):');
console.log('  Current time:', serverDate.toISOString());
console.log('  Date used:', serverToday);
console.log('  Hour (UTC):', serverDate.getUTCHours());

// What it looks like in different US timezones
const estOffset = -5; // EST (winter)
const pstOffset = -8; // PST (winter)

const estDate = new Date(serverDate.getTime() + (estOffset * 60 * 60 * 1000));
const pstDate = new Date(serverDate.getTime() + (pstOffset * 60 * 60 * 1000));

console.log('\n🗽 EST/New York:');
console.log('  Local time:', estDate.toISOString());
console.log('  Hour:', estDate.getUTCHours() + estOffset);

console.log('\n🌴 PST/Los Angeles:');
console.log('  Local time:', pstDate.toISOString());
console.log('  Hour:', pstDate.getUTCHours() + pstOffset);

// Check ESPN API for different dates
console.log('\n' + '='.repeat(60));
console.log('🏀 CHECKING ESPN API FOR DIFFERENT DATES:');
console.log('='.repeat(60));

const datesToCheck = [
  { label: 'Yesterday', date: new Date(Date.now() - 86400000).toISOString().split('T')[0].replace(/-/g, '') },
  { label: 'Today (UTC)', date: serverToday },
  { label: 'Tomorrow', date: new Date(Date.now() + 86400000).toISOString().split('T')[0].replace(/-/g, '') }
];

for (const {label, date} of datesToCheck) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`;
  console.log(`\n${label} (${date}):`);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    const count = data.events?.length || 0;
    
    console.log(`  ✓ ${count} game(s) found`);
    
    if (count > 0) {
      data.events.forEach(event => {
        const comp = event.competitions[0];
        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        const gameDate = new Date(event.date);
        console.log(`    - ${away.team.abbreviation} @ ${home.team.abbreviation}`);
        console.log(`      Game time: ${gameDate.toISOString()}`);
        console.log(`      In EST: ${gameDate.toLocaleString('en-US', {timeZone: 'America/New_York'})}`);
        console.log(`      In PST: ${gameDate.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'})}`);
      });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('💡 SOLUTION:');
console.log('='.repeat(60));
console.log('Use US Eastern Time (America/New_York) for date calculation');
console.log('This ensures games scheduled for 9pm EST show up on the correct day');
