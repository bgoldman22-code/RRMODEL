import { logger } from '../util/logger.mjs';
import { getYahooClient } from '../yahoo/client.mjs';
import { getOddsData } from '../odds/theoddsapi.mjs';
import { convertLinesToContext } from '../odds/convert.mjs';
import { calculateEFP } from '../props/expected.mjs';
import { assignTiers } from './tiers.mjs';
import { generateReasons } from './explain.mjs';
import { renderCLI } from '../ui/render_cli.mjs';
import { writeOutputs } from '../ui/render_json_csv.mjs';

export async function runSitStart(options) {
  const { week, league: leagueFilter, team: teamFilter, json, csv, out } = options;
  
  logger.info('📡 Fetching Yahoo Fantasy data...');
  
  // 1. Get Yahoo data
  const yahoo = getYahooClient();
  const gameKey = await yahoo.getCurrentGameKey();
  const leagues = await yahoo.getUserLeagues(gameKey);
  
  // Filter leagues if specified
  const targetLeagues = leagueFilter
    ? leagues.filter(l => l.name.toLowerCase().includes(leagueFilter.toLowerCase()))
    : leagues;
  
  if (targetLeagues.length === 0) {
    throw new Error(`No leagues found matching: ${leagueFilter}`);
  }
  
  logger.info(`✓ Found ${targetLeagues.length} league(s)\n`);
  
  // 2. Get odds data (lines + props)
  logger.info('📊 Fetching odds data...');
  const oddsData = await getOddsData(week);
  const gameContext = convertLinesToContext(oddsData.lines);
  logger.info(`✓ Loaded ${oddsData.lines.length} games with props\n`);
  
  // 3. Process each league
  for (const league of targetLeagues) {
    logger.info(`\n🏈 League: ${league.name}`);
    
    // Get scoring rules
    const scoringRules = await yahoo.getLeagueSettings(league.key);
    logger.debug('Scoring:', JSON.stringify(scoringRules, null, 2));
    
    // Get teams
    const teams = await yahoo.getLeagueTeams(league.key);
    const myTeams = teams.filter(t => t.isManaged);
    
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
      const roster = await yahoo.getTeamRoster(team.key, week);
      logger.info(`  ✓ ${roster.length} players on roster\n`);
      
      // 5. Score each player
      const scoredPlayers = [];
      const notes = [];
      
      for (const player of roster) {
        // Skip if on bye or out
        if (player.is_on_bye) {
          scoredPlayers.push({
            ...player,
            efp: 0,
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
            score: -999,
            tier: 'OUT',
            reasons: [`${player.status} - Not playing`]
          });
          continue;
        }
        
        // Get player props
        const playerProps = oddsData.props.find(p => 
          p.player_name === player.full_name && p.team === player.team_abbr
        );
        
        if (!playerProps) {
          notes.push(`No props found for ${player.full_name} (${player.team_abbr})`);
        }
        
        // Get game context for player's team
        const context = gameContext[player.team_abbr] || {};
        
        // Calculate EFP
        const efp = calculateEFP(playerProps, scoringRules, player.positions[0]);
        
        // Calculate final score (TODO: implement full logic)
        const score = calculateSitStartScore(efp, context, player, scoringRules);
        
        scoredPlayers.push({
          ...player,
          efp,
          score,
          tier: null, // Will be assigned later
          reasons: [] // Will be generated later
        });
      }
      
      // 6. Assign tiers and generate reasons
      assignTiers(scoredPlayers);
      
      for (const player of scoredPlayers) {
        if (!player.reasons || player.reasons.length === 0) {
          player.reasons = generateReasons(player, gameContext[player.team_abbr], scoringRules);
        }
      }
      
      // 7. Sort by score
      scoredPlayers.sort((a, b) => b.score - a.score);
      
      // 8. Fill lineup (starters vs bench)
      const { starters, bench, flexOptions } = fillLineup(scoredPlayers, league.rosterPositions);
      
      // 9. Render outputs
      renderCLI(league, team, starters, bench, flexOptions, scoringRules);
      
      if (json || csv) {
        await writeOutputs(
          { league, team, week, scoringRules, starters, bench, flexOptions, notes },
          { json, csv, out }
        );
      }
    }
  }
}

function calculateSitStartScore(efp, context, player, scoringRules) {
  // TODO: Implement full scoring logic
  // For now, just return EFP
  return efp || 0;
}

function fillLineup(scoredPlayers, rosterPositions) {
  // TODO: Implement lineup filling logic
  // For now, simple split
  const starters = scoredPlayers.slice(0, 9);
  const bench = scoredPlayers.slice(9);
  
  return {
    starters,
    bench,
    flexOptions: []
  };
}
