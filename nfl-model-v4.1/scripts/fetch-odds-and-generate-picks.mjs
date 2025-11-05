#!/usr/bin/env node
/**
 * FETCH ODDS & GENERATE ACTIONABLE PICKS
 * 
 * 1. Fetch DraftKings/FanDuel lines from The Odds API
 * 2. Match market lines to our Week 10 predictions
 * 3. Calculate edges (Model - Market)
 * 4. Determine Over/Under side
 * 5. Apply Kelly criterion + caps (5U single, 12.5U per-game)
 * 6. Export actionable CSV
 */

import fs from 'fs'
import path from 'path'
import https from 'https'

// API key from environment variable (set in Netlify or locally)
const API_KEY = process.env.ODDS_API_KEY || ''

if (!API_KEY) {
  console.error('❌ Error: ODDS_API_KEY environment variable not set')
  console.error('   Set it with: export ODDS_API_KEY=your_key_here')
  process.exit(1)
}

// Load our model predictions
const bundlePath = path.join(process.env.HOME, 'Desktop', 'REPO33', 'RRMODEL', 'nfl-model-v4.1', 'output', 'bundle_v5_week10_real.json')
const modelData = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'))

console.log('🎯 Fetching NFL Week 10 Odds from The Odds API...\n')

// Fetch odds from The Odds API
const fetchOdds = () => {
  return new Promise((resolve, reject) => {
    const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${API_KEY}&regions=us&markets=spreads,totals&oddsFormat=american&bookmakers=draftkings,fanduel`
    
    https.get(url, (res) => {
      let data = ''
      
      res.on('data', (chunk) => {
        data += chunk
      })
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data))
        } else {
          reject(new Error(`API returned status ${res.statusCode}: ${data}`))
        }
      })
    }).on('error', (err) => {
      reject(err)
    })
  })
}

// Team name mapping (API full names → model abbreviations)
const TEAM_MAPPING = {
  'Las Vegas Raiders': 'LV',
  'Denver Broncos': 'DEN',
  'Atlanta Falcons': 'ATL',
  'Indianapolis Colts': 'IND',
  'Baltimore Ravens': 'BAL',
  'Minnesota Vikings': 'MIN',
  'Buffalo Bills': 'BUF',
  'Miami Dolphins': 'MIA',
  'New Orleans Saints': 'NO',
  'Carolina Panthers': 'CAR',
  'New York Giants': 'NYG',
  'Chicago Bears': 'CHI',
  'Cleveland Browns': 'CLE',
  'New York Jets': 'NYJ',
  'Jacksonville Jaguars': 'JAX',
  'Houston Texans': 'HOU',
  'New England Patriots': 'NE',
  'Tampa Bay Buccaneers': 'TB',
  'Arizona Cardinals': 'ARI',
  'Seattle Seahawks': 'SEA',
  'Detroit Lions': 'DET',
  'Washington Commanders': 'WAS',
  'Los Angeles Rams': 'LA',
  'San Francisco 49ers': 'SF',
  'Pittsburgh Steelers': 'PIT',
  'Los Angeles Chargers': 'LAC',
  'Philadelphia Eagles': 'PHI',
  'Green Bay Packers': 'GB',
  'Tennessee Titans': 'TEN',
  'Cincinnati Bengals': 'CIN',
  'Kansas City Chiefs': 'KC',
  'Dallas Cowboys': 'DAL'
}

const normalizeTeam = (team) => {
  return TEAM_MAPPING[team] || team
}

// Match API game to our model game
const findModelGame = (apiGame, modelGames) => {
  const apiHomeTeam = normalizeTeam(apiGame.home_team)
  const apiAwayTeam = normalizeTeam(apiGame.away_team)
  
  // Try to match by normalized team abbrevs
  for (const modelGame of modelGames) {
    const modelHome = modelGame.homeTeam
    const modelAway = modelGame.awayTeam
    
    // Direct match
    if (apiHomeTeam === modelHome && apiAwayTeam === modelAway) {
      return modelGame
    }
  }
  
  return null
}

// Parse spread from bookmaker markets (returns in Vegas convention: favorite with negative line)
const parseSpread = (bookmaker, homeTeamFullName, awayTeamFullName) => {
  const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads')
  if (!spreadsMarket) return null
  
  const homeOutcome = spreadsMarket.outcomes.find(o => o.name === homeTeamFullName)
  const awayOutcome = spreadsMarket.outcomes.find(o => o.name === awayTeamFullName)
  
  if (!homeOutcome || !awayOutcome) return null
  
  // Return the line for the FAVORITE (negative line)
  // If away team has negative line, they're the favorite
  // If home team has negative line, they're the favorite
  return {
    line: homeOutcome.point,  // Home team's perspective: negative = home favored, positive = home underdog
    homeLine: homeOutcome.point,
    awayLine: awayOutcome.point,
    homePrice: homeOutcome.price,
    awayPrice: awayOutcome.price
  }
}

// Parse total from bookmaker markets
const parseTotal = (bookmaker) => {
  const totalsMarket = bookmaker.markets.find(m => m.key === 'totals')
  if (!totalsMarket) return null
  
  const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over')
  if (!overOutcome) return null
  
  return {
    line: overOutcome.point,
    over_price: overOutcome.price,
    under_price: totalsMarket.outcomes.find(o => o.name === 'Under')?.price || -110
  }
}

// American odds to implied probability
const americanToProb = (americanOdds) => {
  if (americanOdds < 0) {
    return (-americanOdds) / ((-americanOdds) + 100)
  } else {
    return 100 / (americanOdds + 100)
  }
}

// Kelly criterion with caps
const calculateUnits = (modelProb, marketProb, maxUnits = 5.0) => {
  const edge = modelProb - marketProb
  if (edge <= 0) return 0
  
  // Quarter-Kelly (conservative)
  const kelly = (edge / (1 - marketProb)) * 0.25
  
  // Cap at maxUnits
  const units = Math.min(kelly * 100, maxUnits)
  
  // Round to 0.1U
  return Math.round(units * 10) / 10
}

// Main execution
(async () => {
  try {
    const oddsData = await fetchOdds()
    
    console.log(`✅ Fetched odds for ${oddsData.length} games`)
    console.log(`📊 Matching to ${modelData.rows.length} model predictions\n`)
    
    const actionablePicks = []
    let matchedGames = 0
    
    for (const apiGame of oddsData) {
      const modelGame = findModelGame(apiGame, modelData.rows)
      
      if (!modelGame) {
        console.log(`⚠️  No model match for: ${apiGame.away_team} @ ${apiGame.home_team}`)
        continue
      }
      
      matchedGames++
      
      // Get DraftKings and FanDuel lines (prefer DraftKings)
      const dkBookmaker = apiGame.bookmakers.find(b => b.key === 'draftkings')
      const fdBookmaker = apiGame.bookmakers.find(b => b.key === 'fanduel')
      const bookmaker = dkBookmaker || fdBookmaker
      
      if (!bookmaker) {
        console.log(`⚠️  No DK/FD lines for: ${modelGame.matchup}`)
        continue
      }
      
      const marketSpread = parseSpread(bookmaker, apiGame.home_team, apiGame.away_team)
      const marketTotal = parseTotal(bookmaker)
      
      // Model values (convert to VEGAS convention for both teams)
      // Model gives us who's favored and by how much
      // Convert to: negative = favorite, positive = underdog
      
      const modelSpreadLine = modelGame.spread.side === 'home' 
        ? -modelGame.spread.line  // Home favored: MIN -3.4
        : modelGame.spread.line   // Away favored: BUF +7.5
      
      const modelTotal = modelGame.total.total
      const modelSpreadProb = modelGame.spread.confidence
      const modelTotalProb = modelGame.total.confidence
      
      // Calculate edges (model vs market, both in same frame)
      const spreadEdge = marketSpread ? (modelSpreadLine - marketSpread.line) : null
      const totalEdge = marketTotal ? (modelTotal - marketTotal.line) : null
      
      // Determine Spread side (which team to bet)
      // VEGAS CONVENTION: Negative = favorite, Positive = underdog
      //
      // Example: BAL @ MIN
      //   Model: MIN -3.4 (model thinks MIN is favorite by 3.4)
      //   Market: BAL -3.5 (market thinks BAL is favorite by 3.5) 
      //   From HOME perspective: Model -3.4, Market +3.5 (MIN getting points)
      //   Edge = -3.4 - (+3.5) = -6.9
      //
      // BUT we need to think in terms of WHO is favored:
      //   Model favors: MIN by 3.4
      //   Market favors: BAL by 3.5
      //   These are OPPOSITE sides! Model and market disagree on winner.
      //   Bet: Take MIN at the market line (MIN +3.5)
      
      let spreadSide = null
      let spreadBetLine = null
      
      if (marketSpread && Math.abs(spreadEdge) > 0.5) {
        // Determine who the market favorite is
        const marketFavorite = marketSpread.homeLine < 0 ? modelGame.homeTeam : modelGame.awayTeam
        const marketUnderdog = marketSpread.homeLine < 0 ? modelGame.awayTeam : modelGame.homeTeam
        
        // Determine who the model favorite is  
        const modelFavorite = modelSpreadLine < 0 ? modelGame.homeTeam : modelGame.awayTeam
        
        // Edge from HOME team perspective
        // Negative edge = model more bullish on home than market
        // Positive edge = model more bullish on away than market
        
        if (spreadEdge < 0) {
          // Model line is MORE NEGATIVE than market
          // Model favors HOME more than market does
          // Bet the HOME team at market line
          spreadSide = modelGame.homeTeam
          spreadBetLine = marketSpread.homeLine
        } else {
          // Model line is MORE POSITIVE than market  
          // Model favors AWAY more than market does
          // Bet the AWAY team at market line
          spreadSide = modelGame.awayTeam
          spreadBetLine = marketSpread.awayLine
        }
      }
      
      // Determine Over/Under side
      let ouSide = null
      let ouEdge = null
      if (marketTotal) {
        if (modelTotal > marketTotal.line) {
          ouSide = 'OVER'
          ouEdge = totalEdge
        } else {
          ouSide = 'UNDER'
          ouEdge = -totalEdge
        }
      }
      
      // Calculate units
      let spreadUnits = 0
      let totalUnits = 0
      
      if (marketSpread && Math.abs(spreadEdge) > 0.5) {  // Only bet if edge > 0.5 points
        // Use the price for the side we're actually betting
        const marketPrice = spreadSide === modelGame.homeTeam 
          ? marketSpread.homePrice 
          : marketSpread.awayPrice
        const marketSpreadProb = americanToProb(marketPrice)
        spreadUnits = calculateUnits(modelSpreadProb, marketSpreadProb, 5.0)
      }
      
      if (marketTotal && Math.abs(totalEdge) > 1.0) {  // Only bet if edge > 1 point
        const marketTotalProb = ouSide === 'OVER' 
          ? americanToProb(marketTotal.over_price)
          : americanToProb(marketTotal.under_price)
        totalUnits = calculateUnits(modelTotalProb, marketTotalProb, 5.0)
      }
      
      // Apply per-game cap (12.5U)
      const gameUnitsTotal = spreadUnits + totalUnits
      if (gameUnitsTotal > 12.5) {
        const scaleFactor = 12.5 / gameUnitsTotal
        spreadUnits = Math.round(spreadUnits * scaleFactor * 10) / 10
        totalUnits = Math.round(totalUnits * scaleFactor * 10) / 10
      }
      
      actionablePicks.push({
        week: modelGame.week,
        matchup: modelGame.matchup,
        awayTeam: modelGame.awayTeam,
        homeTeam: modelGame.homeTeam,
        kickoff: modelGame.kickoff,
        
        // Spread
        modelFavored: modelGame.spread.team,
        modelFavBy: modelGame.spread.line,
        modelSpread: modelSpreadLine,
        marketSpread: marketSpread?.line || null,
        spreadEdge: spreadEdge,
        spreadSide: spreadSide,
        spreadBetLine: spreadBetLine,
        spreadConf: modelSpreadProb,
        spreadUnits: spreadUnits,
        
        // Total
        modelTotal: modelTotal,
        marketTotal: marketTotal?.line || null,
        totalEdge: totalEdge,
        ouSide: ouSide,
        totalConf: modelTotalProb,
        totalUnits: totalUnits,
        
        // Totals
        gameUnitsTotal: Math.round((spreadUnits + totalUnits) * 10) / 10,
        
        // Components
        epaDiff: modelGame.spread.components.epa_diff,
        successDiff: modelGame.spread.components.success_diff,
        explosiveDiff: modelGame.spread.components.explosive_diff,
        hfaApplied: modelGame.spread.components.hfa,
        
        // Distribution
        totalP25: modelGame.total.p25,
        totalP50: modelGame.total.p50,
        totalP75: modelGame.total.p75,
        
        // Source
        bookmaker: bookmaker.key,
        note: (spreadUnits > 0 || totalUnits > 0) ? 'Actionable' : 'Track only'
      })
      
      console.log(`✅ ${modelGame.matchup}:`)
      if (spreadSide && spreadBetLine !== null) {
        console.log(`   Spread: ${spreadSide} ${spreadBetLine > 0 ? '+' : ''}${spreadBetLine.toFixed(1)} (${spreadUnits.toFixed(1)}U) - Edge: ${spreadEdge.toFixed(1)}`)
      } else {
        console.log(`   Spread: No bet (edge ${spreadEdge?.toFixed(1) || 'N/A'})`)
      }
      console.log(`   Total: Model ${modelTotal.toFixed(1)} vs Market ${marketTotal?.line.toFixed(1) || 'N/A'} → ${ouSide || 'N/A'} (${totalUnits.toFixed(1)}U)`)
    }
    
    console.log(`\n📊 Matched ${matchedGames} of ${modelData.rows.length} games`)
    console.log(`🎯 Generated ${actionablePicks.filter(p => p.note === 'Actionable').length} actionable picks\n`)
    
    // Sort by total units (highest first)
    actionablePicks.sort((a, b) => b.gameUnitsTotal - a.gameUnitsTotal)
    
    // Export to CSV
    const csvHeader = [
      'Rank',
      'Week',
      'Kickoff_ET',
      'Matchup',
      'Away',
      'Home',
      'Model_Favored',
      'Model_FavBy',
      'Model_Spread',
      'Market_Spread',
      'Spread_Edge',
      'Spread_Side',
      'Spread_Bet_Line',
      'Spread_Conf%',
      'Spread_Units',
      'Model_Total',
      'Market_Total',
      'Total_Edge',
      'OU_Side',
      'Total_Conf%',
      'Total_Units',
      'Game_Units_Total',
      'Total_P25',
      'Total_P50',
      'Total_P75',
      'EPA_Diff',
      'Success_Diff',
      'Explosive_Diff',
      'HFA_Applied',
      'Bookmaker',
      'Note'
    ].join(',')
    
    const csvRows = [csvHeader]
    
    actionablePicks.forEach((pick, idx) => {
      const kickoffET = new Date(pick.kickoff).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      
      csvRows.push([
        idx + 1,
        pick.week,
        `"${kickoffET}"`,
        `"${pick.matchup}"`,
        pick.awayTeam,
        pick.homeTeam,
        pick.modelFavored,
        pick.modelFavBy.toFixed(1),
        pick.modelSpread.toFixed(1),
        pick.marketSpread !== null ? pick.marketSpread.toFixed(1) : '',
        pick.spreadEdge !== null ? pick.spreadEdge.toFixed(1) : '',
        pick.spreadSide || '',
        pick.spreadBetLine !== null ? (pick.spreadBetLine > 0 ? '+' : '') + pick.spreadBetLine.toFixed(1) : '',
        (pick.spreadConf * 100).toFixed(1),
        pick.spreadUnits.toFixed(1),
        pick.modelTotal.toFixed(1),
        pick.marketTotal !== null ? pick.marketTotal.toFixed(1) : '',
        pick.totalEdge !== null ? pick.totalEdge.toFixed(1) : '',
        pick.ouSide || '',
        (pick.totalConf * 100).toFixed(1),
        pick.totalUnits.toFixed(1),
        pick.gameUnitsTotal.toFixed(1),
        pick.totalP25.toFixed(1),
        pick.totalP50.toFixed(1),
        pick.totalP75.toFixed(1),
        pick.epaDiff,
        pick.successDiff,
        pick.explosiveDiff,
        pick.hfaApplied,
        pick.bookmaker.toUpperCase(),
        `"${pick.note}"`
      ].join(','))
    })
    
    const csvPath = path.join(process.env.HOME, 'Desktop', 'NFL_V5_WEEK10_ACTIONABLE.csv')
    fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf-8')
    
    console.log(`✅ Actionable picks exported: ${csvPath}`)
    console.log(`\n📋 Summary:`)
    console.log(`   Total games: ${actionablePicks.length}`)
    console.log(`   Actionable picks: ${actionablePicks.filter(p => p.note === 'Actionable').length}`)
    console.log(`   Track only: ${actionablePicks.filter(p => p.note === 'Track only').length}`)
    
    const totalSpreadUnits = actionablePicks.reduce((sum, p) => sum + p.spreadUnits, 0)
    const totalTotalUnits = actionablePicks.reduce((sum, p) => sum + p.totalUnits, 0)
    const totalUnits = actionablePicks.reduce((sum, p) => sum + p.gameUnitsTotal, 0)
    
    console.log(`\n💰 Total Units:`)
    console.log(`   Spread bets: ${totalSpreadUnits.toFixed(1)}U`)
    console.log(`   Total bets: ${totalTotalUnits.toFixed(1)}U`)
    console.log(`   Combined: ${totalUnits.toFixed(1)}U`)
    
    console.log(`\n🎯 Top 5 Actionable Picks:`)
    actionablePicks.filter(p => p.note === 'Actionable').slice(0, 5).forEach((pick, idx) => {
      console.log(`${idx + 1}. ${pick.matchup} (${pick.gameUnitsTotal}U):`)
      if (pick.spreadUnits > 0) {
        console.log(`   → ${pick.modelFavored} ${pick.modelFavBy.toFixed(1)} (Edge: ${pick.spreadEdge.toFixed(1)}) - ${pick.spreadUnits}U`)
      }
      if (pick.totalUnits > 0) {
        console.log(`   → ${pick.ouSide} ${pick.marketTotal.toFixed(1)} (Edge: ${Math.abs(pick.totalEdge).toFixed(1)}) - ${pick.totalUnits}U`)
      }
    })
    
    console.log(`\n✅ Done! Check ${csvPath} for full details`)
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`)
    process.exit(1)
  }
})()
