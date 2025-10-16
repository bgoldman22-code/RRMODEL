/**
 * NHL Closing Odds Fetcher
 * 
 * Fetches closing odds RIGHT BEFORE games start (30-60 min before puck drop)
 * Updates predictions CSV with closing_odds column for accurate ROI calculation
 * 
 * Run schedule: 30 minutes before first game of the day
 * 
 * WHY THIS MATTERS:
 * - Opening odds (12pm ET) != Closing odds (game time)
 * - Line moves from sharp action, injuries, public money
 * - ROI should be calculated using CLOSING odds (what you'd actually get)
 * - Tracks CLV (Closing Line Value) to measure bet timing quality
 */

import fs from 'fs';
import path from 'filepath';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ODDS_API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;

/**
 * Fetch closing odds for today's NHL games
 */
async function fetchClosingOdds(date) {
  if (!ODDS_API_KEY) {
    console.warn('⚠️ No Odds API key - cannot fetch closing odds');
    return new Map();
  }

  const dateStr = date || new Date().toISOString().split('T')[0];
  
  try {
    console.log(`🎯 Fetching closing odds for ${dateStr}...`);
    
    // Fetch NHL events for today
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events?regions=us&dateFormat=iso&apiKey=${ODDS_API_KEY}`;
    const eventsResponse = await fetch(eventsUrl);
    
    if (!eventsResponse.ok) {
      throw new Error(`Events API returned ${eventsResponse.status}`);
    }
    
    const events = await eventsResponse.json();
    const todayEvents = events.filter(event => event.commence_time?.startsWith(dateStr));
    
    if (todayEvents.length === 0) {
      console.log(`📅 No NHL events today`);
      return new Map();
    }
    
    console.log(`📊 Found ${todayEvents.length} NHL events`);
    
    // Fetch player props for each event
    const closingOddsMap = new Map();
    
    for (const event of todayEvents) {
      try {
        const propsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events/${event.id}/odds?regions=us&markets=player_shots_on_goal&oddsFormat=american&dateFormat=iso&apiKey=${ODDS_API_KEY}`;
        
        const propsResponse = await fetch(propsUrl);
        if (!propsResponse.ok) {
          console.warn(`Failed to fetch props for ${event.away_team} @ ${event.home_team}`);
          continue;
        }
        
        const propsData = await propsResponse.json();
        
        // Extract closing odds for each player
        if (propsData.bookmakers) {
          for (const bookmaker of propsData.bookmakers) {
            if (!bookmaker.markets) continue;
            
            for (const market of bookmaker.markets) {
              if (market.key !== 'player_shots_on_goal') continue;
              
              for (const outcome of market.outcomes || []) {
                const playerName = outcome.description;
                const line = outcome.point;
                const direction = outcome.name; // 'Over' or 'Under'
                const odds = outcome.price;
                
                const key = `${playerName}_${line}_${direction}`;
                
                // Use DraftKings/FanDuel/BetMGM as priority (most liquid)
                if (['DraftKings', 'FanDuel', 'BetMGM'].includes(bookmaker.key) || !closingOddsMap.has(key)) {
                  closingOddsMap.set(key, {
                    playerName,
                    line,
                    direction: direction.toUpperCase(),
                    closingOdds: odds,
                    book: bookmaker.title,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }
          }
        }
        
        // Rate limit - 10 requests/sec max
        await new Promise(resolve => setTimeout(resolve, 150));
        
      } catch (error) {
        console.warn(`Error fetching props for event ${event.id}:`, error.message);
      }
    }
    
    console.log(`✅ Fetched closing odds for ${closingOddsMap.size} player/line combinations`);
    return closingOddsMap;
    
  } catch (error) {
    console.error('❌ Failed to fetch closing odds:', error.message);
    return new Map();
  }
}

/**
 * Update predictions CSV with closing odds
 */
async function updatePredictionsWithClosingOdds(date) {
  const dateStr = date || new Date().toISOString().split('T')[0];
  
  console.log('🏒 NHL Closing Odds Updater');
  console.log('='.repeat(50));
  
  // Read predictions CSV
  const csvPath = path.join(__dirname, '../../data/nhl/logs/predictions_2024-25.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.log('❌ No predictions file found');
    return;
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');
  
  // Add closing_odds and clv columns if not present
  let closingOddsIdx = headers.indexOf('closing_odds');
  let clvIdx = headers.indexOf('clv');
  
  if (closingOddsIdx === -1) {
    headers.push('closing_odds');
    closingOddsIdx = headers.length - 1;
  }
  
  if (clvIdx === -1) {
    headers.push('clv');
    clvIdx = headers.length - 1;
  }
  
  // Fetch closing odds
  const closingOddsMap = await fetchClosingOdds(dateStr);
  
  if (closingOddsMap.size === 0) {
    console.log('⚠️ No closing odds available');
    return;
  }
  
  // Update predictions
  let updatedCount = 0;
  const updatedLines = [headers.join(',')];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',');
    
    // Ensure values array matches headers length
    while (values.length < headers.length) {
      values.push('');
    }
    
    const predDate = values[headers.indexOf('date')];
    const player = values[headers.indexOf('player')];
    const line = values[headers.indexOf('line')];
    const direction = values[headers.indexOf('direction')];
    const openingOdds = parseFloat(values[headers.indexOf('odds')]);
    
    // Only update today's predictions
    if (predDate !== dateStr) {
      updatedLines.push(values.join(','));
      continue;
    }
    
    // Find matching closing odds
    const key = `${player}_${line}_${direction}`;
    const closingData = closingOddsMap.get(key);
    
    if (closingData) {
      values[closingOddsIdx] = closingData.closingOdds.toString();
      
      // Calculate CLV (Closing Line Value)
      // Positive CLV = we got better odds than closing (good!)
      // Negative CLV = closing odds were better (bad timing)
      const clv = openingOdds - closingData.closingOdds;
      values[clvIdx] = clv.toFixed(0);
      
      updatedCount++;
      console.log(`✅ Updated ${player} ${direction} ${line}: Opening ${openingOdds} → Closing ${closingData.closingOdds} (CLV: ${clv > 0 ? '+' : ''}${clv.toFixed(0)})`);
    }
    
    updatedLines.push(values.join(','));
  }
  
  // Write updated CSV
  fs.writeFileSync(csvPath, updatedLines.join('\n') + '\n');
  
  console.log(`\n✅ Updated ${updatedCount} predictions with closing odds`);
  
  if (updatedCount > 0) {
    // Calculate avg CLV
    const clvValues = updatedLines.slice(1)
      .map(line => {
        const vals = line.split(',');
        return parseFloat(vals[clvIdx]);
      })
      .filter(v => !isNaN(v));
    
    if (clvValues.length > 0) {
      const avgCLV = clvValues.reduce((a, b) => a + b, 0) / clvValues.length;
      console.log(`📊 Average CLV: ${avgCLV > 0 ? '+' : ''}${avgCLV.toFixed(1)}`);
      
      if (avgCLV > 0) {
        console.log('   ✅ Positive CLV = Good bet timing!');
      } else {
        console.log('   ⚠️ Negative CLV = Consider betting closer to game time');
      }
    }
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const date = process.argv[2]; // Optional: YYYY-MM-DD
  updatePredictionsWithClosingOdds(date).catch(console.error);
}

export { fetchClosingOdds, updatePredictionsWithClosingOdds };
