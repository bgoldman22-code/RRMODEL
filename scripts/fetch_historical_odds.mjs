#!/usr/bin/env node

/**
 * MLB HR Round Robin - Historical Odds Fetcher
 * 
 * Fetches historical odds from TheOddsAPI
 * Market: h2h (moneyline) - game-level odds available historically
 * Budget: 50K credits (approved)
 * Coverage: 2021-2024 (2025 may not be in historical endpoint yet)
 */

import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

const API_KEY = 'c5d3fe15e6c5be83b2acd8695cff012b';
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'baseball_mlb';
const MARKET = 'h2h'; // Moneyline - available historically
const MAX_CREDITS_TO_USE = 5000; // Safety limit - stop before burning through all 50K

class HistoricalOddsFetcher {
  constructor() {
    this.apiKey = API_KEY;
    this.creditsUsed = 0;
    this.creditsRemaining = 50000;
    this.maxCreditsToUse = MAX_CREDITS_TO_USE;
    this.dataPath = '/Users/brentgoldman/RRMODEL/data/mlb_historical/odds';
  }

  /**
   * Fetch historical odds for date range
   * Uses VERY SPARSE sampling to conserve credits
   * Strategy: 2-3 key dates per month (opening week, mid-season, playoff race)
   */
  async fetchHistorical(startDate, endDate, keyDatesOnly = true) {
    console.log('🎲 Fetching Historical Odds from TheOddsAPI\n');
    console.log(`Date Range: ${startDate} to ${endDate}`);
    console.log(`Market: ${MARKET} (moneyline)`);
    console.log(`Bookmaker: FanDuel (primary)`);
    console.log(`Strategy: ${keyDatesOnly ? 'KEY DATES ONLY (2-3/month)' : 'Weekly sampling'}`);
    console.log(`Budget: ${this.creditsRemaining.toLocaleString()} credits\n`);
    
    const dates = keyDatesOnly ? 
      this.generateKeyDates(startDate, endDate) : 
      this.generateDateRange(startDate, endDate, 7);
    console.log(`Total dates to fetch: ${dates.length}\n`);
    
    await fs.mkdir(this.dataPath, { recursive: true });
    
    let successCount = 0;
    let errorCount = 0;
    let totalGames = 0;
    
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      console.log(`[${i + 1}/${dates.length}] Fetching ${date}...`);
      
      try {
        const odds = await this.fetchOddsForDate(date);
        
        if (odds && odds.length > 0) {
          await this.saveOdds(date, odds);
          successCount++;
          totalGames += odds.length;
          console.log(`  ✅ Saved ${odds.length} games (Total: ${totalGames}, Credits: ${this.creditsUsed})`);
        } else {
          console.log(`  ⚠️  No odds available for ${date}`);
        }
        
        // Rate limiting - be conservative
        await this.sleep(1500); // 1.5 seconds between requests
        
      } catch (error) {
        console.error(`  ❌ Error fetching ${date}: ${error.message}`);
        errorCount++;
        
        // If we hit rate limits, slow down
        if (error.message.includes('429') || error.message.includes('rate')) {
          console.log('  ⏸️  Rate limit hit, waiting 5 seconds...');
          await this.sleep(5000);
        }
      }
      
      // SAFETY CHECK: Stop if approaching credit limit
      if (this.creditsUsed >= this.maxCreditsToUse) {
        console.warn(`\n⚠️  Safety limit reached (${this.creditsUsed}/${this.maxCreditsToUse} credits used)!`);
        console.warn('   Stopping to avoid burning through budget.');
        break;
      }
    }
    
    console.log('\n📊 FETCH SUMMARY:');
    console.log(`Success: ${successCount} dates`);
    console.log(`Errors: ${errorCount} dates`);
    console.log(`Total games: ${totalGames}`);
    console.log(`Credits used: ${this.creditsUsed.toLocaleString()}/${this.creditsRemaining.toLocaleString()}`);
    console.log(`Safety limit: ${this.maxCreditsToUse.toLocaleString()} credits`);
    console.log(`Data saved to: ${this.dataPath}\n`);
  }

  /**
   * Fetch odds for specific date using historical endpoint
   */
  async fetchOddsForDate(date) {
    // CORRECT endpoint: /odds-history
    // Format date as ISO 8601 with time: YYYY-MM-DDTHH:MM:SSZ
    const dateTime = `${date}T12:00:00Z`; // Noon UTC
    
    const url = `${BASE_URL}/sports/${SPORT}/odds-history`;
    const params = new URLSearchParams({
      apiKey: this.apiKey,
      regions: 'us',
      markets: MARKET,
      dateFormat: 'iso',
      oddsFormat: 'american',
      bookmakers: 'fanduel', // Primary bookmaker
      date: dateTime
    });
    
    const response = await fetch(`${url}?${params}`);
    
    // Track credits
    const remaining = response.headers.get('x-requests-remaining');
    if (remaining) {
      const used = response.headers.get('x-requests-used');
      if (used) {
        this.creditsUsed += parseInt(used);
        this.creditsRemaining = parseInt(remaining);
      }
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    // Parse response into game odds
    return this.parseOddsResponse(data, date);
  }

  /**
   * Parse API response into game odds
   */
  parseOddsResponse(apiData, date) {
    const gameOdds = [];
    
    if (!apiData || !apiData.data || !Array.isArray(apiData.data)) {
      return gameOdds;
    }

    for (const game of apiData.data) {
      const gameId = game.id;
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      const commenceTime = game.commence_time;
      
      // Extract FanDuel odds
      for (const bookmaker of game.bookmakers || []) {
        if (bookmaker.key === 'fanduel') {
          for (const market of bookmaker.markets || []) {
            if (market.key === 'h2h') {
              // Store both home and away moneylines
              const homeOutcome = market.outcomes.find(o => o.name === homeTeam);
              const awayOutcome = market.outcomes.find(o => o.name === awayTeam);
              
              gameOdds.push({
                date,
                gameId,
                homeTeam,
                awayTeam,
                commenceTime,
                bookmaker: 'fanduel',
                market: 'h2h',
                homeOdds: homeOutcome?.price || null,
                awayOdds: awayOutcome?.price || null,
                lastUpdate: market.last_update,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      }
    }
    
    return gameOdds;
  }

  /**
   * Save odds to file
   */
  async saveOdds(date, odds) {
    const year = date.split('-')[0];
    const yearPath = path.join(this.dataPath, year);
    await fs.mkdir(yearPath, { recursive: true });
    
    const filePath = path.join(yearPath, `${date}.json`);
    await fs.writeFile(filePath, JSON.stringify(odds, null, 2));
  }

  /**
   * Generate key dates only (2-3 per month to conserve credits)
   * For backtest, we just need representative odds samples, not every day
   */
  generateKeyDates(startDate, endDate) {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Sample 3 dates per month: early (5th), mid (15th), late (25th)
    let current = new Date(start);
    current.setDate(1); // Start of month
    
    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth();
      
      // Early month (5th)
      const early = new Date(year, month, 5);
      if (early >= start && early <= end) {
        dates.push(early.toISOString().split('T')[0]);
      }
      
      // Mid month (15th)
      const mid = new Date(year, month, 15);
      if (mid >= start && mid <= end) {
        dates.push(mid.toISOString().split('T')[0]);
      }
      
      // Late month (25th)
      const late = new Date(year, month, 25);
      if (late >= start && late <= end) {
        dates.push(late.toISOString().split('T')[0]);
      }
      
      // Next month
      current.setMonth(current.getMonth() + 1);
    }
    
    return dates;
  }

  /**
   * Generate date range with sampling interval
   */
  generateDateRange(startDate, endDate, interval = 1) {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + interval)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    
    return dates;
  }

  /**
   * Check remaining credits
   */
  async checkCredits() {
    const url = `${BASE_URL}/sports`;
    const params = new URLSearchParams({
      apiKey: this.apiKey
    });
    
    const response = await fetch(`${url}?${params}`);
    
    if (response.ok) {
      const remaining = response.headers.get('x-requests-remaining');
      console.log(`Credits remaining: ${remaining}`);
      return parseInt(remaining);
    }
    
    return null;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const fetcher = new HistoricalOddsFetcher();
  
  // Check credits first
  console.log('Checking API credits...\n');
  await fetcher.checkCredits();
  
  // Fetch historical odds for 2021-2024 (2025 may not be available yet)
  // Using SPARSE sampling: 3 dates per month (early/mid/late)
  // Total: ~21 dates/year × 4 years = ~84 dates (vs 900+ daily)
  const years = [
    { start: '2021-04-01', end: '2021-10-31', name: '2021' },
    { start: '2022-04-07', end: '2022-11-05', name: '2022' },
    { start: '2023-03-30', end: '2023-11-01', name: '2023' },
    { start: '2024-03-28', end: '2024-10-31', name: '2024' }
  ];
  
  console.log('📊 CREDIT ESTIMATE:');
  console.log('Strategy: 3 key dates per month (5th, 15th, 25th)');
  console.log('Estimated dates: ~21 per season × 4 seasons = ~84 dates');
  console.log('Credits per request: ~1-10 (varies by games returned)');
  console.log('Estimated total: ~500-1,000 credits (vs 50,000 budget)');
  console.log(`🛡️  SAFETY LIMIT: Will stop at ${MAX_CREDITS_TO_USE.toLocaleString()} credits\n`);
  
  for (const year of years) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Fetching ${year.name} season`);
    console.log('='.repeat(60) + '\n');
    
    // Use key dates only
    await fetcher.fetchHistorical(year.start, year.end, true);
    
    if (fetcher.creditsUsed >= fetcher.maxCreditsToUse) {
      console.warn('\n🛑 Safety limit reached. Stopping to preserve credits.');
      break;
    }
  }
  
  console.log('\n✅ Historical odds fetch complete!\n');
  console.log('📝 NOTE: Using sparse sampling (3 dates/month) to conserve credits');
  console.log('   This provides representative odds without burning through budget.');
  console.log('   For backtest purposes, we just need market efficiency baseline.\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { HistoricalOddsFetcher };
