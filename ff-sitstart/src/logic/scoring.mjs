import { logger } from '../util/logger.mjs';
import { getCurrentGameKey, getUserLeagues, getLeagueSettings, getLeagueTeams, getTeamRoster, getCurrentWeek, logScoringSummary } from '../yahoo/client.mjs';
import { getWeekLines, getPlayerProps } from '../odds/theoddsapi.mjs';
import { impliedFromSpreadTotal, calculateScriptLean } from '../odds/convert.mjs';
import { expectedFantasyPoints, applyMultiTDBonus, calculateDSTPoints } from '../props/expected.mjs';
import { CONFIG } from '../config.mjs';
import { normalizePlayerName } from '../util/names.mjs';

/**
 * Main orchestration for sit/start analysis
 */
export async function runSitStart(options) {
  const { week, league: leagueFilter, team: teamFilter, json, csv, out, explain } = options;
  
  logger.info('🏈 Starting sit/start analysis...\n');
  logger.info('📡 Fetching Yahoo Fantasy data...');
  
  // 1. Get Yahoo data
  const gameKey = await getCurrentGameKey();
  const leagues = await getUserLeagues(gameKey);
  
  // Filter leagues if specified
  const targetLeagues = leagueFilter
    ? leagues.filter(l => l.name.toLowerCase().includes(leagueFilter.toLowerCase()))
    : leagues;
  
  if (targetLeagues.length === 0) {
    throw new Error(`No leagues found matching: ${leagueFilter}`);
  }
  
  logger.success(`✓ Found ${targetLeagues.length} league(s)\n`);
  
  // Determine week if not specified
  const targetWeek = week || (targetLeagues.length > 0 ? targetLeagues[0].currentWeek : 1);
  
  // 2. Get odds data (lines + props)
  logger.info('📊 Fetching odds data...');
  const lines = await getWeekLines(targetWeek);
  const propsMap = await getPlayerProps(targetWeek);
  
  // Build game context (implied totals, script leans)
  const gameContext = {};
  for (const game of lines) {
    const implied = impliedFromSpreadTotal({
      total: game.total,
      spread: game.spread,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam
    });
    
    const homeScript = calculateScriptLean(implied, game.homeTeam, CONFIG.scriptThresholds.favoriteBy);
    const awayScript = calculateScriptLean(implied, game.awayTeam, CONFIG.scriptThresholds.underdogBy);
    
    gameContext[game.homeTeam] = {
      opponent: game.awayTeam,
      impliedTotal: implied.homeIT,
      opponentIT: implied.awayIT,
      ...homeScript,
      spread: game.spread,
      total: game.total
    };
    
    gameContext[game.awayTeam] = {
      opponent: game.homeTeam,
      impliedTotal: implied.awayIT,
      opponentIT: implied.homeIT,
      ...awayScript,
      spread: -game.spread,
      total: game.total
    };
  }
  
  logger.success(`✓ Loaded ${lines.length} games with props\n`);
  
  // 3. Process each league
  for (const league of targetLeagues) {
    logger.info(`🏈 League: ${league.name}\n`);
    
    // Get scoring rules
    const settings = await getLeagueSettings(league.key);
    const scoringRules = settings.scoringRules;
    
    // Log scoring summary
    logScoringSummary(scoringRules);
    
    // Get teams
    const teams = await getLeagueTeams(league.key);
    const myTeams = teams.filter(t => t.isOwnedByCurrentUser);
    
    // Filter teams if specified
    const targetTeams = teamFilter
      ? myTeams.filter(t => t.name.toLowerCase().includes(teamFilter.toLowerCase()))
      : myTeams;
    
    if (targetTeams.length === 0) {
      logger.warn(`  No teams found matching: ${teamFilter}`);
      continue;
    }
    
    // 4. Process each team
    for (const team of targetTeams) {
      logger.info(`\n  Team: ${team.name}`);
      
      // Get roster
      const roster = await getTeamRoster(team.key, targetWeek);
      logger.success(`  ✓ ${roster.length} players on roster\n`);
      
      // 5. Score each player
      const scoredPlayers = [];
      const notes = [];
      let propsFoundCount = 0;
      
      for (const player of roster) {
        // Skip if on bye or out
        if (player.is_on_bye) {
          scoredPlayers.push({
            ...player,
            efp: 0,
            efpComponents: [],
            score: -999,
            tier: 'BYE',
            reasons: ['BYE week']
          });
          continue;
        }
        
        if (['O', 'IR', 'PUP', 'SUSP'].includes(player.status)) {
          scoredPlayers.push({
            ...player,
            efp: 0,
            efpComponents: [],
            score: -999,
            tier: 'OUT',
            reasons: [`${player.status} - Not playing`]
          });
          continue;
        }
        
        // Get player props (fuzzy match by name)
        const normalizedName = normalizePlayerName(player.full_name);
        let playerProps = null;
        
        for (const [key, propsData] of Object.entries(propsMap)) {
          const propsPlayerName = normalizePlayerName(propsData.name);
          if (propsPlayerName === normalizedName || key.includes(normalizedName)) {
            playerProps = propsData.props;
            propsFoundCount++;
            break;
          }
        }
        
        if (!playerProps) {
          notes.push(`No props found for ${player.full_name} (${player.team_abbr})`);
        }
        
        // Get game context for player's team
        const context = gameContext[player.team_abbr] || {
          impliedTotal: 21,
          opponentIT: 21,
          passLean: 0,
          runLean: 0,
          isFavorite: false,
          favoriteBy: 0
        };
        
        const position = player.positions[0];
        
        // Calculate EFP
        const efpResult = expectedFantasyPoints(playerProps || {}, scoringRules, position, context);
        
        // Apply 2+ TD ceiling bonus
        const anytimeTDProb = playerProps?.anytime_td_prob || 0;
        const efpWithBonus = applyMultiTDBonus(efpResult.efp, anytimeTDProb, scoringRules, position);
        
        // Calculate final score
        const score = calculateSitStartScore(efpWithBonus, context, player, scoringRules);
        
        scoredPlayers.push({
          ...player,
          efp: efpWithBonus,
          efpComponents: efpResult.components,
          missingProps: efpResult.missing,
          score,
          tier: null, // Will be assigned later
          reasons: [], // Will be generated later
          context
        });
      }
      
      logger.info(`  Props found: ${propsFoundCount}/${roster.length} (${Math.round(propsFoundCount / roster.length * 100)}%)\n`);
      
      // 6. Assign tiers within position
      assignTiers(scoredPlayers);
      
      // 7. Generate reasons
      for (const player of scoredPlayers) {
        if (!player.reasons || player.reasons.length === 0) {
          player.reasons = generateReasons(player, scoringRules);
        }
      }
      
      // 8. Sort by score (descending)
      scoredPlayers.sort((a, b) => b.score - a.score);
      
      // 9. Fill lineup (starters vs bench)
      const { starters, bench, flexOptions } = fillLineup(scoredPlayers, settings.positionCounts);
      
      // 10. Try swap pass for FLEX optimization
      const swaps = tryFlexSwaps(starters, bench);
      if (swaps.length > 0) {
        logger.info(`  💡 ${swaps.length} FLEX swap(s) suggested\n`);
      }
      
      // 11. Render outputs
      const { renderCLI } = await import('../ui/render_cli.mjs');
      renderCLI({
        league: settings,
        team,
        starters,
        bench,
        flexOptions,
        swaps,
        scoringRules,
        week: targetWeek,
        explain: explain || 'min'
      });
      
      if (json || csv) {
        const { writeOutputs } = await import('../ui/render_json_csv.mjs');
        await writeOutputs(
          { 
            league: settings, 
            team, 
            week: targetWeek, 
            scoringRules, 
            starters, 
            bench, 
            flexOptions,
            swaps,
            notes 
          },
          { json, csv, out: out || './out' }
        );
      }
    }
  }
  
  logger.success('\n✅ Analysis complete!\n');
}

/**
 * Calculate sit/start score with context modifiers
 */
function calculateSitStartScore(efp, context, player, scoringRules) {
  // Hard exclude if BYE or OUT
  if (player.is_on_bye || ['O', 'IR', 'PUP', 'SUSP'].includes(player.status)) {
    return -999;
  }
  
  const position = player.positions[0];
  
  // Start with base EFP
  let score = efp || 0;
  
  // Apply context modifiers
  const scriptBonus = calculateScriptBonus(position, context);
  const itBonus = calculateITBonus(context.impliedTotal);
  const injuryPenalty = CONFIG.injuryPenalties[player.status] || 0;
  
  score += CONFIG.weights.script * scriptBonus;
  score += CONFIG.weights.impliedTotal * itBonus;
  score += CONFIG.weights.injury * injuryPenalty;
  
  return Math.round(score * 100) / 100;
}

/**
 * Calculate script bonus (run-heavy vs pass-heavy game script)
 */
function calculateScriptBonus(position, context) {
  const runLean = context.runLean || 0;
  const passLean = context.passLean || 0;
  const isFavorite = context.isFavorite || false;
  const favoriteBy = context.favoriteBy || 0;
  
  switch (position) {
    case 'RB':
      // RBs benefit from run-heavy script (favorite by 4.5+)
      return runLean * 0.6;
      
    case 'WR':
    case 'TE':
      // WRs/TEs benefit from pass-heavy script (underdog by 4.5+)
      return passLean * 0.6;
      
    case 'QB':
      // QBs benefit slightly from being favorite (more pass attempts)
      return isFavorite ? favoriteBy * 0.4 : 0;
      
    default:
      return 0;
  }
}

/**
 * Calculate implied total bonus (scaled)
 */
function calculateITBonus(impliedTotal) {
  // Scale IT: baseline 21, +1 bonus per 7 points above
  const baseline = 21;
  return (impliedTotal - baseline) / 7;
}

/**
 * Assign tiers (S/A/B/C/D) within position groups
 */
function assignTiers(players) {
  // Group by position
  const byPosition = {};
  for (const player of players) {
    if (player.tier === 'BYE' || player.tier === 'OUT') continue;
    
    const pos = player.positions[0];
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(player);
  }
  
  // Calculate z-scores within each position
  for (const [pos, group] of Object.entries(byPosition)) {
    if (group.length === 0) continue;
    
    const scores = group.map(p => p.score);
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance) || 1;
    
    for (const player of group) {
      const z = (player.score - mean) / stdDev;
      
      // Assign tier based on z-score
      if (z >= CONFIG.tiers.S) {
        player.tier = 'S';
      } else if (z >= CONFIG.tiers.A) {
        player.tier = 'A';
      } else if (z >= CONFIG.tiers.B) {
        player.tier = 'B';
      } else if (z >= CONFIG.tiers.C) {
        player.tier = 'C';
      } else {
        player.tier = 'D';
      }
      
      player.zScore = Math.round(z * 100) / 100;
    }
  }
}

/**
 * Generate reasons for player recommendation
 */
function generateReasons(player, scoringRules) {
  const reasons = [];
  
  // Skip if BYE or OUT (already has reason)
  if (player.tier === 'BYE' || player.tier === 'OUT') {
    return player.reasons || [];
  }
  
  const context = player.context || {};
  
  // Add EFP info
  if (player.efp > 0) {
    const components = player.efpComponents || [];
    if (components.length > 0) {
      reasons.push(`+ Props: ${components.slice(0, 2).join(', ')}`);
    } else {
      reasons.push(`+ EFP ${player.efp.toFixed(1)}`);
    }
  }
  
  // Add team implied total
  if (context.impliedTotal > 26) {
    reasons.push(`+ High team IT: ${context.impliedTotal.toFixed(1)}`);
  } else if (context.impliedTotal < 19) {
    reasons.push(`− Low team IT: ${context.impliedTotal.toFixed(1)}`);
  }
  
  // Add script lean
  const position = player.positions[0];
  if ((position === 'RB' && context.runLean > 0) || 
      (['WR', 'TE'].includes(position) && context.passLean > 0)) {
    const leanType = position === 'RB' ? 'run' : 'pass';
    reasons.push(`+ Game script (${leanType}-lean)`);
  }
  
  // Add injury status
  if (player.status === 'Q') {
    reasons.push(`− Q tag (limited practice)`);
  } else if (player.status === 'D') {
    reasons.push(`− D tag (doubtful to play)`);
  }
  
  // Add missing props warning
  if (player.missingProps && player.missingProps.length > 0) {
    reasons.push(`− Missing props: ${player.missingProps.join(', ')}`);
  }
  
  // Limit to top 3-4 reasons
  return reasons.slice(0, 4);
}

/**
 * Fill lineup (starters vs bench) based on roster position counts
 */
function fillLineup(scoredPlayers, positionCounts) {
  const starters = [];
  const bench = [];
  const filled = {};
  
  // Initialize filled counts
  for (const pos in positionCounts) {
    filled[pos] = 0;
  }
  
  // First pass: fill required positions
  for (const player of scoredPlayers) {
    if (player.slot === 'BN' || player.tier === 'BYE' || player.tier === 'OUT') {
      bench.push(player);
      continue;
    }
    
    const pos = player.positions[0];
    const required = positionCounts[pos] || 0;
    
    if (filled[pos] < required) {
      starters.push({ ...player, slot: pos });
      filled[pos]++;
    } else {
      // Check FLEX eligibility
      const flexRequired = positionCounts['FLEX'] || 0;
      if (['RB', 'WR', 'TE'].includes(pos) && filled['FLEX'] < flexRequired) {
        starters.push({ ...player, slot: 'FLEX' });
        filled['FLEX']++;
      } else {
        bench.push(player);
      }
    }
  }
  
  // Calculate flex options (bench players who could slot into FLEX)
  const flexOptions = bench
    .filter(p => ['RB', 'WR', 'TE'].includes(p.positions[0]))
    .slice(0, 5);
  
  return { starters, bench, flexOptions };
}

/**
 * Try FLEX swaps to optimize lineup
 */
function tryFlexSwaps(starters, bench) {
  const swaps = [];
  
  // Find current FLEX starter(s)
  const flexStarters = starters.filter(p => p.slot === 'FLEX');
  
  // Find bench players eligible for FLEX
  const flexBench = bench.filter(p => ['RB', 'WR', 'TE'].includes(p.positions[0]));
  
  // Check if any bench player scores higher than current FLEX
  for (const flexStarter of flexStarters) {
    for (const benchPlayer of flexBench) {
      if (benchPlayer.score > flexStarter.score + 1.0) { // 1.0 point threshold
        swaps.push({
          out: flexStarter.full_name,
          in: benchPlayer.full_name,
          scoreDiff: Math.round((benchPlayer.score - flexStarter.score) * 10) / 10,
          reason: `${benchPlayer.full_name} scores ${(benchPlayer.score - flexStarter.score).toFixed(1)} pts higher`
        });
      }
    }
  }
  
  return swaps.slice(0, 3); // Limit to top 3 swaps
}
