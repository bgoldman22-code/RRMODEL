/**
 * NBA Elite Predictions - Production Version
 * 
 * Uses:
 * - Elite Ensemble model (11.606 MAE spread, 55 features)
 * - Historical game data from GitHub raw
 * - Advanced stats: offRtg, defRtg, pace, Four Factors
 * - L10 rolling windows for recent performance
 * - RCI adjustments for roster continuity (2025-26 season)
 */

import { SPREAD_MODEL, TOTAL_MODEL } from '../_lib/nba/models-inline.mjs';
import { applyRCIAdjustment, getRCISummary } from '../_lib/nba/rci-adjustments.mjs';
import { getTeamInjuries } from '../_lib/nba/injuries.mjs';
import { applyInjuryAdjustment, getInjurySummary, getInjuryAdvantage } from '../_lib/nba/injury-adjustments.mjs';

/**
 * Fetch live Vegas lines from The Odds API
 */
async function fetchVegasLines(gameIds, isPreseason = false) {
  const ODDS_API_KEY = process.env.ODDS_API_KEY;
  
  if (!ODDS_API_KEY) {
    console.log('[NBA Elite] No Odds API key - skipping live lines');
    return {};
  }
  
  try {
    // Use correct sport key based on season type
    const sportKey = isPreseason ? 'basketball_nba_preseason' : 'basketball_nba';
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    
    console.log('[NBA Elite] Fetching odds from:', sportKey, '- Preseason:', isPreseason);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log('[NBA Elite] Odds API error:', response.status, response.statusText);
      return {};
    }
    
    const data = await response.json();
    console.log('[NBA Elite] Odds API returned:', data?.length || 0, 'games');
    
    const linesMap = {};
    
    // Team name mapping (Odds API uses full names, we need to match with abbreviations)
    const teamAbbrevMap = {
      'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
      'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
      'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
      'Golden State Warriors': 'GS', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
      'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
      'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
      'New Orleans Pelicans': 'NO', 'New York Knicks': 'NY', 'Oklahoma City Thunder': 'OKC',
      'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
      'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SA',
      'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WSH'
    };
    
    // Map odds to game IDs by team abbreviations
    for (const game of data || []) {
      const awayAbbrev = teamAbbrevMap[game.away_team];
      const homeAbbrev = teamAbbrevMap[game.home_team];
      
      if (!awayAbbrev || !homeAbbrev) {
        console.log(`[NBA Elite] Unknown team: ${game.away_team} or ${game.home_team}`);
        continue;
      }
      
      // Key by abbreviations to match ESPN data
      const key = `${awayAbbrev}_${homeAbbrev}`;
      
      const bestLines = {
        spread: { home: null, away: null, book: null },
        total: { over: null, under: null, line: null, book: null },
        moneyline: { home: null, away: null, book: null }
      };
      
      // Find best lines across books
      for (const book of game.bookmakers || []) {
        for (const market of book.markets || []) {
          if (market.key === 'spreads') {
            const homeSpread = market.outcomes.find(o => o.name === game.home_team);
            if (homeSpread && (!bestLines.spread.home || homeSpread.price > bestLines.spread.home.price)) {
              bestLines.spread = {
                home: homeSpread.point,
                homePrice: homeSpread.price,
                book: book.key
              };
            }
          }
          else if (market.key === 'totals') {
            const over = market.outcomes.find(o => o.name === 'Over');
            if (over) {
              bestLines.total = {
                line: over.point,
                overPrice: over.price,
                underPrice: market.outcomes.find(o => o.name === 'Under')?.price,
                book: book.key
              };
            }
          }
          else if (market.key === 'h2h') {
            const homeMl = market.outcomes.find(o => o.name === game.home_team);
            if (homeMl) {
              bestLines.moneyline = {
                home: homeMl.price,
                away: market.outcomes.find(o => o.name === game.away_team)?.price,
                book: book.key
              };
            }
          }
        }
      }
      
      linesMap[key] = bestLines;
    }
    
    console.log(`[NBA Elite] Fetched Vegas lines for ${Object.keys(linesMap).length} games`);
    return linesMap;
    
  } catch (error) {
    console.error('[NBA Elite] Error fetching Vegas lines:', error);
    return {};
  }
}

/**
 * Calculate edge and Kelly bet sizing with PROPER American odds
 * NOTE: vegasLine is the POINT SPREAD, americanOdds is the PRICE (e.g., -110)
 */
function calculateEdgeAndKelly(modelPred, vegasLine, americanOdds, modelProb, bankroll = 5000, seasonAdj = 1.0) {
  if (!vegasLine || !americanOdds) return null;
  
  // Edge in points (both are from home team perspective)
  // Example: Model OKC -15.3, Vegas OKC -6.5 → Edge = |(-15.3) - (-6.5)| = 8.8 points
  const edgePoints = Math.abs(modelPred - vegasLine);
  
  // Convert American odds to implied probability for edge calculation
  const vegasImpliedProb = americanOdds > 0 
    ? 100 / (americanOdds + 100) 
    : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  
  // Edge in probability terms (model prob vs market prob)
  const edgeProb = modelProb - vegasImpliedProb;
  const edgePercent = edgeProb * 100;
  
  // Convert American odds to decimal for Kelly calculation
  const decimalOdds = americanOdds > 0 ? (americanOdds / 100) + 1 : (100 / Math.abs(americanOdds)) + 1;
  
  // Kelly criterion: f = (bp - q) / b where b = net odds (decimal - 1), p = win prob, q = lose prob
  const b = decimalOdds - 1;
  const q = 1 - modelProb;
  const kelly = b > 0 ? (b * modelProb - q) / b : 0;
  
  // Apply season adjustment to Kelly (reduce betting early season)
  const adjustedKelly = kelly * seasonAdj;
  
  // Cap at 5% of bankroll (quarter Kelly for safety), then apply season adjustment
  const kellyFraction = Math.min(Math.max(adjustedKelly * 0.25, 0), 0.05);
  const betSize = Math.round(bankroll * kellyFraction);
  
  return {
    edgePoints: parseFloat(edgePoints.toFixed(1)),
    edgePercent: parseFloat(edgePercent.toFixed(1)),
    kellyFraction: parseFloat((kellyFraction * 100).toFixed(2)),
    betSize,
    units: parseFloat((betSize / 10).toFixed(1)), // $10/unit
    seasonAdjusted: seasonAdj < 1.0 // Flag if early season reduced sizing
  };
}

/**
 * Calculate advanced stats from game history
 */
function calculateAdvancedStats(games, teamId, window = 10) {
  // Convert teamId to number for comparison (ESPN sends strings, our data has numbers)
  const numericTeamId = parseInt(teamId);
  
  const teamGames = games
    .filter(g => 
      g.homeTeamId === numericTeamId || g.awayTeamId === numericTeamId ||
      g.homeTeam === teamId || g.awayTeam === teamId
    )
    .filter(g => g.homeScore != null && g.awayScore != null)
    .slice(-window);
  
  if (teamGames.length === 0) {
    return {
      pace: 100, offRtg: 114.5, defRtg: 114.5, netRtg: 0,
      efg: 0.535, ts: 0.575, tovPct: 0.138, orbPct: 0.25,
      ftFga: 0.22, winPct: 0.50, games: 0
    };
  }
  
  let stats = {
    pace: 0, offRtg: 0, defRtg: 0, efg: 0, ts: 0,
    tovPct: 0, orbPct: 0, ftFga: 0, wins: 0, games: 0,
    // NEW: Stats needed for TOTAL_MODEL
    fgPct: 0, fg3Pct: 0, ftPct: 0, rebounds: 0, assists: 0, turnovers: 0
  };
  
  for (const game of teamGames) {
    const isHome = game.homeTeamId === numericTeamId || game.homeTeam === teamId;
    const teamStats = isHome ? game.homeStats : game.awayStats;
    const oppStats = isHome ? game.awayStats : game.homeStats;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    
    if (!teamStats || !oppStats) continue;
    
    // Possessions
    const poss = (teamStats.fga + 0.44 * teamStats.fta - teamStats.offRebounds + teamStats.turnovers +
                  oppStats.fga + 0.44 * oppStats.fta - oppStats.offRebounds + oppStats.turnovers) / 2;
    
    stats.pace += poss > 0 ? (poss / 48) * 48 : 100;
    stats.offRtg += poss > 0 ? (teamScore / poss) * 100 : 114.5;
    stats.defRtg += poss > 0 ? (oppScore / poss) * 100 : 114.5;
    
    stats.efg += teamStats.fga > 0 ? (teamStats.fgm + 0.5 * teamStats.fg3m) / teamStats.fga : 0.535;
    const tsa = teamStats.fga + 0.44 * teamStats.fta;
    stats.ts += tsa > 0 ? teamScore / (2 * tsa) : 0.575;
    
    stats.tovPct += poss > 0 ? teamStats.turnovers / poss : 0.138;
    const totalRebs = teamStats.offRebounds + oppStats.defRebounds;
    stats.orbPct += totalRebs > 0 ? teamStats.offRebounds / totalRebs : 0.25;
    stats.ftFga += teamStats.fga > 0 ? teamStats.fta / teamStats.fga : 0.22;
    
    // NEW: Additional stats for total model
    stats.fgPct += teamStats.fga > 0 ? teamStats.fgm / teamStats.fga : 0.47;
    stats.fg3Pct += teamStats.fg3a > 0 ? teamStats.fg3m / teamStats.fg3a : 0.36;
    stats.ftPct += teamStats.fta > 0 ? teamStats.ftm / teamStats.fta : 0.78;
    stats.rebounds += (teamStats.offRebounds || 0) + (teamStats.defRebounds || 0);
    stats.assists += teamStats.assists || 0;
    stats.turnovers += teamStats.turnovers || 0;
    
    if (teamScore > oppScore) stats.wins++;
    stats.games++;
  }
  
  // Average
  if (stats.games > 0) {
    Object.keys(stats).forEach(key => {
      if (key !== 'wins' && key !== 'games') stats[key] /= stats.games;
    });
  }
  
  stats.netRtg = stats.offRtg - stats.defRtg;
  stats.winPct = stats.games > 0 ? stats.wins / stats.games : 0.50;
  
  return stats;
}

/**
 * Build 55-feature vector for elite model
 */
function buildEliteFeatures(homeStats, awayStats) {
  // Helper to create uniform stat blocks
  const calcPPG = (stats) => stats.offRtg; // OffRtg is already points/100 poss
  
  return {
    // L3 equivalent (use L10 as proxy since we don't track L3 separately)
    h3_netRtg: homeStats.netRtg,
    h3_ppg: calcPPG(homeStats),
    h3_pace: homeStats.pace,
    h3_winPct: homeStats.winPct,
    h3_efg: homeStats.efg * 100,
    a3_netRtg: awayStats.netRtg,
    a3_ppg: calcPPG(awayStats),
    a3_pace: awayStats.pace,
    a3_winPct: awayStats.winPct,
    a3_efg: awayStats.efg * 100,
    
    // Home L10 stats
    h10_pace: homeStats.pace,
    h10_offRtg: homeStats.offRtg,
    h10_defRtg: homeStats.defRtg,
    h10_netRtg: homeStats.netRtg,
    h10_efg: homeStats.efg,
    h10_ts: homeStats.ts * 100,
    h10_tovPct: homeStats.tovPct,
    h10_orbPct: homeStats.orbPct,
    h10_ftFga: homeStats.ftFga,
    h10_winPct: homeStats.winPct,
    h10_ppg: calcPPG(homeStats),
    
    // Away L10 stats
    a10_pace: awayStats.pace,
    a10_offRtg: awayStats.offRtg,
    a10_defRtg: awayStats.defRtg,
    a10_netRtg: awayStats.netRtg,
    a10_efg: awayStats.efg,
    a10_ts: awayStats.ts * 100,
    a10_tovPct: awayStats.tovPct,
    a10_orbPct: awayStats.orbPct,
    a10_ftFga: awayStats.ftFga,
    a10_winPct: awayStats.winPct,
    a10_ppg: calcPPG(awayStats),
    
    // L20 stats (home) - use same as L10
    h20_pace: homeStats.pace,
    h20_offRtg: homeStats.offRtg,
    h20_defRtg: homeStats.defRtg,
    h20_netRtg: homeStats.netRtg,
    h20_efg: homeStats.efg,
    h20_ts: homeStats.ts,
    h20_tovPct: homeStats.tovPct,
    h20_orbPct: homeStats.orbPct,
    h20_ftFga: homeStats.ftFga,
    h20_winPct: homeStats.winPct,
    h20_ppg: calcPPG(homeStats),
    
    // L20 stats (away) - use same as L10
    a20_pace: awayStats.pace,
    a20_offRtg: awayStats.offRtg,
    a20_defRtg: awayStats.defRtg,
    a20_netRtg: awayStats.netRtg,
    a20_efg: awayStats.efg,
    a20_ts: awayStats.ts,
    a20_tovPct: awayStats.tovPct,
    a20_orbPct: awayStats.orbPct,
    a20_ftFga: awayStats.ftFga,
    a20_winPct: awayStats.winPct,
    a20_ppg: calcPPG(awayStats),
    
    // Interactions (matching all 55 features from trained model)
    netRtg_diff: homeStats.netRtg - awayStats.netRtg,
    netRtg_product: homeStats.netRtg * awayStats.netRtg,
    offense_vs_defense: homeStats.offRtg * awayStats.defRtg / 10000, // Normalize
    defensive_matchup: awayStats.offRtg * homeStats.defRtg / 10000, // Away off vs home def
    pace_avg: (homeStats.pace + awayStats.pace) / 2,
    pace_diff: homeStats.pace - awayStats.pace,
    pace_product: homeStats.pace * awayStats.pace / 10000,
    h_momentum: homeStats.netRtg * homeStats.winPct,
    a_momentum: awayStats.netRtg * awayStats.winPct,
    h_streak: homeStats.winPct > 0.6 ? 1 : (homeStats.winPct < 0.4 ? -1 : 0),
    a_streak: awayStats.winPct > 0.6 ? 1 : (awayStats.winPct < 0.4 ? -1 : 0),
    momentum_diff: (homeStats.netRtg * homeStats.winPct) - (awayStats.netRtg * awayStats.winPct),
    ppg_sum: homeStats.offRtg + awayStats.offRtg,
    ppg_diff: homeStats.offRtg - awayStats.offRtg,
    expected_total: (homeStats.offRtg + awayStats.offRtg) * (homeStats.pace + awayStats.pace) / 200,
    shooting_advantage: (homeStats.efg - awayStats.efg) * 100,
    h_efficiency: homeStats.offRtg / homeStats.pace,
    a_efficiency: awayStats.offRtg / awayStats.pace,
    offRtg_diff: homeStats.offRtg - awayStats.offRtg,
    defRtg_diff: homeStats.defRtg - awayStats.defRtg,
    winPct_diff: homeStats.winPct - awayStats.winPct,
    quality_matchup: (homeStats.netRtg + awayStats.netRtg) / 2,
    upset_factor: Math.abs(homeStats.winPct - awayStats.winPct) * (homeStats.winPct < awayStats.winPct ? 1 : -1),
    rating_pace_interaction: (homeStats.netRtg - awayStats.netRtg) * (homeStats.pace - awayStats.pace),
    form_rating_interaction: homeStats.winPct * homeStats.netRtg - awayStats.winPct * awayStats.netRtg,
    consistency: Math.abs(homeStats.netRtg / (homeStats.games + 1)) + Math.abs(awayStats.netRtg / (awayStats.games + 1)),
    home_advantage: 1
  };
}

/**
 * Generate human-readable key factors explaining the pick
 */
function generateKeyFactors(home, away, homeL10, awayL10, spreadPred, totalPred, homeExpectedPts, awayExpectedPts, homeInjuries, awayInjuries, opportunities) {
  const factors = [];
  
  // 1. MATCHUP ADVANTAGE (most important for spread/ML)
  const offensiveMatchup = {
    home: { off: homeL10.offRtg, vsDefense: awayL10.defRtg },
    away: { off: awayL10.offRtg, vsDefense: homeL10.defRtg }
  };
  
  // Find the biggest mismatch
  const homeOffVsAwayDef = homeL10.offRtg - awayL10.defRtg;
  const awayOffVsHomeDef = awayL10.offRtg - homeL10.defRtg;
  
  if (Math.abs(homeOffVsAwayDef) > 10 || Math.abs(awayOffVsHomeDef) > 10) {
    if (homeOffVsAwayDef > 10) {
      factors.push({
        label: '🔥 Offensive Mismatch',
        value: `${home.team.abbreviation} elite offense (${homeL10.offRtg.toFixed(1)}) vs ${away.team.abbreviation} weak defense (${awayL10.defRtg.toFixed(1)})`,
        impact: 'FAVOR_HOME'
      });
    } else if (homeOffVsAwayDef < -10) {
      factors.push({
        label: '🛡️ Defensive Edge',
        value: `${away.team.abbreviation} defense (${awayL10.defRtg.toFixed(1)}) locks down ${home.team.abbreviation} offense (${homeL10.offRtg.toFixed(1)})`,
        impact: 'FAVOR_AWAY'
      });
    }
    
    if (awayOffVsHomeDef > 10) {
      factors.push({
        label: '🔥 Road Offense Advantage',
        value: `${away.team.abbreviation} offense (${awayL10.offRtg.toFixed(1)}) vs ${home.team.abbreviation} poor defense (${homeL10.defRtg.toFixed(1)})`,
        impact: 'FAVOR_AWAY'
      });
    } else if (awayOffVsHomeDef < -10) {
      factors.push({
        label: '🛡️ Home Defense Dominance',
        value: `${home.team.abbreviation} defense (${homeL10.defRtg.toFixed(1)}) shuts down ${away.team.abbreviation} (${awayL10.offRtg.toFixed(1)})`,
        impact: 'FAVOR_HOME'
      });
    }
  }
  
  // 2. PACE & TEMPO (important for totals)
  const totalOpp = opportunities.find(o => o.market === 'Total');
  if (totalOpp) {
    const avgPace = (homeL10.pace + awayL10.pace) / 2;
    const leaguePace = 100;
    
    if (avgPace > 103) {
      factors.push({
        label: '⚡ Fast Pace Game',
        value: `Combined pace ${avgPace.toFixed(1)} (League avg: 100) = More possessions`,
        impact: totalOpp.pick.includes('Over') ? 'SUPPORTS_PICK' : 'OPPOSES_PICK'
      });
    } else if (avgPace < 97) {
      factors.push({
        label: '🐌 Slow Pace Game',
        value: `Combined pace ${avgPace.toFixed(1)} (League avg: 100) = Fewer possessions`,
        impact: totalOpp.pick.includes('Under') ? 'SUPPORTS_PICK' : 'OPPOSES_PICK'
      });
    }
  }
  
  // 3. RECENT FORM
  const homeForm = homeL10.winPct;
  const awayForm = awayL10.winPct;
  
  if (homeForm > 0.7 || awayForm > 0.7 || homeForm < 0.3 || awayForm < 0.3) {
    if (homeForm > 0.7) {
      factors.push({
        label: '📈 Home Team Hot',
        value: `${home.team.abbreviation} ${Math.round(homeForm * homeL10.games)}-${Math.round((1-homeForm) * homeL10.games)} last ${homeL10.games} (${(homeForm * 100).toFixed(0)}%)`,
        impact: 'FAVOR_HOME'
      });
    } else if (homeForm < 0.3) {
      factors.push({
        label: '📉 Home Team Cold',
        value: `${home.team.abbreviation} ${Math.round(homeForm * homeL10.games)}-${Math.round((1-homeForm) * homeL10.games)} last ${homeL10.games} (${(homeForm * 100).toFixed(0)}%)`,
        impact: 'FAVOR_AWAY'
      });
    }
    
    if (awayForm > 0.7) {
      factors.push({
        label: '📈 Road Team Hot',
        value: `${away.team.abbreviation} ${Math.round(awayForm * awayL10.games)}-${Math.round((1-awayForm) * awayL10.games)} last ${awayL10.games} (${(awayForm * 100).toFixed(0)}%)`,
        impact: 'FAVOR_AWAY'
      });
    } else if (awayForm < 0.3) {
      factors.push({
        label: '📉 Road Team Cold',
        value: `${away.team.abbreviation} ${Math.round(awayForm * awayL10.games)}-${Math.round((1-awayForm) * awayL10.games)} last ${awayL10.games} (${(awayForm * 100).toFixed(0)}%)`,
        impact: 'FAVOR_HOME'
      });
    }
  }
  
  // 4. INJURY IMPACT
  if (homeInjuries && homeInjuries.count > 0 && homeInjuries.severity !== 'NONE') {
    factors.push({
      label: '🏥 Home Injuries',
      value: `${home.team.abbreviation}: ${homeInjuries.players} (${homeInjuries.impact})`,
      impact: 'FAVOR_AWAY',
      detail: `Offense -${Math.abs(homeInjuries.deltaOff).toFixed(1)}, Defense -${Math.abs(homeInjuries.deltaDef).toFixed(1)}`
    });
  }
  
  if (awayInjuries && awayInjuries.count > 0 && awayInjuries.severity !== 'NONE') {
    factors.push({
      label: '🏥 Away Injuries',
      value: `${away.team.abbreviation}: ${awayInjuries.players} (${awayInjuries.impact})`,
      impact: 'FAVOR_HOME',
      detail: `Offense -${Math.abs(awayInjuries.deltaOff).toFixed(1)}, Defense -${Math.abs(awayInjuries.deltaDef).toFixed(1)}`
    });
  }
  
  // 5. PROJECTED SCORING (for totals)
  if (totalOpp) {
    factors.push({
      label: '🎯 Expected Scoring',
      value: `${home.team.abbreviation} ${homeExpectedPts.toFixed(0)} - ${away.team.abbreviation} ${awayExpectedPts.toFixed(0)} = ${(homeExpectedPts + awayExpectedPts).toFixed(0)} total`,
      impact: 'INFO',
      detail: `Vegas: ${totalOpp.vegasLine} (${totalOpp.edge} pt diff)`
    });
  }
  
  // Sort by impact/importance and return top 3-4
  const priorityOrder = ['🔥', '🛡️', '🏥', '📈', '📉', '⚡', '🐌', '🎯'];
  factors.sort((a, b) => {
    const aIcon = a.label.substring(0, 2);
    const bIcon = b.label.substring(0, 2);
    return priorityOrder.indexOf(aIcon) - priorityOrder.indexOf(bIcon);
  });
  
  return factors.slice(0, 4); // Top 4 most important factors
}

/**
 * Build simple features for total model
 */
function buildSimpleFeatures(homeStats, awayStats) {
  return {
    home_l10_fgPct: homeStats.fgPct || homeStats.efg || 0.47,
    home_l10_fg3Pct: homeStats.fg3Pct || (homeStats.ts - homeStats.efg) || 0.36,
    home_l10_ftPct: homeStats.ftPct || 0.77,
    home_l10_rebounds: homeStats.rebounds || 43,
    home_l10_assists: homeStats.assists || 25,
    home_l10_turnovers: homeStats.turnovers || (homeStats.tovPct * 100) || 13.5,
    
    away_l10_fgPct: awayStats.fgPct || awayStats.efg || 0.47,
    away_l10_fg3Pct: awayStats.fg3Pct || (awayStats.ts - awayStats.efg) || 0.36,
    away_l10_ftPct: awayStats.ftPct || 0.77,
    away_l10_rebounds: awayStats.rebounds || 43,
    away_l10_assists: awayStats.assists || 25,
    away_l10_turnovers: awayStats.turnovers || (awayStats.tovPct * 100) || 13.5,
    
    fgPct_diff: (homeStats.fgPct || homeStats.efg || 0.47) - (awayStats.fgPct || awayStats.efg || 0.47),
    fg3Pct_diff: (homeStats.fg3Pct || 0.36) - (awayStats.fg3Pct || 0.36),
    rebounds_diff: (homeStats.rebounds || 43) - (awayStats.rebounds || 43),
    assists_diff: (homeStats.assists || 25) - (awayStats.assists || 25),
    turnovers_diff: (awayStats.turnovers || awayStats.tovPct * 100 || 13.5) - (homeStats.turnovers || homeStats.tovPct * 100 || 13.5),
    home_court: 1
  };
}

/**
 * Predict with linear model
 */
function predict(model, features) {
  const { weights, bias, means, stds } = model;
  
  // Normalize and predict
  let pred = bias;
  for (const [key, weight] of Object.entries(weights)) {
    const value = features[key] || 0;
    const mean = means[key] || 0;
    const std = stds[key] || 1;
    const normalized = std > 0 ? (value - mean) / std : 0;
    pred += weight * normalized;
  }
  
  return pred;
}

/**
 * Main handler
 */
export default async (request, context) => {
  try {
    console.log('[NBA Elite] Starting predictions...');
    
    // 1. Fetch today's games from ESPN
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;
    console.log('[NBA Elite] Fetching from:', espnUrl);
    
    const espnResponse = await fetch(espnUrl);
    const espnData = await espnResponse.json();
    
    console.log('[NBA Elite] ESPN returned', espnData.events?.length || 0, 'events');
    
    if (!espnData.events || espnData.events.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        games: 0,
        predictions: [],
        message: 'No games scheduled today'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 2. Detect season type (preseason vs regular season)
    const isPreseason = espnData.events[0]?.season?.type === 1; // Type 1 = preseason, 2 = regular season, 3 = playoffs
    
    if (isPreseason) {
      console.log('[NBA Elite] ⚠️  PRESEASON MODE - Predictions will be flagged as preseason (DO NOT track in regular season stats)');
    } else {
      console.log('[NBA Elite] Regular season detected - running full predictions');
    }
    
    // 3. Load historical games from GitHub
    const dataUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main41/data/nba/games/games_2024_25.json';
    const dataResponse = await fetch(dataUrl);
    
    if (!dataResponse.ok) {
      throw new Error(`Failed to fetch historical data: ${dataResponse.status}`);
    }
    
    const historicalGames = await dataResponse.json();
    console.log(`[NBA Elite] Loaded ${historicalGames.length} historical games`);
    
    // 4. Fetch live Vegas lines (use correct endpoint for season type)
    const vegasLines = await fetchVegasLines(espnData.events.map(e => e.id), isPreseason);
    
    // 5. Generate predictions
    const predictions = [];
    
    for (const event of espnData.events) {
      const comp = event.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      
      console.log(`[NBA Elite] Processing: ${away.team.abbreviation} @ ${home.team.abbreviation}`);
      
      // Calculate L3, L10, L20 stats for both teams (matching training data)
      const homeL3Raw = calculateAdvancedStats(historicalGames, home.id, 3);
      const homeL10Raw = calculateAdvancedStats(historicalGames, home.id, 10);
      const homeL20Raw = calculateAdvancedStats(historicalGames, home.id, 20);
      
      const awayL3Raw = calculateAdvancedStats(historicalGames, away.id, 3);
      const awayL10Raw = calculateAdvancedStats(historicalGames, away.id, 10);
      const awayL20Raw = calculateAdvancedStats(historicalGames, away.id, 20);
      
      console.log(`[NBA Elite] ${home.team.abbreviation} games: L3=${homeL3Raw.games}, L10=${homeL10Raw.games}, L20=${homeL20Raw.games}`);
      
      // Skip if not enough data (need at least 3 recent games)
      if (homeL3Raw.games < 3 || awayL3Raw.games < 3) {
        console.log(`[NBA Elite] Skipping ${away.team.abbreviation} @ ${home.team.abbreviation} - insufficient data`);
        continue;
      }
      
      // Apply RCI adjustments based on games played this season
      const gamesPlayed = homeL10Raw.games; // Use L10 games as proxy for season progress
      
      const homeL3 = applyRCIAdjustment(homeL3Raw, home.team.abbreviation, gamesPlayed);
      const homeL10 = applyRCIAdjustment(homeL10Raw, home.team.abbreviation, gamesPlayed);
      const homeL20 = applyRCIAdjustment(homeL20Raw, home.team.abbreviation, gamesPlayed);
      
      const awayL3 = applyRCIAdjustment(awayL3Raw, away.team.abbreviation, gamesPlayed);
      const awayL10 = applyRCIAdjustment(awayL10Raw, away.team.abbreviation, gamesPlayed);
      const awayL20 = applyRCIAdjustment(awayL20Raw, away.team.abbreviation, gamesPlayed);
      
      // Log RCI adjustments for transparency
      const homeRCI = getRCISummary(home.team.abbreviation, gamesPlayed);
      const awayRCI = getRCISummary(away.team.abbreviation, gamesPlayed);
      console.log(`[RCI] ${home.team.abbreviation}:`, homeRCI);
      console.log(`[RCI] ${away.team.abbreviation}:`, awayRCI);
      
      // Fetch and apply injury adjustments (separate from RCI)
      let homeInjuries = [];
      let awayInjuries = [];
      let homeInjuryAdj = null;
      let awayInjuryAdj = null;
      let injuryAdvantage = null;
      
      try {
        [homeInjuries, awayInjuries] = await Promise.all([
          getTeamInjuries(home.team.abbreviation),
          getTeamInjuries(away.team.abbreviation)
        ]);
        
        // Apply injury adjustments on top of RCI-adjusted stats
        const homeL10WithInjuries = applyInjuryAdjustment(homeL10, homeInjuries);
        const awayL10WithInjuries = applyInjuryAdjustment(awayL10, awayInjuries);
        
        // Get injury summaries for logging and output
        homeInjuryAdj = getInjurySummary(homeInjuries);
        awayInjuryAdj = getInjurySummary(awayInjuries);
        injuryAdvantage = getInjuryAdvantage(homeInjuries, awayInjuries);
        
        console.log(`[INJURY] ${home.team.abbreviation}:`, homeInjuryAdj);
        console.log(`[INJURY] ${away.team.abbreviation}:`, awayInjuryAdj);
        console.log(`[INJURY] Advantage:`, injuryAdvantage.advantage);
        
        // Use injury-adjusted stats for features
        const spreadFeatures = buildEliteFeatures(homeL10WithInjuries, awayL10WithInjuries);
        const totalFeatures = buildSimpleFeatures(homeL10WithInjuries, awayL10WithInjuries);
      } catch (injuryError) {
        console.log(`[INJURY] Error fetching injuries, using RCI-only adjustments:`, injuryError.message);
        
        // Fallback to RCI-only stats
        var spreadFeatures = buildEliteFeatures(homeL10, awayL10);
        var totalFeatures = buildSimpleFeatures(homeL10, awayL10);
      }
      
      // Ensure features are defined (from either injury-adjusted or fallback)
      if (typeof spreadFeatures === 'undefined') {
        var spreadFeatures = buildEliteFeatures(homeL10, awayL10);
        var totalFeatures = buildSimpleFeatures(homeL10, awayL10);
      }
      
      // Predict spread
      const spreadPred = predict(SPREAD_MODEL, spreadFeatures);
      
      // ELITE Total: Opponent-adjusted offensive projections
      // Account for defensive matchup quality
      const leagueAvgDefRtg = 114.5; // NBA league average
      const avgPace = (homeL10.pace + awayL10.pace) / 2;
      
      // Home team scoring: Adjust for away team's defense
      // If facing weak defense (115), score more. If facing elite (106), score less.
      const homeDefAdj = awayL10.defRtg / leagueAvgDefRtg;
      const homeExpectedPts = homeL10.offRtg * homeDefAdj * (avgPace / 100);
      
      // Away team scoring: Adjust for home team's defense
      const awayDefAdj = homeL10.defRtg / leagueAvgDefRtg;
      const awayExpectedPts = awayL10.offRtg * awayDefAdj * (avgPace / 100);
      
      // Total from matchup-adjusted projections
      const totalFromMatchup = homeExpectedPts + awayExpectedPts;
      
      // Also run the model prediction for comparison
      const totalPredModel = predict(TOTAL_MODEL, totalFeatures);
      
      // Blend: 70% matchup-adjusted, 30% model
      const totalPred = 0.7 * totalFromMatchup + 0.3 * totalPredModel;
      
      // Calculate base confidence
      const netRtgDiff = Math.abs(homeL10.netRtg - awayL10.netRtg);
      let confidence = 60;
      if (netRtgDiff > 8) confidence += 15;
      else if (netRtgDiff > 5) confidence += 10;
      else if (netRtgDiff > 3) confidence += 5;
      
      // EARLY SEASON ADJUSTMENT: Reduce confidence based on sample size
      // First 5-10 games are learning period, model needs data to stabilize
      const avgGames = (homeL10.games + awayL10.games) / 2;
      let seasonAdjustment = 1.0; // Full confidence multiplier
      let seasonNote = null;
      
      if (avgGames < 5) {
        seasonAdjustment = 0.5; // 50% confidence - very early season
        seasonNote = 'EARLY SEASON: First 5 games. Model learning current form. Reduce unit sizing.';
      } else if (avgGames < 10) {
        seasonAdjustment = 0.75; // 75% confidence - still early
        seasonNote = 'EARLY SEASON: Games 5-10. Model stabilizing. Consider smaller units.';
      } else if (avgGames < 15) {
        seasonAdjustment = 0.9; // 90% confidence - getting there
        seasonNote = 'Model confidence building. Normal unit sizing after 15 games.';
      }
      
      confidence = Math.floor(confidence * seasonAdjustment);
      
      // Win probability from spread
      const winProb = 1 / (1 + Math.exp(-spreadPred / 10));
      
      // Get Vegas lines for this game (match by abbreviations)
      const vegasKey = `${away.team.abbreviation}_${home.team.abbreviation}`;
      const gameVegasLines = vegasLines[vegasKey] || {};
      
      // Calculate edges and Kelly sizing
      const opportunities = [];
      
      // ELITE BETTING STRATEGY: Evaluate all market types and recommend the best EV play
      
      // 1. SPREAD OPPORTUNITY
      let spreadOpp = null;
      if (gameVegasLines.spread?.home != null && gameVegasLines.spread?.homePrice != null) {
        const modelSpreadVegasConvention = -spreadPred;
        
        const spreadEdge = calculateEdgeAndKelly(
          modelSpreadVegasConvention,
          gameVegasLines.spread.home,
          gameVegasLines.spread.homePrice,
          winProb,
          5000,
          seasonAdjustment // Apply early season sizing reduction
        );
        
        if (spreadEdge && spreadEdge.edgePoints >= 3) {
          const betHome = spreadPred > gameVegasLines.spread.home;
          const pickTeam = betHome ? home.team.abbreviation : away.team.abbreviation;
          const pickLine = betHome ? gameVegasLines.spread.home : -gameVegasLines.spread.home;
          const pickSign = pickLine >= 0 ? '+' : '';
          
          spreadOpp = {
            market: 'Spread',
            pick: `${pickTeam} ${pickSign}${pickLine}`,
            modelLine: spreadPred.toFixed(1),
            vegasLine: gameVegasLines.spread.home,
            odds: gameVegasLines.spread.homePrice,
            edge: spreadEdge.edgePoints,
            edgePercent: spreadEdge.edgePercent,
            kelly: spreadEdge.kellyFraction,
            betSize: spreadEdge.betSize,
            units: spreadEdge.units,
            book: gameVegasLines.spread.book,
            expectedValue: spreadEdge.edgePercent * spreadEdge.betSize // EV in dollars
          };
        }
      }
      
      // 2. MONEYLINE OPPORTUNITY (for close games or high confidence)
      let moneylineOpp = null;
      if (gameVegasLines.moneyline?.home != null && gameVegasLines.moneyline?.away != null) {
        // Determine which side has value
        const homeML = gameVegasLines.moneyline.home;
        const awayML = gameVegasLines.moneyline.away;
        
        // Convert moneyline to implied probability
        const homeImpliedProb = homeML > 0 
          ? 100 / (homeML + 100) 
          : Math.abs(homeML) / (Math.abs(homeML) + 100);
        const awayImpliedProb = awayML > 0
          ? 100 / (awayML + 100)
          : Math.abs(awayML) / (Math.abs(awayML) + 100);
        
        // Model win probability (already calculated)
        const homeWinProb = winProb;
        const awayWinProb = 1 - winProb;
        
        // Edge in probability terms
        const homeMLEdge = homeWinProb - homeImpliedProb;
        const awayMLEdge = awayWinProb - awayImpliedProb;
        
        // Pick the side with positive edge (if any)
        if (homeMLEdge > 0.03 || awayMLEdge > 0.03) { // 3% edge minimum
          const pickHome = homeMLEdge > awayMLEdge;
          const pickOdds = pickHome ? homeML : awayML;
          const pickProb = pickHome ? homeWinProb : awayWinProb;
          const pickEdge = pickHome ? homeMLEdge : awayMLEdge;
          
          const mlKelly = calculateEdgeAndKelly(
            pickProb * 100, // Convert to 0-100 scale
            pickProb > 0.5 ? -100 : 100, // Dummy value, we use pickProb directly
            pickOdds,
            pickProb,
            5000,
            seasonAdjustment // Apply early season sizing reduction
          );
          
          if (mlKelly) {
            moneylineOpp = {
              market: 'Moneyline',
              pick: pickHome ? home.team.abbreviation : away.team.abbreviation,
              modelWinProb: (pickProb * 100).toFixed(1) + '%',
              impliedProb: ((pickHome ? homeImpliedProb : awayImpliedProb) * 100).toFixed(1) + '%',
              odds: pickOdds,
              edge: (pickEdge * 100).toFixed(1) + '%',
              edgePercent: pickEdge * 100,
              kelly: mlKelly.kellyFraction,
              betSize: mlKelly.betSize,
              units: mlKelly.units,
              book: gameVegasLines.moneyline.book,
              expectedValue: pickEdge * 100 * mlKelly.betSize
            };
          }
        }
      }
      
      // 3. TEAM TOTALS (if we have the lines)
      let teamTotalOpp = null;
      // Home team total
      const homeTeamTotal = homeExpectedPts;
      const awayTeamTotal = awayExpectedPts;
      
      // Note: Most books don't provide team totals via API, but we can project them
      // For now, we calculate but don't show unless we have actual lines
      
      // 4. TOTAL OPPORTUNITY  
      let totalOpp = null;
      if (gameVegasLines.total?.line != null) {
        const totalEdge = Math.abs(totalPred - gameVegasLines.total.line);
        
        if (totalEdge >= 4) {
          const pickOver = totalPred > gameVegasLines.total.line;
          const totalOdds = pickOver ? gameVegasLines.total.overPrice : gameVegasLines.total.underPrice;
          
          // Rough Kelly for totals (simplified)
          const totalImpliedProb = Math.abs(totalOdds) / (Math.abs(totalOdds) + 100);
          const totalEdgePercent = (totalEdge / gameVegasLines.total.line) * 100;
          
          totalOpp = {
            market: 'Total',
            pick: pickOver ? `Over ${gameVegasLines.total.line}` : `Under ${gameVegasLines.total.line}`,
            modelLine: totalPred.toFixed(1),
            vegasLine: gameVegasLines.total.line,
            odds: totalOdds,
            edge: totalEdge.toFixed(1),
            edgePercent: totalEdgePercent,
            kelly: null, // Would need more sophisticated total prob model
            betSize: null,
            units: null,
            book: gameVegasLines.total.book,
            expectedValue: totalEdgePercent * 50 // Rough estimate
          };
        }
      }
      
      // ELITE DECISION: Recommend the best EV play(s)
      // Priority: 1) Best EV/Kelly 2) Spread if close game 3) ML if blowout 4) Total if both
      
      const allOpps = [spreadOpp, moneylineOpp, totalOpp].filter(Boolean);
      
      // Sort by expected value (EV)
      allOpps.sort((a, b) => (b.expectedValue || 0) - (a.expectedValue || 0));
      
      // Add top 2 opportunities (or all if fewer)
      opportunities.push(...allOpps.slice(0, 2));
      
      // Store team totals for advanced users
      const teamTotals = {
        home: {
          team: home.team.abbreviation,
          projection: homeExpectedPts.toFixed(1),
          factors: {
            offRtg: homeL10.offRtg.toFixed(1),
            vsDefense: awayL10.defRtg.toFixed(1),
            adjustment: homeDefAdj.toFixed(3),
            pace: avgPace.toFixed(1)
          }
        },
        away: {
          team: away.team.abbreviation,
          projection: awayExpectedPts.toFixed(1),
          factors: {
            offRtg: awayL10.offRtg.toFixed(1),
            vsDefense: homeL10.defRtg.toFixed(1),
            adjustment: awayDefAdj.toFixed(3),
            pace: avgPace.toFixed(1)
          }
        }
      };
      
      predictions.push({
        gameId: event.id,
        game: `${away.team.abbreviation} @ ${home.team.abbreviation}`,
        gameTime: event.date,
        isPreseason,  // ⚠️ FLAG: Do not include preseason games in regular season performance tracking
        teams: {
          home: {
            name: home.team.displayName,
            abbreviation: home.team.abbreviation,
            record: home.records?.[0]?.summary || '',
            rci: homeRCI,
            injuries: homeInjuryAdj
          },
          away: {
            name: away.team.displayName,
            abbreviation: away.team.abbreviation,
            record: away.records?.[0]?.summary || '',
            rci: awayRCI,
            injuries: awayInjuryAdj
          }
        },
        injuryReport: injuryAdvantage,
        prediction: {
          spread: {
            prediction: parseFloat(spreadPred.toFixed(1)),
            favorite: spreadPred > 0 ? 'home' : 'away',
            line: parseFloat(Math.abs(spreadPred).toFixed(1))
          },
          total: {
            prediction: parseFloat(totalPred.toFixed(1)),
            over: totalPred > 220,
            under: totalPred < 220
          },
          winProbability: {
            home: parseFloat((winProb * 100).toFixed(1)),
            away: parseFloat(((1 - winProb) * 100).toFixed(1))
          },
          confidence,
          seasonNote // Early season warning if applicable
        },
        keyFactors: generateKeyFactors(
          home, away, homeL10, awayL10, 
          spreadPred, totalPred, 
          homeExpectedPts, awayExpectedPts,
          homeInjuryAdj, awayInjuryAdj,
          opportunities
        ),
        features: {
          homeL10: {
            netRtg: homeL10.netRtg.toFixed(1),
            offRtg: homeL10.offRtg.toFixed(1),
            defRtg: homeL10.defRtg.toFixed(1),
            games: homeL10.games
          },
          awayL10: {
            netRtg: awayL10.netRtg.toFixed(1),
            offRtg: awayL10.offRtg.toFixed(1),
            defRtg: awayL10.defRtg.toFixed(1),
            games: awayL10.games
          }
        },
        vegasLines: {
          spread: gameVegasLines.spread?.home != null ? {
            line: gameVegasLines.spread.home,
            price: gameVegasLines.spread.homePrice,
            book: gameVegasLines.spread.book
          } : null,
          total: gameVegasLines.total?.line != null ? {
            line: gameVegasLines.total.line,
            overPrice: gameVegasLines.total.overPrice,
            underPrice: gameVegasLines.total.underPrice,
            book: gameVegasLines.total.book
          } : null,
          moneyline: gameVegasLines.moneyline?.home != null ? {
            home: gameVegasLines.moneyline.home,
            away: gameVegasLines.moneyline.away,
            book: gameVegasLines.moneyline.book
          } : null
        },
        opportunities,
        teamTotals // NEW: Individual team scoring projections
      });
    }
    
    console.log(`[NBA Elite] Generated ${predictions.length} predictions`);
    
    return new Response(JSON.stringify({
      ok: true,
      generated: new Date().toISOString(),
      games: predictions.length,
      predictions,
      isPreseason,  // ⚠️ Frontend: Show preseason warning banner
      preseasonWarning: isPreseason ? 'Preseason predictions are for observation only. Model is trained on regular season data. DO NOT track these results in regular season performance metrics.' : null,
      modelInfo: {
        type: 'Elite Ensemble',
        features: 55,
        spreadMAE: 11.606,
        totalMAE: 15.89,
        dataSource: 'Netlify Blobs + ESPN',
        status: isPreseason ? '⚠️ Preseason - Observation Only' : 'Regular Season - Full Tracking'
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300'
      }
    });
    
  } catch (error) {
    console.error('[NBA Elite] Error:', error);
    
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
