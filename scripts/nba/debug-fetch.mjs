#!/usr/bin/env node

import fetch from 'node-fetch';

const gameId = '401704974'; // Lakers vs Warriors Christmas
const playerId = '1966'; // LeBron

const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;

const response = await fetch(url);
const data = await response.json();

const boxscore = data?.boxscore;
const players = [];

// Both teams
for (const teamData of boxscore.players) {
  const teamAbbr = teamData.team?.abbreviation || 'UNK';
  const athletes = teamData.statistics?.[0]?.athletes || [];
  
  for (const athleteData of athletes) {
    const athlete = athleteData.athlete || {};
    players.push({
      id: String(athlete.id),
      name: athlete.displayName,
      team: teamAbbr
    });
  }
}

console.log('\n🔍 All players in game:');
players.forEach(p => console.log(`  ${p.id} - ${p.name} (${p.team})`));

console.log(`\n🎯 Looking for player ID: ${playerId}`);
const found = players.find(p => String(p.id) === String(playerId));
console.log(found ? `✅ FOUND: ${found.name}` : '❌ NOT FOUND');
