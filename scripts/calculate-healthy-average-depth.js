#!/usr/bin/env node

/**
 * Calculate Healthy Average Depth (HAD) for all players
 * 
 * Logic:
 * - Track each player's depth chart position across all weeks
 * - Only count weeks where they were healthy (Active/Questionable/Probable)
 * - Calculate average depth when healthy
 * - Use this as "true baseline" for injury impact calculations
 * 
 * Safety:
 * - Extensive validation and logging
 * - Confidence scoring based on sample size
 * - Anomaly detection for manual review
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const WEEKS_TO_ANALYZE = ['week1', 'week2', 'week3', 'week4', 'week5', 'week6', 'week7', 'week8'];
const HEALTHY_STATUSES = ['active', 'questionable', 'probable'];
const INJURED_STATUSES = ['out', 'doubtful', 'ir', 'pup', 'nfi', 'suspended'];

// Color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

/**
 * Load all weekly depth charts
 */
function loadWeeklyDepthCharts(weeks) {
  const depthChartsPath = path.join(__dirname, '../public/history/2025');
  const weeklyDepthCharts = {};
  
  console.log(`${COLORS.cyan}📊 Loading depth charts for weeks: ${weeks.join(', ')}${COLORS.reset}\n`);
  
  weeks.forEach(week => {
    const chartPath = path.join(depthChartsPath, week, 'depth-charts.json');
    
    if (!fs.existsSync(chartPath)) {
      console.log(`${COLORS.yellow}⚠️  Skipping ${week}: File not found${COLORS.reset}`);
      return;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(chartPath, 'utf8'));
      
      // Normalize position arrays - handle both formats:
      // Format 1: [{rank: "1", name: "Player"}] (weeks 1-7)
      // Format 2: ["Player1", "Player2"] (week 8)
      const normalizePosition = (posArray) => {
        if (!posArray || !Array.isArray(posArray)) return [];
        return posArray.map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item.name) return item.name;
          return null;
        }).filter(Boolean);
      };
      
      // Convert to team-keyed format
      // Handle two input formats:
      // - Array format: [{team: "Name", QB: [...]}] (week 7-8)
      // - Object format: {"ARI": {QB: [...]}, "ATL": {...}} (week 1-6)
      const teamData = {};
      
      if (Array.isArray(data)) {
        // Array format (weeks 7-8)
        data.forEach(team => {
          const teamName = team.team;
          if (!teamName) return;
          
          teamData[teamName] = {
            QB: normalizePosition(team.QB),
            RB: normalizePosition(team.RB),
            WR: normalizePosition(team.WR),
            TE: normalizePosition(team.TE)
          };
        });
      } else if (typeof data === 'object') {
        // Object format (weeks 1-6) - team abbreviations as keys
        const TEAM_ABBR_TO_NAME = {
          'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens',
          'BUF': 'Buffalo Bills', 'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
          'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns', 'DAL': 'Dallas Cowboys',
          'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
          'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars',
          'KC': 'Kansas City Chiefs', 'LV': 'Las Vegas Raiders', 'LAC': 'Los Angeles Chargers',
          'LAR': 'Los Angeles Rams', 'MIA': 'Miami Dolphins', 'MIN': 'Minnesota Vikings',
          'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
          'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers',
          'SF': 'San Francisco 49ers', 'SEA': 'Seattle Seahawks', 'TB': 'Tampa Bay Buccaneers',
          'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders'
        };
        
        Object.keys(data).forEach(abbr => {
          const teamName = TEAM_ABBR_TO_NAME[abbr] || abbr;
          const team = data[abbr];
          
          teamData[teamName] = {
            QB: normalizePosition(team.QB),
            RB: normalizePosition(team.RB),
            WR: normalizePosition(team.WR),
            TE: normalizePosition(team.TE)
          };
        });
      }
      
      weeklyDepthCharts[week] = teamData;
      console.log(`${COLORS.green}✓${COLORS.reset} Loaded ${week}: ${Object.keys(teamData).length} teams`);
    } catch (error) {
      console.error(`${COLORS.red}✗ Error loading ${week}:${COLORS.reset}`, error.message);
    }
  });
  
  console.log('');
  return weeklyDepthCharts;
}

/**
 * Get player injury status from multiple sources
 * Priority: 1) Injury reports 2) Depth-drop inference 3) Default active
 */
function getPlayerStatus(team, playerName, position, week, weeklyInjuries) {
  // PRIORITY 1: Explicit injury report data
  if (weeklyInjuries && weeklyInjuries[week] && weeklyInjuries[week][team]) {
    const playerInjury = weeklyInjuries[week][team].find(
      inj => {
        // Match by name (normalize for comparison)
        const normName = (n) => n.toLowerCase().replace(/[^a-z]/g, '');
        return normName(inj.name) === normName(playerName) && 
               inj.position.toUpperCase() === position.toUpperCase();
      }
    );
    
    if (playerInjury) {
      const status = playerInjury.status.toLowerCase();
      // Normalize status values
      if (status === 'q') return 'questionable';
      if (status === 'd') return 'doubtful';
      if (status === 'o' || status === 'inactive') return 'out';
      if (status === 'ir' || status === 'pup' || status === 'nfi') return 'out';
      return status;
    }
  }
  
  // PRIORITY 2: Depth-based inference happens in calculateHealthyAverageDepth
  // (We can't infer here because we don't have historical context yet)
  
  // PRIORITY 3: Default to active
  return 'active';
}

/**
 * Get manual depth for a player from baseline
 */
function getManualDepth(team, position, playerName, manualBaseline) {
  if (!manualBaseline || !manualBaseline[team]) return null;
  
  const teamBaseline = manualBaseline[team];
  if (!teamBaseline[position]) return null;
  
  const positionArray = teamBaseline[position];
  const index = positionArray.findIndex(name => {
    // Normalize names for comparison
    const normName = (n) => n.toLowerCase().replace(/[^a-z]/g, '');
    return normName(name) === normName(playerName);
  });
  
  return index >= 0 ? index + 1 : null;
}

/**
 * Calculate HAD for all players across all weeks
 */
function calculateHealthyAverageDepth(weeklyDepthCharts, weeklyInjuries = {}, manualBaseline = null) {
  const playerDepthHistory = {};
  const weeks = Object.keys(weeklyDepthCharts).sort();
  
  console.log(`${COLORS.cyan}🔍 Analyzing player depth across ${weeks.length} weeks${COLORS.reset}`);
  console.log(`${COLORS.cyan}📋 Manual baseline: ${manualBaseline ? 'ENABLED' : 'Not loaded'}${COLORS.reset}\n`);
  
  // Iterate through each week
  weeks.forEach(week => {
    const depthChart = weeklyDepthCharts[week];
    
    // For each team
    Object.keys(depthChart).forEach(team => {
      ['QB', 'RB', 'WR', 'TE'].forEach(position => {
        const players = depthChart[team][position] || [];
        
        // Track each player's depth
        players.forEach((playerName, index) => {
          if (!playerName || playerName.trim() === '') return;
          
          const depth = index + 1;
          
          // FILTER 1: Skip if player buried too deep (likely healthy scratch/inactive)
          // Players beyond depth 5 are noise for HAD calculation
          if (depth > 5) return;
          
          const playerKey = `${team}_${position}_${playerName}`;
          
          // Get player status for this week
          const status = getPlayerStatus(team, playerName, position, week, weeklyInjuries);
          
          // Initialize player history if needed
          if (!playerDepthHistory[playerKey]) {
            playerDepthHistory[playerKey] = {
              team,
              position,
              name: playerName,
              healthyWeeks: [],
              injuredWeeks: [],
              allWeeks: [],
              teams: new Set()  // Track team changes
            };
          }
          
          // FILTER 2: Detect team changes (trades/signings)
          playerDepthHistory[playerKey].teams.add(team);
          if (playerDepthHistory[playerKey].teams.size > 1) {
            // Player changed teams - only use data from current team
            const currentTeam = playerDepthHistory[playerKey].team;
            if (team !== currentTeam) {
              // Reset history for new team
              playerDepthHistory[playerKey] = {
                team,
                position,
                name: playerName,
                healthyWeeks: [],
                injuredWeeks: [],
                allWeeks: [],
                teams: new Set([team]),
                teamChange: true,
                previousTeam: currentTeam
              };
            }
          }
          
          // Record this week
          const weekRecord = { week, depth, status };
          playerDepthHistory[playerKey].allWeeks.push(weekRecord);
          
          // Categorize as healthy or injured
          if (HEALTHY_STATUSES.includes(status)) {
            playerDepthHistory[playerKey].healthyWeeks.push(weekRecord);
          } else if (INJURED_STATUSES.includes(status)) {
            playerDepthHistory[playerKey].injuredWeeks.push(weekRecord);
          } else {
            // Unknown status - treat as healthy for now
            playerDepthHistory[playerKey].healthyWeeks.push(weekRecord);
          }
        });
      });
    });
  });
  
  console.log(`${COLORS.green}✓ Tracked ${Object.keys(playerDepthHistory).length} unique players${COLORS.reset}\n`);
  
  // Calculate average for each player
  const healthyAverageDepths = {};
  const stats = {
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    neverHealthy: 0,
    anomalies: []
  };
  
  Object.keys(playerDepthHistory).forEach(playerKey => {
    const history = playerDepthHistory[playerKey];
    
    // Case 1: Never played healthy - use first appearance
    if (history.healthyWeeks.length === 0) {
      // Check manual baseline first
      const manualDepth = getManualDepth(history.team, history.position, history.name, manualBaseline);
      
      healthyAverageDepths[playerKey] = {
        ...history,
        healthyAverageDepth: manualDepth || history.allWeeks[0]?.depth || 1,
        rawAverage: manualDepth || history.allWeeks[0]?.depth || 1,
        sampleSize: 0,
        confidence: manualDepth ? 'manual' : 'none',
        reason: 'never_healthy',
        note: manualDepth ? 'Using manual baseline (never healthy)' : 'Player never appeared on depth chart while healthy',
        source: manualDepth ? 'manual_baseline' : 'first_appearance'
      };
      stats.neverHealthy++;
      return;
    }
    
    // Check if we have manual baseline override
    const manualDepth = getManualDepth(history.team, history.position, history.name, manualBaseline);
    
    // FILTER 3: Filter out extreme depth outliers from healthy weeks
    // Remove weeks where player was buried (depth > 5) - likely healthy scratch
    let validHealthyWeeks = history.healthyWeeks.filter(w => w.depth <= 5);
    
    // FILTER 4: Infer injuries from depth chart drops
    // If player was depth 1-2 for multiple weeks, then suddenly 3+, likely injured
    if (validHealthyWeeks.length >= 3) {
      const earlyWeeks = validHealthyWeeks.slice(0, Math.floor(validHealthyWeeks.length / 2));
      const avgEarlyDepth = earlyWeeks.reduce((sum, w) => sum + w.depth, 0) / earlyWeeks.length;
      
      // Only keep weeks where depth is within 1 spot of early average
      // This filters out "depth drop" weeks that indicate injury
      validHealthyWeeks = validHealthyWeeks.filter((w, idx) => {
        // Always keep early weeks (they establish baseline)
        if (idx < earlyWeeks.length) return true;
        
        // For later weeks, only keep if depth similar to early weeks
        // Drop of 2+ spots = likely injured
        return Math.abs(w.depth - avgEarlyDepth) < 2;
      });
    }
    
    // If no valid healthy weeks after filtering, fall back to manual baseline
    if (validHealthyWeeks.length === 0) {
      healthyAverageDepths[playerKey] = {
        ...history,
        healthyAverageDepth: manualDepth || 3,
        rawAverage: manualDepth || 3,
        sampleSize: 0,
        confidence: manualDepth ? 'manual' : 'low',
        reason: 'no_valid_healthy_weeks',
        note: 'All healthy weeks filtered out (depth > 5)',
        source: manualDepth ? 'manual_baseline' : 'default_backup'
      };
      stats.lowConfidence++;
      return;
    }
    
    // Calculate average depth when healthy (using filtered weeks)
    const totalDepth = validHealthyWeeks.reduce((sum, w) => sum + w.depth, 0);
    const avgDepth = totalDepth / validHealthyWeeks.length;
    
    // Round to nearest integer
    let roundedDepth = Math.round(avgDepth);
    
    // SHRINKAGE: For low-sample players, shrink toward manual baseline
    // Uses week-based weight (not snap-based, since we don't have snap data)
    if (manualDepth && validHealthyWeeks.length < 4) {
      const w = validHealthyWeeks.length / 4.0;  // 0-4 weeks → 0.0-1.0 weight
      const shrunkDepth = w * roundedDepth + (1 - w) * manualDepth;
      roundedDepth = Math.round(shrunkDepth);
      
      if (process.env.DEBUG_HAD) {
        console.log(`📉 Shrinkage applied: ${history.name} (${validHealthyWeeks.length} weeks)`);
        console.log(`   Raw HAD: ${roundedDepth}, Manual: ${manualDepth}, Shrunk: ${Math.round(shrunkDepth)}`);
      }
    }
    
    // Determine final depth: manual > shrunk calculated
    const finalDepth = manualDepth || roundedDepth;
    const depthSource = manualDepth ? 'manual_baseline' : 'calculated_had';
    
    // Confidence scoring based on sample size and source
    let confidence;
    if (manualDepth) {
      confidence = 'manual';  // Highest confidence - from your source of truth
      stats.highConfidence++;
    } else if (validHealthyWeeks.length >= 4) {
      confidence = 'high';
      stats.highConfidence++;
    } else if (validHealthyWeeks.length >= 2) {
      confidence = 'medium';
      stats.mediumConfidence++;
    } else {
      confidence = 'low';
      stats.lowConfidence++;
    }
    
    // Get most recent healthy depth
    const mostRecentHealthy = validHealthyWeeks[validHealthyWeeks.length - 1];
    
    // Detect anomalies
    const currentDepth = history.allWeeks[history.allWeeks.length - 1]?.depth;
    const currentStatus = history.allWeeks[history.allWeeks.length - 1]?.status;
    
    // Anomaly: Manual baseline differs from calculated HAD
    if (manualDepth && manualDepth !== roundedDepth && validHealthyWeeks.length >= 2) {
      stats.anomalies.push({
        player: history.name,
        team: history.team,
        position: history.position,
        manual: manualDepth,
        calculated: roundedDepth,
        status: currentStatus,
        reason: `Manual baseline (${manualDepth}) differs from calculated HAD (${roundedDepth})`
      });
    }
    
    // Anomaly: Large depth change while healthy (and no manual override)
    if (!manualDepth && currentStatus === 'active' && Math.abs(currentDepth - roundedDepth) >= 2) {
      stats.anomalies.push({
        player: history.name,
        team: history.team,
        position: history.position,
        had: roundedDepth,
        current: currentDepth,
        status: currentStatus,
        reason: 'Large depth change while healthy - possible trade/benching/promotion'
      });
    }
    
    // Anomaly: Team change detected
    if (history.teamChange) {
      stats.anomalies.push({
        player: history.name,
        team: history.team,
        position: history.position,
        previousTeam: history.previousTeam,
        reason: `⚠️  TEAM CHANGE: ${history.previousTeam} → ${history.team} (HAD reset to new team data)`
      });
    }
    
    // Anomaly: Depth drop with injury (THIS IS THE KEY ONE!)
    if (INJURED_STATUSES.includes(currentStatus) && currentDepth > finalDepth) {
      stats.anomalies.push({
        player: history.name,
        team: history.team,
        position: history.position,
        had: finalDepth,
        current: currentDepth,
        status: currentStatus,
        reason: `⭐ DEPTH DROP DUE TO INJURY - Will use ${depthSource}=${finalDepth} for impact (not current=${currentDepth})`
      });
    }
    
    healthyAverageDepths[playerKey] = {
      team: history.team,
      position: history.position,
      name: history.name,
      healthyAverageDepth: finalDepth,
      rawAverage: parseFloat(avgDepth.toFixed(2)),
      sampleSize: validHealthyWeeks.length,
      totalWeeksAppeared: history.healthyWeeks.length,  // Before filtering
      confidence,
      depthSource,
      manualOverride: manualDepth !== null,
      calculatedHAD: roundedDepth,
      mostRecentHealthyDepth: mostRecentHealthy?.depth,
      mostRecentHealthyWeek: mostRecentHealthy?.week,
      currentDepth: currentDepth,
      currentStatus: currentStatus,
      totalWeeksTracked: history.allWeeks.length,
      teamChange: history.teamChange || false,
      healthyWeeks: validHealthyWeeks,  // Filtered list
      injuredWeeks: history.injuredWeeks
    };
  });
  
  return { healthyAverageDepths, stats };
}

/**
 * Print validation report
 */
function printValidationReport(had, stats) {
  console.log(`${COLORS.bright}${COLORS.cyan}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}            HAD VALIDATION REPORT${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}═══════════════════════════════════════════════════════${COLORS.reset}\n`);
  
  // Summary stats
  console.log(`${COLORS.bright}📊 Summary Statistics:${COLORS.reset}`);
  console.log(`   Total Players: ${Object.keys(had).length}`);
  console.log(`   ${COLORS.green}High Confidence (4+ weeks):${COLORS.reset} ${stats.highConfidence}`);
  console.log(`   ${COLORS.yellow}Medium Confidence (2-3 weeks):${COLORS.reset} ${stats.mediumConfidence}`);
  console.log(`   ${COLORS.red}Low Confidence (1 week):${COLORS.reset} ${stats.lowConfidence}`);
  console.log(`   ${COLORS.red}Never Healthy:${COLORS.reset} ${stats.neverHealthy}`);
  console.log(`   ${COLORS.magenta}Anomalies Detected:${COLORS.reset} ${stats.anomalies.length}\n`);
  
  // High confidence examples
  console.log(`${COLORS.bright}${COLORS.green}✓ High Confidence Players (Sample):${COLORS.reset}`);
  Object.values(had)
    .filter(p => p.confidence === 'high')
    .slice(0, 15)
    .forEach(p => {
      const statusIcon = p.currentStatus === 'out' ? '🚑' : '✓';
      console.log(`   ${statusIcon} ${p.name.padEnd(25)} (${p.team.substring(0, 15).padEnd(15)} ${p.position}): HAD=${p.healthyAverageDepth} Current=${p.currentDepth} (${p.sampleSize} healthy weeks)`);
    });
  
  // Known test cases
  console.log(`\n${COLORS.bright}${COLORS.cyan}🎯 Known Test Cases:${COLORS.reset}`);
  
  const testCases = [
    'Tampa Bay Buccaneers_RB_Bucky Irving',
    'Washington Commanders_QB_Jayden Daniels',
    'Kansas City Chiefs_QB_Patrick Mahomes II',
    'Detroit Lions_RB_Jahmyr Gibbs'
  ];
  
  testCases.forEach(key => {
    const p = had[key];
    if (p) {
      const statusEmoji = p.currentStatus === 'out' ? '🚑 OUT' : 
                         p.currentStatus === 'questionable' ? '⚠️  Q' : '✓ Active';
      const override = p.currentDepth !== p.healthyAverageDepth ? 
        `${COLORS.yellow}→ WILL OVERRIDE${COLORS.reset}` : 
        `${COLORS.green}→ No override needed${COLORS.reset}`;
      
      console.log(`\n   ${p.name} (${p.team})`);
      console.log(`     Status: ${statusEmoji}`);
      console.log(`     HAD: ${p.healthyAverageDepth} (avg: ${p.rawAverage}, ${p.sampleSize} weeks, confidence: ${p.confidence})`);
      console.log(`     Current Depth: ${p.currentDepth}`);
      console.log(`     ${override}`);
    } else {
      console.log(`\n   ${COLORS.red}✗ Not found: ${key}${COLORS.reset}`);
    }
  });
  
  // Anomalies for review
  if (stats.anomalies.length > 0) {
    console.log(`\n${COLORS.bright}${COLORS.magenta}⚠️  Anomalies for Manual Review:${COLORS.reset}`);
    stats.anomalies.slice(0, 20).forEach(a => {
      console.log(`   • ${a.player} (${a.team} ${a.position}): HAD=${a.had}, Current=${a.current}, Status=${a.status}`);
      console.log(`     Reason: ${a.reason}`);
    });
    
    if (stats.anomalies.length > 20) {
      console.log(`   ... and ${stats.anomalies.length - 20} more (see output file)`);
    }
  }
  
  console.log(`\n${COLORS.bright}${COLORS.cyan}═══════════════════════════════════════════════════════${COLORS.reset}\n`);
}

/**
 * Load manual depth baseline (source of truth)
 */
function loadManualBaseline() {
  const baselinePath = path.join(__dirname, '../public/manual-depth-baseline.json');
  
  if (!fs.existsSync(baselinePath)) {
    console.log(`${COLORS.yellow}⚠️  No manual baseline found at ${baselinePath}${COLORS.reset}\n`);
    return null;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    console.log(`${COLORS.green}✓ Loaded manual baseline (source of truth)${COLORS.reset}\n`);
    return data;
  } catch (error) {
    console.error(`${COLORS.red}✗ Error loading manual baseline:${COLORS.reset}`, error.message);
    return null;
  }
}

/**
 * Load injury reports from stored data
 * Expected format: public/history/2025/week{N}/injury-reports.json
 */
function loadWeeklyInjuryReports(weeks) {
  const injuryReportsPath = path.join(__dirname, '../public/history/2025');
  const weeklyInjuries = {};
  
  console.log(`${COLORS.cyan}🏥 Loading injury reports...${COLORS.reset}\n`);
  
  weeks.forEach(week => {
    const reportPath = path.join(injuryReportsPath, week, 'injury-reports.json');
    
    if (!fs.existsSync(reportPath)) {
      // Not an error - injury reports are optional
      if (process.env.DEBUG_HAD) {
        console.log(`${COLORS.yellow}  ⓘ  No injury report for ${week}${COLORS.reset}`);
      }
      return;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      
      // Convert to our expected format: { [team]: [{name, position, status}] }
      const teamInjuries = {};
      
      if (data.teams) {
        // Format 1: {teams: {teamName: {injuries: [...]}}}
        Object.keys(data.teams).forEach(team => {
          const teamData = data.teams[team];
          if (Array.isArray(teamData.injuries)) {
            teamInjuries[team] = teamData.injuries.map(inj => ({
              name: inj.playerName || inj.name,
              position: inj.position || 'UNKNOWN',
              status: inj.status || 'active'
            }));
          } else if (Array.isArray(teamData)) {
            // Format 2: {teams: {teamName: [...]}}
            teamInjuries[team] = teamData.map(inj => ({
              name: inj.playerName || inj.name,
              position: inj.position || 'UNKNOWN',
              status: inj.status || 'active'
            }));
          }
        });
      }
      
      weeklyInjuries[week] = teamInjuries;
      const totalInjuries = Object.values(teamInjuries).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`${COLORS.green}  ✓${COLORS.reset} Loaded ${week}: ${totalInjuries} injuries`);
    } catch (error) {
      console.warn(`${COLORS.yellow}  ⚠️  Error loading ${week} injury report:${COLORS.reset}`, error.message);
    }
  });
  
  const totalWeeks = Object.keys(weeklyInjuries).length;
  if (totalWeeks > 0) {
    console.log(`${COLORS.green}✓ Loaded injury reports for ${totalWeeks} weeks${COLORS.reset}\n`);
  } else {
    console.log(`${COLORS.yellow}⚠️  No injury reports found - using depth-drop inference only${COLORS.reset}\n`);
  }
  
  return weeklyInjuries;
}

/**
 * Main execution
 */
async function main() {
  console.log(`${COLORS.bright}${COLORS.cyan}🏈 Healthy Average Depth (HAD) Calculator${COLORS.reset}\n`);
  
  // Load manual baseline first
  const manualBaseline = loadManualBaseline();
  
  // Load depth charts
  const weeklyDepthCharts = loadWeeklyDepthCharts(WEEKS_TO_ANALYZE);
  
  if (Object.keys(weeklyDepthCharts).length === 0) {
    console.error(`${COLORS.red}✗ No depth charts found!${COLORS.reset}`);
    process.exit(1);
  }
  
  // Load injury reports (optional - falls back to depth-drop inference)
  const weeklyInjuries = loadWeeklyInjuryReports(WEEKS_TO_ANALYZE);
  
  // Calculate HAD
  console.log(`${COLORS.cyan}🧮 Calculating Healthy Average Depth...${COLORS.reset}\n`);
  const { healthyAverageDepths, stats } = calculateHealthyAverageDepth(weeklyDepthCharts, weeklyInjuries, manualBaseline);
  
  // Print validation report
  printValidationReport(healthyAverageDepths, stats);
  
  // Save to file
  const outputPath = path.join(__dirname, '../public/healthy-average-depth.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(healthyAverageDepths, null, 2)
  );
  
  console.log(`${COLORS.green}✓ Saved HAD data to: ${outputPath}${COLORS.reset}`);
  
  // Save anomalies report
  const anomaliesPath = path.join(__dirname, '../public/had-anomalies.json');
  fs.writeFileSync(
    anomaliesPath,
    JSON.stringify({ 
      generatedAt: new Date().toISOString(),
      weeksAnalyzed: WEEKS_TO_ANALYZE,
      stats,
      anomalies: stats.anomalies 
    }, null, 2)
  );
  
  console.log(`${COLORS.green}✓ Saved anomalies report to: ${anomaliesPath}${COLORS.reset}\n`);
  
  console.log(`${COLORS.bright}${COLORS.green}✓ HAD calculation complete!${COLORS.reset}\n`);
}

// Run it
main().catch(error => {
  console.error(`${COLORS.red}✗ Fatal error:${COLORS.reset}`, error);
  process.exit(1);
});
