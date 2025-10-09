/**
 * NFL GAME PICKS GENERATOR - Week 4 2025
 * Moneyline, Spread, and Totals with Injury Adjustments & Kelly Betting
 */

const fs = require('fs');
const path = require('path');

// Load injury data
function loadInjuryData() {
  try {
    const injuryPath = path.join(__dirname, 'data', 'nfl', 'injuries', 'latest.json');
    const rawData = fs.readFileSync(injuryPath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.log('⚠️ Could not load injury data:', error.message);
    return { teams: {} };
  }
}

// Load depth charts
function loadDepthCharts() {
  try {
    const depthPath = path.join(__dirname, 'public', 'history', '2025', 'week4', 'depth-charts.json');
    const rawData = fs.readFileSync(depthPath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.log('⚠️ Could not load depth charts:', error.message);
    return {};
  }
}

// Enhanced injury impact calculation
function calculateInjuryImpact(team, injuryData, depthCharts) {
  const teamData = injuryData.teams?.[team];
  if (!teamData) return { impact: 0, details: 'No injury data' };
  
  let totalImpact = 0;
  const details = [];
  
  console.log(`🔍 Processing ${team} injuries:`, Object.keys(teamData));
  
  // QB Impact (most critical)
  if (teamData.qb_status === 'out') {
    const qbName = teamData.qb_name || 'Starting QB';
    const backupQB = depthCharts[team]?.QB?.[1] || 'Backup QB';
    const qbImpact = -8.5; // Major QB injury impact
    totalImpact += qbImpact;
    details.push(`${qbName} OUT → ${backupQB} (${qbImpact.toFixed(1)} pts)`);
  }
  
  // WR Injuries (check all status types)
  const wrInjuries = teamData.wr_injuries || [];
  console.log(`  WR Injuries found: ${wrInjuries.length}`);
  wrInjuries.forEach(wr => {
    console.log(`    ${wr.name}: ${wr.status} (depth: ${wr.depth})`);
    
    if (wr.status && wr.status.toLowerCase() === 'out' && wr.depth <= 2) {
      const impact = wr.depth === 1 ? -3.2 : -1.8; // WR1 vs WR2 impact
      totalImpact += impact;
      details.push(`${wr.name} OUT (${impact.toFixed(1)} pts)`);
    } else if (wr.status && wr.status.toLowerCase() === 'questionable' && wr.depth === 1) {
      const impact = -1.5;
      totalImpact += impact;
      details.push(`${wr.name} QUEST (${impact.toFixed(1)} pts)`);
    }
  });
  
  // RB Injuries
  const rbInjuries = teamData.rb_injuries || [];
  console.log(`  RB Injuries found: ${rbInjuries.length}`);
  rbInjuries.forEach(rb => {
    console.log(`    ${rb.name}: ${rb.status} (depth: ${rb.depth})`);
    
    if (rb.status && rb.status.toLowerCase() === 'out' && rb.depth <= 2) {
      const impact = rb.depth === 1 ? -2.8 : -1.2;
      totalImpact += impact;
      details.push(`${rb.name} OUT (${impact.toFixed(1)} pts)`);
    } else if (rb.status && rb.status.toLowerCase() === 'questionable' && rb.depth <= 2) {
      const impact = rb.depth === 1 ? -1.4 : -0.7;
      totalImpact += impact;
      details.push(`${rb.name} QUEST (${impact.toFixed(1)} pts)`);
    }
  });
  
  // TE Injuries
  const teInjuries = teamData.te_injuries || [];
  console.log(`  TE Injuries found: ${teInjuries.length}`);
  teInjuries.forEach(te => {
    console.log(`    ${te.name}: ${te.status} (depth: ${te.depth})`);
    
    if (te.status && te.status.toLowerCase() === 'out' && te.depth === 1) {
      const impact = -1.5;
      totalImpact += impact;
      details.push(`${te.name} OUT (${impact.toFixed(1)} pts)`);
    }
  });
  
  console.log(`  Total impact for ${team}: ${totalImpact.toFixed(1)}`);
  console.log(`  Details: ${details.join('; ') || 'No significant injuries'}`);
  
  return { impact: totalImpact, details: details.join('; ') || 'No significant injuries' };
}

// Kelly Criterion calculation
function calculateKellyUnits(winProb, odds, bankroll = 1000, maxBet = 0.25) {
  const decimalOdds = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
  const b = decimalOdds - 1;
  const p = winProb;
  const q = 1 - p;
  
  const kellyFraction = (b * p - q) / b;
  const cappedFraction = Math.max(0, Math.min(kellyFraction, maxBet));
  const units = cappedFraction * 10; // Convert to 10-unit scale
  
  return {
    kelly_fraction: kellyFraction,
    capped_fraction: cappedFraction,
    units: units,
    bet_amount: cappedFraction * bankroll,
    edge: (winProb * decimalOdds - 1) * 100
  };
}

// Generate Week 4 game picks
function generateWeek4GamePicks() {
  console.log('🏈 Generating Week 4 NFL Game Picks with Injury Adjustments...');
  
  const injuryData = loadInjuryData();
  const depthCharts = loadDepthCharts();
  
  // Week 4 2025 Games with current odds
  const games = [
    { home: 'ATL', away: 'WAS', spread: -3.0, total: 48.5, ml_home: -150, ml_away: +130, time: 'Sun 1:00 PM' },
    { home: 'BUF', away: 'MIA', spread: -6.5, total: 47.0, ml_home: -280, ml_away: +220, time: 'Sun 1:00 PM' },
    { home: 'KC', away: 'LV', spread: -9.5, total: 44.0, ml_home: -450, ml_away: +350, time: 'Sun 1:00 PM' },
    { home: 'SF', away: 'LAR', spread: -3.5, total: 51.0, ml_home: -165, ml_away: +140, time: 'Sun 4:25 PM' },
    { home: 'DAL', away: 'NYG', spread: -4.5, total: 43.5, ml_home: -200, ml_away: +170, time: 'Sun 4:25 PM' },
    { home: 'PHI', away: 'TB', spread: -2.5, total: 49.0, ml_home: -135, ml_away: +115, time: 'Sun 1:00 PM' },
    { home: 'BAL', away: 'CIN', spread: -1.5, total: 50.5, ml_home: -110, ml_away: -110, time: 'Sun 8:20 PM' },
    { home: 'GB', away: 'MIN', spread: -3.0, total: 46.5, ml_home: -155, ml_away: +135, time: 'Sun 1:00 PM' },
    { home: 'DET', away: 'CHI', spread: -7.0, total: 48.0, ml_home: -320, ml_away: +260, time: 'Sun 1:00 PM' },
    { home: 'HOU', away: 'JAX', spread: -4.0, total: 45.5, ml_home: -180, ml_away: +155, time: 'Sun 1:00 PM' },
    { home: 'CAR', away: 'CLE', spread: +2.5, total: 41.0, ml_home: +120, ml_away: -140, time: 'Sun 1:00 PM' },
    { home: 'PIT', away: 'IND', spread: -6.0, total: 42.5, ml_home: -260, ml_away: +210, time: 'Mon 8:15 PM' }
  ];
  
  const predictions = [];
  
  games.forEach(game => {
    // Calculate injury impacts
    const homeInjury = calculateInjuryImpact(game.home, injuryData, depthCharts);
    const awayInjury = calculateInjuryImpact(game.away, injuryData, depthCharts);
    
    // Net injury adjustment (positive favors home team)
    const netInjuryAdj = awayInjury.impact - homeInjury.impact;
    
    // Adjust spread based on injuries
    const adjustedSpread = game.spread - netInjuryAdj;
    
    // Calculate win probabilities using logistic model
    const homeWinProb = 1 / (1 + Math.exp(-0.18 * adjustedSpread));
    const awayWinProb = 1 - homeWinProb;
    
    // Over/Under adjustments
    const totalInjuryImpact = Math.abs(homeInjury.impact) + Math.abs(awayInjury.impact);
    const adjustedTotal = game.total - (totalInjuryImpact * 0.3);
    
    // Expected total score
    const expectedTotal = 46.2 - (totalInjuryImpact * 0.5);
    const overProb = expectedTotal > adjustedTotal ? 0.58 : 0.42;
    
    // Kelly calculations for all bet types
    const homeMLKelly = calculateKellyUnits(homeWinProb, game.ml_home);
    const awayMLKelly = calculateKellyUnits(awayWinProb, game.ml_away);
    const homeSpreadKelly = calculateKellyUnits(homeWinProb, -110);
    const awaySpreadKelly = calculateKellyUnits(awayWinProb, -110);
    const overKelly = calculateKellyUnits(overProb, -110);
    const underKelly = calculateKellyUnits(1 - overProb, -110);
    
    // Determine recommendations (edge > 2% and Kelly > 0.3 units)
    const recommendations = [];
    
    if (homeMLKelly.edge > 2 && homeMLKelly.units > 0.3) {
      recommendations.push(`ML ${game.home} (${homeMLKelly.units.toFixed(1)}u)`);
    }
    if (awayMLKelly.edge > 2 && awayMLKelly.units > 0.3) {
      recommendations.push(`ML ${game.away} (${awayMLKelly.units.toFixed(1)}u)`);
    }
    if (homeSpreadKelly.edge > 1.5 && homeSpreadKelly.units > 0.3) {
      recommendations.push(`${game.home} ${game.spread > 0 ? '+' : ''}${game.spread} (${homeSpreadKelly.units.toFixed(1)}u)`);
    }
    if (awaySpreadKelly.edge > 1.5 && awaySpreadKelly.units > 0.3) {
      const awaySpread = -game.spread;
      recommendations.push(`${game.away} ${awaySpread > 0 ? '+' : ''}${awaySpread} (${awaySpreadKelly.units.toFixed(1)}u)`);
    }
    if (overKelly.edge > 1.5 && overKelly.units > 0.3) {
      recommendations.push(`OVER ${game.total} (${overKelly.units.toFixed(1)}u)`);
    }
    if (underKelly.edge > 1.5 && underKelly.units > 0.3) {
      recommendations.push(`UNDER ${game.total} (${underKelly.units.toFixed(1)}u)`);
    }
    
    // Find best bet
    const allBets = [
      { type: 'ML_HOME', prob: homeWinProb, kelly: homeMLKelly },
      { type: 'ML_AWAY', prob: awayWinProb, kelly: awayMLKelly },
      { type: 'SPREAD_HOME', prob: homeWinProb, kelly: homeSpreadKelly },
      { type: 'SPREAD_AWAY', prob: awayWinProb, kelly: awaySpreadKelly },
      { type: 'OVER', prob: overProb, kelly: overKelly },
      { type: 'UNDER', prob: 1 - overProb, kelly: underKelly }
    ];
    
    const bestBet = allBets.reduce((best, current) => 
      current.kelly.edge > best.kelly.edge ? current : best
    );
    
    predictions.push({
      matchup: `${game.away} @ ${game.home}`,
      game_time: game.time,
      home_team: game.home,
      away_team: game.away,
      original_spread: game.spread,
      adjusted_spread: adjustedSpread,
      spread_adjustment: (adjustedSpread - game.spread),
      original_total: game.total,
      adjusted_total: adjustedTotal,
      total_adjustment: (adjustedTotal - game.total),
      home_win_prob: homeWinProb,
      away_win_prob: awayWinProb,
      over_prob: overProb,
      under_prob: 1 - overProb,
      home_injury_impact: homeInjury.impact,
      away_injury_impact: awayInjury.impact,
      home_injury_details: homeInjury.details,
      away_injury_details: awayInjury.details,
      recommendations: recommendations,
      best_bet_type: bestBet.type,
      best_bet_edge: bestBet.kelly.edge,
      best_bet_units: bestBet.kelly.units,
      best_bet_amount: bestBet.kelly.bet_amount
    });
  });
  
  return predictions;
}

// Generate subscriber-friendly CSV output
function generateGamePicksCSV() {
  const predictions = generateWeek4GamePicks();
  
  console.log('📊 Generating subscriber-friendly CSV output...');
  
  // Convert to clean, subscriber-friendly format
  const csvData = predictions.map(pred => {
    // Get best recommendation
    const topRec = pred.recommendations.length > 0 ? pred.recommendations[0] : 'NO BET';
    
    // Calculate confidence level
    let confidence = 'Low';
    if (pred.best_bet_edge > 10) confidence = 'High';
    else if (pred.best_bet_edge > 5) confidence = 'Medium';
    
    // Calculate all three bets with PICK/NO PICK
    const mlHomeEdge = calculateKellyEdge(pred.home_ml_odds, pred.home_win_prob);
    const mlAwayEdge = calculateKellyEdge(pred.away_ml_odds, pred.away_win_prob);
    const spreadHomeEdge = calculateKellyEdge(pred.home_spread_odds || -110, pred.home_spread_prob);
    const spreadAwayEdge = calculateKellyEdge(pred.away_spread_odds || -110, pred.away_spread_prob);
    const overEdge = calculateKellyEdge(pred.over_odds || -110, pred.over_prob);
    const underEdge = calculateKellyEdge(pred.under_odds || -110, pred.under_prob);

    const mlHomeUnits = mlHomeEdge > 0.02 ? calculateKellyUnits(pred.home_ml_odds, pred.home_win_prob) : 0;
    const mlAwayUnits = mlAwayEdge > 0.02 ? calculateKellyUnits(pred.away_ml_odds, pred.away_win_prob) : 0;
    const spreadHomeUnits = spreadHomeEdge > 0.02 ? calculateKellyUnits(pred.home_spread_odds || -110, pred.home_spread_prob) : 0;
    const spreadAwayUnits = spreadAwayEdge > 0.02 ? calculateKellyUnits(pred.away_spread_odds || -110, pred.away_spread_prob) : 0;
    const overUnits = overEdge > 0.02 ? calculateKellyUnits(pred.over_odds || -110, pred.over_prob) : 0;
    const underUnits = underEdge > 0.02 ? calculateKellyUnits(pred.under_odds || -110, pred.under_prob) : 0;

    // Format picks
    const mlPick = mlHomeUnits > mlAwayUnits 
      ? (mlHomeUnits > 0 ? `PICK ${pred.home_team} ML (${mlHomeUnits.toFixed(1)}u)` : 'NO PICK')
      : (mlAwayUnits > 0 ? `PICK ${pred.away_team} ML (${mlAwayUnits.toFixed(1)}u)` : 'NO PICK');
    
    const spreadPick = spreadHomeUnits > spreadAwayUnits
      ? (spreadHomeUnits > 0 ? `PICK ${pred.home_team} ${pred.original_spread > 0 ? '+' : ''}${pred.original_spread.toFixed(1)} (${spreadHomeUnits.toFixed(1)}u)` : 'NO PICK')
      : (spreadAwayUnits > 0 ? `PICK ${pred.away_team} ${pred.original_spread < 0 ? '+' : ''}${(-pred.original_spread).toFixed(1)} (${spreadAwayUnits.toFixed(1)}u)` : 'NO PICK');
    
    const totalPick = overUnits > underUnits
      ? (overUnits > 0 ? `PICK OVER ${pred.original_total.toFixed(1)} (${overUnits.toFixed(1)}u)` : 'NO PICK')
      : (underUnits > 0 ? `PICK UNDER ${pred.original_total.toFixed(1)} (${underUnits.toFixed(1)}u)` : 'NO PICK');

    return {
      'Game': pred.matchup,
      'Time': pred.game_time,
      'Spread_Line': `${pred.home_team} ${pred.original_spread > 0 ? '+' : ''}${pred.original_spread.toFixed(1)}`,
      'Total_Line': pred.original_total.toFixed(1),
      'Moneyline': mlPick,
      'Spread': spreadPick,
      'Total': totalPick,
      'Notes': pred.spread_adjustment !== 0 ? `Line adjusted ${pred.spread_adjustment > 0 ? '+' : ''}${pred.spread_adjustment.toFixed(1)} pts due to injuries` : 'No injury adjustment'
    };
  });
  
  // Sort by units (highest first)
  csvData.sort((a, b) => parseFloat(b.Units) - parseFloat(a.Units));
  
  // Write CSV
  const headers = Object.keys(csvData[0]);
  let csvContent = headers.join(',') + '\n';
  
  csvData.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    });
    csvContent += values.join(',') + '\n';
  });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `NFL-Week4-Subscriber-Picks-${timestamp}.csv`;
  
  fs.writeFileSync(filename, csvContent);
  
  console.log(`✅ Generated: ${filename}`);
  
  // Show summary
  const betCount = csvData.filter(r => r.Recommendations !== 'NO BET').length;
  const topBets = csvData
    .filter(r => r.Recommendations !== 'NO BET')
    .sort((a, b) => parseFloat(b.Best_Bet_Edge) - parseFloat(a.Best_Bet_Edge))
    .slice(0, 3);
  
  console.log(`📈 ${predictions.length} games analyzed`);
  console.log(`🎯 ${betCount} games with betting opportunities`);
  
  if (topBets.length > 0) {
    console.log('\n🏆 TOP 3 PICKS:');
    topBets.forEach((bet, i) => {
      console.log(`${i + 1}. ${bet.Game}: ${bet.Recommendations.split(' | ')[0]} | ${bet.Best_Bet_Edge} edge | ${bet.Kelly_Units} units`);
    });
  }
  
  return filename;
}

// Run the generator
try {
  console.log('🚀 Starting NFL Week 4 Game Picks Generator...');
  const filename = generateGamePicksCSV();
  console.log(`\n🎉 Complete! Your betting sheet: ${filename}`);
} catch (error) {
  console.error('❌ Error:', error.message);
}