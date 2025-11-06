#!/usr/bin/env node

/**
 * Check what markets are actually available for NFL from TheOddsAPI
 */

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

async function checkSportInfo() {
  console.log('Checking available NFL markets from TheOddsAPI...\n');
  
  // First, get sport info which includes available markets
  const sportInfoUrl = `${BASE_URL}/sports/americanfootball_nfl?apiKey=${ODDS_API_KEY}`;
  
  try {
    const response = await fetch(sportInfoUrl);
    
    if (!response.ok) {
      console.error(`Failed to fetch sport info: ${response.status}`);
      const errorText = await response.text();
      console.error(errorText);
      return;
    }
    
    const sportInfo = await response.json();
    console.log('Sport Info:', JSON.stringify(sportInfo, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSportInfo();
