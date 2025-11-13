#!/usr/bin/env node

/**
 * Inspect ESPN API response to understand structure
 */

async function inspectESPN() {
  try {
    console.log('🔍 Fetching ESPN defensive stats...\n');
    
    // Try 2024-25 season first
    const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/statistics?season=2025&group=defense';
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('📊 ESPN API Response Structure:');
    console.log('================================\n');
    
    console.log('Top-level keys:', Object.keys(data));
    console.log('\n');
    
    if (data.statistics) {
      console.log('statistics array length:', data.statistics.length);
      console.log('\nFirst statistic:');
      console.log(JSON.stringify(data.statistics[0], null, 2));
    }
    
    // Save full response for inspection
    const fs = await import('fs/promises');
    await fs.writeFile('/tmp/espn-defense-sample.json', JSON.stringify(data, null, 2));
    console.log('\n✅ Full response saved to /tmp/espn-defense-sample.json');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

inspectESPN();
