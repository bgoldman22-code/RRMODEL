/**
 * NBA Elite V2 - Hedge & Double Down Backtest System
 * 
 * Historical analysis comparing performance of:
 * 1. Baseline: Primary bets only
 * 2. Primary + Hedge
 * 3. Primary + Double Down
 * 4. Full system: Primary + Hedge + Double Down
 * 
 * Usage: node scripts/nba/backtest-hedge-doubledown.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data/nba');
const OUTPUT_DIR = path.join(__dirname, '../../data/nba/backtests');

// Import the hedge/doubledown logic
import {
  generateHedgeAndDoubleDown,
  calculateEV,
  oddsToProb,
  isFavorite,
  HEDGE_GATES,
  DOUBLEDOWN_GATES
} from '../../netlify/functions/_lib/nba/hedge-doubledown-v2.mjs';

// =============================================================================
// DATA LOADING
// =============================================================================

/**
 * Load historical games with results
 */
function loadHistoricalGames() {
  const gamesPath = path.join(DATA_DIR, 'games/games_2025_26_complete.json');
  if (!fs.existsSync(gamesPath)) {
    console.error('Games file not found:', gamesPath);
    return [];
  }
  
  const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
  return games.filter(g => g.status === 'STATUS_FINAL');
}

/**
 * Load historical odds data
 */
function loadHistoricalOdds() {
  const oddsPath = path.join(DATA_DIR, 'historical-odds-2025-26-backtest.json');
  if (!fs.existsSync(oddsPath)) {
    console.error('Historical odds file not found:', oddsPath);
    return [];
  }
  
  return JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
}

/**
 * Match odds to game
 */
function matchOddsToGame(game, allOdds) {
  const gameDate = game.date.split('T')[0];
  const homeTeam = game.homeTeam?.name || game.homeTeam;
  const awayTeam = game.awayTeam?.name || game.awayTeam;
  
  return allOdds.find(o => {
    const oddsDate = o.date;
    const oddsHome = o.homeTeam;
    const oddsAway = o.awayTeam;
    
    return oddsDate === gameDate && 
      (oddsHome?.includes(homeTeam) || homeTeam?.includes(oddsHome) ||
       homeTeam === oddsHome) &&
      (oddsAway?.includes(awayTeam) || awayTeam?.includes(oddsAway) ||
       awayAway === oddsAway);
  });
}

// =============================================================================
// BET SIMULATION
// =============================================================================

/**
 * Simulate a bet result
 * @returns {Object} { won: boolean, pnl: number }
 */
function simulateBet(bet, actualResult) {
  const { odds, units, market, pick } = bet;
  
  if (!odds || !units || units === 0) {
    return { won: null, pnl: 0, skipped: true };
  }
  
  // Determine if bet won based on market type and actual result
  let won = false;
  
  if (market?.toLowerCase() === 'spread') {
    // Parse spread from pick (e.g., "LAL -5.5" → -5.5)
    const spreadMatch = pick?.match(/([-+]?\d+\.?\d*)\s*$/);
    const spreadLine = spreadMatch ? parseFloat(spreadMatch[1]) : 0;
    const team = pick?.split(' ')[0];
    
    // Calculate actual margin from perspective of bet team
    const isHome = actualResult.homeTeam?.abbreviation === team ||
                   actualResult.homeTeam?.name?.includes(team) ||
                   team === actualResult.homeTeam;
    
    const homeScore = parseFloat(actualResult.homeTeam?.score || actualResult.homeScore || 0);
    const awayScore = parseFloat(actualResult.awayTeam?.score || actualResult.awayScore || 0);
    const actualMargin = isHome ? (homeScore - awayScore) : (awayScore - homeScore);
    
    // Bet wins if actual margin + spread > 0
    won = (actualMargin + spreadLine) > 0;
    
  } else if (market?.toLowerCase() === 'moneyline') {
    const team = pick?.split(' ')[0];
    const isHome = actualResult.homeTeam?.abbreviation === team ||
                   actualResult.homeTeam?.name?.includes(team) ||
                   team === actualResult.homeTeam;
    
    const homeScore = parseFloat(actualResult.homeTeam?.score || actualResult.homeScore || 0);
    const awayScore = parseFloat(actualResult.awayTeam?.score || actualResult.awayScore || 0);
    
    // ML wins if team wins outright
    won = isHome ? (homeScore > awayScore) : (awayScore > homeScore);
  }
  
  // Calculate P&L
  let pnl;
  if (won) {
    // Win: profit = stake * (decimal odds - 1)
    const decimal = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
    pnl = units * (decimal - 1);
  } else {
    // Loss: lose stake
    pnl = -units;
  }
  
  return { won, pnl: Math.round(pnl * 100) / 100 };
}

/**
 * Determine bet characteristics for slicing
 */
function getBetCharacteristics(bet) {
  const isFav = isFavorite(bet);
  const market = bet.market?.toLowerCase();
  const winProb = bet.p_model || bet.winProb || oddsToProb(bet.odds);
  const edge = parseFloat(bet.edgePercent) || 0;
  const odds = bet.odds || -110;
  
  // WinProb bucket
  let winProbBucket;
  if (winProb < 0.60) winProbBucket = '<60%';
  else if (winProb < 0.68) winProbBucket = '60-68%';
  else winProbBucket = '≥68%';
  
  // Edge bucket
  let edgeBucket;
  if (edge < 5) edgeBucket = '3-5%';
  else if (edge < 8) edgeBucket = '5-8%';
  else if (edge < 12) edgeBucket = '8-12%';
  else edgeBucket = '12%+';
  
  // ML juice bucket
  let juiceBucket;
  if (odds > 0) juiceBucket = 'plus-money';
  else if (odds >= -180) juiceBucket = '-110 to -180';
  else if (odds >= -240) juiceBucket = '-180 to -240';
  else juiceBucket = 'worse than -240';
  
  return {
    isFavorite: isFav,
    market,
    winProbBucket,
    edgeBucket,
    juiceBucket,
    confidence: bet.confidence?.toUpperCase() || 'MEDIUM'
  };
}

// =============================================================================
// SYNTHETIC BET GENERATION
// =============================================================================

/**
 * Generate synthetic primary bets from historical data
 * Simulates what the model would have recommended
 */
function generateSyntheticBets(game, odds) {
  const bets = [];
  
  // Extract spread and ML odds
  const homeScore = parseFloat(game.homeTeam?.score || 0);
  const awayScore = parseFloat(game.awayTeam?.score || 0);
  const actualMargin = homeScore - awayScore;
  
  // Find spread markets from odds data
  const spreadMarket = odds?.odds?.bookmakers?.[0]?.markets?.find(m => m.key === 'spreads');
  const mlMarket = odds?.odds?.bookmakers?.[0]?.markets?.find(m => m.key === 'h2h');
  
  if (!spreadMarket && !mlMarket) {
    return bets;
  }
  
  const homeAbbr = game.homeTeam?.abbreviation || 'HOME';
  const awayAbbr = game.awayTeam?.abbreviation || 'AWAY';
  
  // Create spread opportunities (simulate model edge)
  if (spreadMarket) {
    const homeSpread = spreadMarket.outcomes?.find(o => o.name === odds.homeTeam);
    const awaySpread = spreadMarket.outcomes?.find(o => o.name === odds.awayTeam);
    
    if (homeSpread) {
      // Simulate model prediction (add some noise to actual result)
      const modelSpread = actualMargin + (Math.random() - 0.5) * 6;
      const vegasSpread = homeSpread.point || 0;
      const edge = Math.abs(modelSpread - (-vegasSpread)); // Vegas shows opposite sign
      const edgePercent = (edge / Math.abs(vegasSpread || 1)) * 100;
      
      // Only create bet if edge meets threshold
      if (edgePercent >= 3) {
        const betOnHome = modelSpread > -vegasSpread;
        const pickTeam = betOnHome ? homeAbbr : awayAbbr;
        const pickSpread = betOnHome ? -vegasSpread : vegasSpread;
        const pickOdds = betOnHome ? (homeSpread.price || -110) : (awaySpread?.price || -110);
        
        // Simulate confidence based on edge
        let confidence;
        if (edgePercent >= 10) confidence = 'HIGH';
        else if (edgePercent >= 6) confidence = 'MEDIUM';
        else confidence = 'LOW';
        
        // Calculate units (simplified Kelly)
        const units = Math.min(Math.max(edgePercent / 3, 0.5), 5);
        
        bets.push({
          market: 'Spread',
          pick: `${pickTeam} ${pickSpread >= 0 ? '+' : ''}${pickSpread}`,
          odds: pickOdds,
          edgePercent,
          units,
          confidence,
          p_model: 0.5 + (edgePercent / 100) // Rough estimate
        });
      }
    }
  }
  
  // Create ML opportunities
  if (mlMarket) {
    const homeML = mlMarket.outcomes?.find(o => o.name === odds.homeTeam);
    const awayML = mlMarket.outcomes?.find(o => o.name === odds.awayTeam);
    
    if (homeML && awayML) {
      // Simulate model win probability
      const homeWon = homeScore > awayScore;
      const marginPct = Math.abs(actualMargin) / ((homeScore + awayScore) || 1);
      const modelWinProb = homeWon ? 0.5 + marginPct * 2 : 0.5 - marginPct * 2;
      const clampedProb = Math.max(0.35, Math.min(0.75, modelWinProb + (Math.random() - 0.5) * 0.15));
      
      // Calculate edge vs implied
      const homeImplied = oddsToProb(homeML.price || -110);
      const homeEdge = clampedProb - homeImplied;
      
      if (Math.abs(homeEdge) >= 0.03) { // 3% edge threshold
        const betOnHome = homeEdge > 0;
        const pickTeam = betOnHome ? homeAbbr : awayAbbr;
        const pickOdds = betOnHome ? (homeML.price || -110) : (awayML.price || 110);
        const pickProb = betOnHome ? clampedProb : (1 - clampedProb);
        const edgePercent = Math.abs(homeEdge) * 100;
        
        // Simulate confidence
        let confidence;
        if (edgePercent >= 10) confidence = 'HIGH';
        else if (edgePercent >= 6) confidence = 'MEDIUM';
        else confidence = 'LOW';
        
        const units = Math.min(Math.max(edgePercent / 3, 0.5), 5);
        
        bets.push({
          market: 'Moneyline',
          pick: `${pickTeam} ML`,
          odds: pickOdds,
          edgePercent,
          units,
          confidence,
          p_model: pickProb,
          winProb: pickProb
        });
      }
    }
  }
  
  return bets;
}

// =============================================================================
// BACKTEST ENGINE
// =============================================================================

/**
 * Run backtest for a strategy
 */
function runBacktest(games, allOdds, strategy) {
  const results = {
    totalBets: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    totalUnits: 0,
    netUnits: 0,
    dailyPnL: {},
    maxDrawdown: 0,
    peakUnits: 0,
    slices: {
      byFavorite: { favorite: { bets: 0, units: 0, pnl: 0 }, underdog: { bets: 0, units: 0, pnl: 0 } },
      byMarket: { spread: { bets: 0, units: 0, pnl: 0 }, moneyline: { bets: 0, units: 0, pnl: 0 } },
      byWinProb: {},
      byEdge: {},
      byJuice: {}
    }
  };
  
  let runningUnits = 0;
  let currentDrawdown = 0;
  
  for (const game of games) {
    const gameOdds = matchOddsToGame(game, allOdds);
    if (!gameOdds) continue;
    
    const gameDate = game.date.split('T')[0];
    if (!results.dailyPnL[gameDate]) {
      results.dailyPnL[gameDate] = 0;
    }
    
    // Generate synthetic bets for this game
    const primaryBets = generateSyntheticBets(game, gameOdds);
    
    for (const primary of primaryBets) {
      // Apply hedge/double-down based on strategy
      const gameContext = {
        home: { abbreviation: game.homeTeam?.abbreviation || 'HOME' },
        away: { abbreviation: game.awayTeam?.abbreviation || 'AWAY' }
      };
      
      const vegasLines = extractVegasLines(gameOdds);
      const hedging = generateHedgeAndDoubleDown(primary, primaryBets, gameContext, vegasLines);
      
      // Determine which bets to place based on strategy
      const betsToPlace = [];
      
      if (strategy === 'baseline' || strategy === 'primary_only') {
        betsToPlace.push(primary);
      } else if (strategy === 'primary_hedge') {
        betsToPlace.push(primary);
        if (hedging.hedge) betsToPlace.push(hedging.hedge);
      } else if (strategy === 'primary_dd') {
        betsToPlace.push(primary);
        if (hedging.doubleDown) betsToPlace.push(hedging.doubleDown);
      } else if (strategy === 'full_system') {
        betsToPlace.push(primary);
        if (hedging.hedge) betsToPlace.push(hedging.hedge);
        if (hedging.doubleDown) betsToPlace.push(hedging.doubleDown);
      }
      
      // Simulate each bet
      for (const bet of betsToPlace) {
        const result = simulateBet(bet, game);
        if (result.skipped) continue;
        
        results.totalBets++;
        results.totalUnits += bet.units;
        results.netUnits += result.pnl;
        runningUnits += result.pnl;
        results.dailyPnL[gameDate] += result.pnl;
        
        if (result.won) {
          results.wins++;
        } else {
          results.losses++;
        }
        
        // Track peak and drawdown
        if (runningUnits > results.peakUnits) {
          results.peakUnits = runningUnits;
          currentDrawdown = 0;
        } else {
          currentDrawdown = results.peakUnits - runningUnits;
          if (currentDrawdown > results.maxDrawdown) {
            results.maxDrawdown = currentDrawdown;
          }
        }
        
        // Update slices
        const chars = getBetCharacteristics(bet);
        
        // By favorite/underdog
        const favKey = chars.isFavorite ? 'favorite' : 'underdog';
        results.slices.byFavorite[favKey].bets++;
        results.slices.byFavorite[favKey].units += bet.units;
        results.slices.byFavorite[favKey].pnl += result.pnl;
        
        // By market
        const mktKey = chars.market || 'other';
        if (!results.slices.byMarket[mktKey]) {
          results.slices.byMarket[mktKey] = { bets: 0, units: 0, pnl: 0 };
        }
        results.slices.byMarket[mktKey].bets++;
        results.slices.byMarket[mktKey].units += bet.units;
        results.slices.byMarket[mktKey].pnl += result.pnl;
        
        // By win prob
        if (!results.slices.byWinProb[chars.winProbBucket]) {
          results.slices.byWinProb[chars.winProbBucket] = { bets: 0, units: 0, pnl: 0 };
        }
        results.slices.byWinProb[chars.winProbBucket].bets++;
        results.slices.byWinProb[chars.winProbBucket].units += bet.units;
        results.slices.byWinProb[chars.winProbBucket].pnl += result.pnl;
        
        // By edge
        if (!results.slices.byEdge[chars.edgeBucket]) {
          results.slices.byEdge[chars.edgeBucket] = { bets: 0, units: 0, pnl: 0 };
        }
        results.slices.byEdge[chars.edgeBucket].bets++;
        results.slices.byEdge[chars.edgeBucket].units += bet.units;
        results.slices.byEdge[chars.edgeBucket].pnl += result.pnl;
        
        // By juice
        if (!results.slices.byJuice[chars.juiceBucket]) {
          results.slices.byJuice[chars.juiceBucket] = { bets: 0, units: 0, pnl: 0 };
        }
        results.slices.byJuice[chars.juiceBucket].bets++;
        results.slices.byJuice[chars.juiceBucket].units += bet.units;
        results.slices.byJuice[chars.juiceBucket].pnl += result.pnl;
      }
    }
  }
  
  // Calculate derived metrics
  results.winRate = results.totalBets > 0 ? (results.wins / results.totalBets * 100) : 0;
  results.roi = results.totalUnits > 0 ? (results.netUnits / results.totalUnits * 100) : 0;
  results.avgStake = results.totalBets > 0 ? (results.totalUnits / results.totalBets) : 0;
  
  // Daily stats
  const dailyReturns = Object.values(results.dailyPnL);
  const meanDaily = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const varianceDaily = dailyReturns.length > 0 
    ? dailyReturns.reduce((sum, x) => sum + Math.pow(x - meanDaily, 2), 0) / dailyReturns.length 
    : 0;
  results.stdDevDaily = Math.sqrt(varianceDaily);
  results.sharpe = results.stdDevDaily > 0 ? (meanDaily / results.stdDevDaily) : 0;
  
  // Tail risk
  const downDays = dailyReturns.filter(r => r < -3).length;
  results.tailRiskPct = dailyReturns.length > 0 ? (downDays / dailyReturns.length * 100) : 0;
  
  return results;
}

/**
 * Extract vegas lines from odds data
 */
function extractVegasLines(gameOdds) {
  if (!gameOdds?.odds?.bookmakers) return {};
  
  const book = gameOdds.odds.bookmakers[0];
  if (!book) return {};
  
  const lines = {};
  
  for (const market of book.markets || []) {
    if (market.key === 'spreads') {
      const home = market.outcomes?.find(o => o.name === gameOdds.homeTeam);
      const away = market.outcomes?.find(o => o.name === gameOdds.awayTeam);
      if (home) {
        lines.spread = {
          home: home.point,
          homeOdds: home.price,
          away: away?.point,
          awayOdds: away?.price,
          book: book.title
        };
      }
    }
    
    if (market.key === 'h2h') {
      const home = market.outcomes?.find(o => o.name === gameOdds.homeTeam);
      const away = market.outcomes?.find(o => o.name === gameOdds.awayTeam);
      if (home) {
        lines.moneyline = {
          home: home.price,
          away: away?.price,
          book: book.title
        };
      }
    }
  }
  
  return lines;
}

// =============================================================================
// REPORTING
// =============================================================================

/**
 * Generate markdown report
 */
function generateReport(strategies, outputPath) {
  const lines = [];
  
  lines.push('# NBA Elite V2 - Hedge & Double Down Backtest Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push('| Strategy | Bets | Win Rate | ROI | Net Units | Max DD | Sharpe |');
  lines.push('|----------|------|----------|-----|-----------|--------|--------|');
  
  for (const [name, results] of Object.entries(strategies)) {
    lines.push(`| ${name} | ${results.totalBets} | ${results.winRate.toFixed(1)}% | ${results.roi.toFixed(2)}% | ${results.netUnits.toFixed(2)}U | ${results.maxDrawdown.toFixed(2)}U | ${results.sharpe.toFixed(3)} |`);
  }
  
  lines.push('');
  lines.push('## Detailed Metrics');
  lines.push('');
  
  for (const [name, results] of Object.entries(strategies)) {
    lines.push(`### ${name}`);
    lines.push('');
    lines.push(`- **Total Bets:** ${results.totalBets}`);
    lines.push(`- **Wins/Losses:** ${results.wins}/${results.losses}`);
    lines.push(`- **Win Rate:** ${results.winRate.toFixed(1)}%`);
    lines.push(`- **Total Units Wagered:** ${results.totalUnits.toFixed(2)}U`);
    lines.push(`- **Net Units:** ${results.netUnits.toFixed(2)}U`);
    lines.push(`- **ROI:** ${results.roi.toFixed(2)}%`);
    lines.push(`- **Average Stake:** ${results.avgStake.toFixed(2)}U`);
    lines.push(`- **Max Drawdown:** ${results.maxDrawdown.toFixed(2)}U`);
    lines.push(`- **Daily Std Dev:** ${results.stdDevDaily.toFixed(2)}U`);
    lines.push(`- **Sharpe Ratio:** ${results.sharpe.toFixed(3)}`);
    lines.push(`- **Tail Risk (days down >3U):** ${results.tailRiskPct.toFixed(1)}%`);
    lines.push('');
  }
  
  lines.push('## Slice Analysis');
  lines.push('');
  
  // By Favorite vs Underdog
  lines.push('### By Favorite/Underdog');
  lines.push('');
  lines.push('| Strategy | Side | Bets | Units | P&L | ROI |');
  lines.push('|----------|------|------|-------|-----|-----|');
  
  for (const [name, results] of Object.entries(strategies)) {
    for (const [side, data] of Object.entries(results.slices.byFavorite)) {
      const roi = data.units > 0 ? (data.pnl / data.units * 100) : 0;
      lines.push(`| ${name} | ${side} | ${data.bets} | ${data.units.toFixed(1)}U | ${data.pnl.toFixed(2)}U | ${roi.toFixed(1)}% |`);
    }
  }
  
  lines.push('');
  
  // By Market
  lines.push('### By Market');
  lines.push('');
  lines.push('| Strategy | Market | Bets | Units | P&L | ROI |');
  lines.push('|----------|--------|------|-------|-----|-----|');
  
  for (const [name, results] of Object.entries(strategies)) {
    for (const [market, data] of Object.entries(results.slices.byMarket)) {
      const roi = data.units > 0 ? (data.pnl / data.units * 100) : 0;
      lines.push(`| ${name} | ${market} | ${data.bets} | ${data.units.toFixed(1)}U | ${data.pnl.toFixed(2)}U | ${roi.toFixed(1)}% |`);
    }
  }
  
  lines.push('');
  
  // By Edge
  lines.push('### By Edge Bucket');
  lines.push('');
  lines.push('| Strategy | Edge | Bets | Units | P&L | ROI |');
  lines.push('|----------|------|------|-------|-----|-----|');
  
  for (const [name, results] of Object.entries(strategies)) {
    for (const [bucket, data] of Object.entries(results.slices.byEdge)) {
      const roi = data.units > 0 ? (data.pnl / data.units * 100) : 0;
      lines.push(`| ${name} | ${bucket} | ${data.bets} | ${data.units.toFixed(1)}U | ${data.pnl.toFixed(2)}U | ${roi.toFixed(1)}% |`);
    }
  }
  
  lines.push('');
  lines.push('## Conclusions');
  lines.push('');
  
  // Calculate improvements
  const baseline = strategies['Baseline (Primary Only)'];
  const fullSystem = strategies['Full System'];
  
  if (baseline && fullSystem) {
    const roiDiff = fullSystem.roi - baseline.roi;
    const ddDiff = fullSystem.maxDrawdown - baseline.maxDrawdown;
    const sharpeDiff = fullSystem.sharpe - baseline.sharpe;
    
    lines.push('### Key Findings');
    lines.push('');
    lines.push(`1. **ROI Impact:** Full system ${roiDiff >= 0 ? 'improves' : 'reduces'} ROI by ${Math.abs(roiDiff).toFixed(2)}% vs baseline`);
    lines.push(`2. **Drawdown:** Full system ${ddDiff <= 0 ? 'reduces' : 'increases'} max drawdown by ${Math.abs(ddDiff).toFixed(2)}U`);
    lines.push(`3. **Risk-Adjusted:** Sharpe ratio ${sharpeDiff >= 0 ? 'improves' : 'decreases'} by ${Math.abs(sharpeDiff).toFixed(3)}`);
    lines.push('');
    
    // Hedge analysis
    const withHedge = strategies['Primary + Hedge'];
    if (withHedge) {
      const hedgeROIDiff = withHedge.roi - baseline.roi;
      const hedgeDDDiff = withHedge.maxDrawdown - baseline.maxDrawdown;
      lines.push(`4. **Hedge Value:** ${hedgeDDDiff < 0 ? 'Reduces' : 'Does not reduce'} drawdowns by ${Math.abs(hedgeDDDiff).toFixed(2)}U (ROI impact: ${hedgeROIDiff >= 0 ? '+' : ''}${hedgeROIDiff.toFixed(2)}%)`);
    }
    
    // Double down analysis
    const withDD = strategies['Primary + Double Down'];
    if (withDD) {
      const ddROIDiff = withDD.roi - baseline.roi;
      const ddVolDiff = withDD.stdDevDaily - baseline.stdDevDaily;
      lines.push(`5. **Double Down Value:** ${ddROIDiff >= 0 ? 'Improves' : 'Reduces'} ROI by ${Math.abs(ddROIDiff).toFixed(2)}% (volatility ${ddVolDiff >= 0 ? 'increases' : 'decreases'} by ${Math.abs(ddVolDiff).toFixed(2)}U/day)`);
    }
  }
  
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Report generated by NBA Elite V2 Backtest System*');
  
  fs.writeFileSync(outputPath, lines.join('\n'));
  console.log(`Report saved to: ${outputPath}`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('NBA Elite V2 - Hedge & Double Down Backtest');
  console.log('='.repeat(60));
  console.log('');
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Load data
  console.log('Loading historical games...');
  const games = loadHistoricalGames();
  console.log(`  Loaded ${games.length} completed games`);
  
  console.log('Loading historical odds...');
  const allOdds = loadHistoricalOdds();
  console.log(`  Loaded odds for ${allOdds.length} games`);
  
  if (games.length === 0 || allOdds.length === 0) {
    console.error('Insufficient data for backtest');
    return;
  }
  
  // Run backtests
  console.log('');
  console.log('Running backtests...');
  
  const strategies = {};
  
  console.log('  [1/4] Baseline (Primary Only)...');
  strategies['Baseline (Primary Only)'] = runBacktest(games, allOdds, 'baseline');
  
  console.log('  [2/4] Primary + Hedge...');
  strategies['Primary + Hedge'] = runBacktest(games, allOdds, 'primary_hedge');
  
  console.log('  [3/4] Primary + Double Down...');
  strategies['Primary + Double Down'] = runBacktest(games, allOdds, 'primary_dd');
  
  console.log('  [4/4] Full System...');
  strategies['Full System'] = runBacktest(games, allOdds, 'full_system');
  
  // Save results
  console.log('');
  console.log('Saving results...');
  
  const jsonPath = path.join(OUTPUT_DIR, 'hedge-doubledown-backtest-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(strategies, null, 2));
  console.log(`  JSON: ${jsonPath}`);
  
  const mdPath = path.join(OUTPUT_DIR, 'hedge-doubledown-backtest-report.md');
  generateReport(strategies, mdPath);
  console.log(`  Report: ${mdPath}`);
  
  // Print summary
  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('');
  console.log('| Strategy                | Bets | Win Rate | ROI     | Net Units | Max DD  |');
  console.log('|-------------------------|------|----------|---------|-----------|---------|');
  
  for (const [name, results] of Object.entries(strategies)) {
    console.log(`| ${name.padEnd(23)} | ${String(results.totalBets).padStart(4)} | ${results.winRate.toFixed(1).padStart(7)}% | ${results.roi.toFixed(2).padStart(6)}% | ${results.netUnits.toFixed(2).padStart(9)}U | ${results.maxDrawdown.toFixed(2).padStart(7)}U |`);
  }
  
  console.log('');
  console.log('Done!');
}

main().catch(console.error);
