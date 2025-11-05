#!/usr/bin/env node
/**
 * ENHANCED CSV EXPORT: NFL Week 10 V5 Predictions
 * 
 * Adds client-facing columns:
 * - Favored: Team name picked to win
 * - FavBy: Absolute spread value
 * - Market_Spread: Vegas spread (blank if unavailable)
 * - Market_Total: Vegas total (blank if unavailable)
 * - Spread_Edge: Model - Market (blank if unavailable)
 * - Total_Edge: Model - Market (blank if unavailable)
 * - Note: Status message for missing data
 */

import fs from 'fs'
import path from 'path'

// Load JSON bundle
const jsonPath = path.join(process.env.HOME, "Desktop", "REPO33", "RRMODEL", "nfl-model-v4.1", "output", 'bundle_v5_week10_real.json')
const bundleData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

// CSV Header with GPT-recommended sign-safe columns
const header = [
  'Week',
  'Kickoff_ET',
  'Matchup',
  'Away',
  'Home',
  'Model_Favored',
  'Model_FavBy',
  'Model_Spread',        // Signed: negative = home favored
  'Market_Spread',       // Signed: Vegas line
  'Spread_Delta',        // Model - Market
  'Spread_Conf%',
  'Model_Total',
  'Total_P25',
  'Total_P50',
  'Total_P75',
  'Market_Total',
  'Total_Delta',         // Model - Market
  'Total_Conf%',
  'OU_Side',
  'EPA_Diff',
  'Success_Diff_pct',
  'Explosive_Diff_pct',
  'HFA_Applied',
  'Spread_Units',        // Blank until odds API
  'Total_Units',         // Blank until odds API
  'Game_Units_Total',    // Blank until odds API
  'Notes'
].join(',')

const rows = [header]

bundleData.rows.forEach((game, idx) => {
  const week = game.week
  const away = game.awayTeam
  const home = game.homeTeam
  const matchup = `"${game.matchup}"`
  
  // Convert UTC kickoff to ET
  const kickoffUTC = new Date(game.kickoff)
  const kickoffET = kickoffUTC.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  
  // Spread details (sign-safe)
  const modelFavored = game.spread.team
  const modelFavBy = game.spread.line.toFixed(1)
  
  // Model_Spread: Negative if home favored (Vegas convention)
  const modelSpread = game.spread.side === 'home' 
    ? -game.spread.line 
    : game.spread.line
  
  const spreadConf = (game.spread.confidence * 100).toFixed(1)
  
  // Market data (blank if unavailable)
  const marketSpread = game.vegas.spread !== null ? game.vegas.spread.toFixed(1) : ''
  const spreadDelta = game.edge.spread !== null ? game.edge.spread.toFixed(1) : ''
  
  // Total details
  const modelTotal = game.total.total.toFixed(1)
  const totalP25 = game.total.p25.toFixed(1)
  const totalP50 = game.total.p50.toFixed(1)
  const totalP75 = game.total.p75.toFixed(1)
  const totalConf = (game.total.confidence * 100).toFixed(1)
  
  const marketTotal = game.vegas.total !== null ? game.vegas.total.toFixed(1) : ''
  const totalDelta = game.edge.total !== null ? game.edge.total.toFixed(1) : ''
  const ouSide = game.total.side !== null ? game.total.side.toUpperCase() : ''
  
  // Model components (parsed from JSON)
  const epaDiff = game.spread.components.epa_diff
  const successDiff = game.spread.components.success_diff
  const explosiveDiff = game.spread.components.explosive_diff
  const hfaApplied = game.spread.components.hfa
  
  // Units (blank until odds API)
  const spreadUnits = ''
  const totalUnits = ''
  const gameUnitsTotal = ''
  
  // Note for missing data
  let note = ''
  if (game.vegas.spread === null && game.vegas.total === null) {
    note = '"No market lines - Projection only"'
  } else if (game.vegas.spread === null) {
    note = '"No spread line available"'
  } else if (game.vegas.total === null) {
    note = '"No total line available"'
  } else {
    note = '"Actionable"'
  }
  
  rows.push([
    week,
    `"${kickoffET}"`,
    matchup,
    away,
    home,
    modelFavored,
    modelFavBy,
    modelSpread.toFixed(1),
    marketSpread,
    spreadDelta,
    spreadConf,
    modelTotal,
    totalP25,
    totalP50,
    totalP75,
    marketTotal,
    totalDelta,
    totalConf,
    ouSide,
    epaDiff,
    successDiff,
    explosiveDiff,
    hfaApplied,
    spreadUnits,
    totalUnits,
    gameUnitsTotal,
    note
  ].join(','))
})

// Write enhanced CSV
const csvPath = path.join(process.env.HOME, 'Desktop', 'NFL_V5_WEEK10_ENHANCED.csv')
fs.writeFileSync(csvPath, rows.join('\n'), 'utf-8')

console.log(`✅ Enhanced CSV exported: ${csvPath}`)
console.log(`📊 ${bundleData.rows.length} games with client-facing columns`)
console.log(`\nNew columns added:`)
console.log(`  - Favored: Team picked to win`)
console.log(`  - FavBy: Absolute spread value`)
console.log(`  - Market_Spread/Total: Vegas lines (blank if unavailable)`)
console.log(`  - Spread_Edge/Total_Edge: Model - Market (blank if unavailable)`)
console.log(`  - OU_Side: OVER/UNDER (blank if no market line)`)
console.log(`  - Note: "No market lines - Projection only" status`)
console.log(`\n🎯 All games currently show "No market lines - Projection only"`)
console.log(`   → Integrate odds API to enable actionable picks with edge calculations`)
