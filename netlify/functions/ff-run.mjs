/**
 * Fantasy Sit/Start Run Function
 * 
 * Main orchestration endpoint that:
 * 1. Authenticates with Yahoo (auto-refresh tokens if needed)
 * 2. Fetches user's league data, rosters, and scoring rules
 * 3. Fetches game lines and player props from TheOddsAPI
 * 4. Calculates EFP, sit/start scores, tiers, and reasons
 * 5. Suggests FLEX swaps
 * 6. Returns JSON or CSV response
 * 
 * Query Parameters:
 * - season: NFL season year (optional, defaults to current year, e.g., 2025)
 * - week: NFL week number (optional, defaults to current week in selected season)
 * - league: League key (optional, uses first available)
 * - team: Team key (optional, uses first team in league)
 * - format: 'json' or 'csv' (default: json)
 * - explain: 'all' or 'min' (default: all, includes reasons)
 * 
 * Headers:
 * - x-api-key: API key for endpoint protection (optional, if FF_API_KEY env var set)
 * 
 * Example:
 * GET /ff-run?season=2025&week=10&format=json
 * Headers: { "x-api-key": "your-secret-key" }
 */

import { ensureAuth } from './_lib/ff-cookies.mjs';
import { 
  getCurrentGameKey, 
  getUserLeagues, 
  getLeagueSettings, 
  getTeamRoster, 
  getCurrentWeek,
  getLeagueScoreboard
} from './_lib/ff-yahoo.mjs';
import { 
  getWeekLines, 
  getPlayerProps, 
  getGameContext 
} from './_lib/ff-odds.mjs';
import { 
  expectedFantasyPoints, 
  applyMultiTDBonus, 
  calculateSitStartScore, 
  assignTiers, 
  generateReasons, 
  fillLineup,
  fillLineupFromActual,
  tryFlexSwaps 
} from './_lib/ff-scoring.mjs';

export const handler = async (event, context) => {
  try {
    // Optional API key protection
    const requiredApiKey = process.env.FF_API_KEY;
    if (requiredApiKey) {
      const providedKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
      if (providedKey !== requiredApiKey) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Unauthorized',
            message: 'Invalid or missing x-api-key header'
          })
        };
      }
    }

    // Parse query parameters
    const params = event.queryStringParameters || {};
    const requestedSeason = params.season ? parseInt(params.season, 10) : null;
    const requestedWeek = params.week ? parseInt(params.week, 10) : null;
    const requestedLeague = params.league || null;
    const requestedTeam = params.team || null;
    const format = params.format || 'json';
    const explain = params.explain || 'all';

    console.log('FF-Run started with params:', { requestedSeason, requestedWeek, requestedLeague, requestedTeam, format, explain });

    // Step 1: Ensure valid access token from cookies
    const cookieHeader = event.headers.cookie || '';
    const authResult = await ensureAuth(cookieHeader);
    
    if (!authResult) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Authentication required',
          message: 'Please complete OAuth flow at /.netlify/functions/ff-auth-start',
          action: 'Visit auth start endpoint to link Yahoo account'
        })
      };
    }

    const accessToken = authResult.accessToken;
    const updatedCookies = authResult.cookies;
    console.log('Access token validated');

    // Step 2: Get current NFL game key (optionally for specific season)
    const gameKey = await getCurrentGameKey(accessToken, requestedSeason);
    console.log(`Game key: ${gameKey}`);

    // Step 3: Get user's leagues
    const leagues = await getUserLeagues(accessToken, gameKey);
    console.log(`Leagues response:`, JSON.stringify(leagues, null, 2));
    
    if (leagues.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'No leagues found',
          message: `You do not have any fantasy leagues for this season (game key: ${gameKey}). Yahoo returned 0 leagues. This might mean your league hasn't started yet or is for a different season.`,
          debug: {
            gameKey,
            leaguesFound: 0,
            suggestion: 'Try specifying the league key directly using ?league=XXX.l.XXXXX parameter'
          }
        })
      };
    }

    // Use requested league or first available
    const leagueKey = requestedLeague || leagues[0].league_key;
    const league = leagues.find(l => l.league_key === leagueKey) || leagues[0];
    console.log(`Using league: ${league.name} (${leagueKey})`);

    // Step 4: Get league settings (scoring rules + position counts)
    const { scoringRules, positionCounts, pprType } = await getLeagueSettings(accessToken, leagueKey);
    console.log(`Scoring: ${pprType}, passTD=${scoringRules.passTD}`);
    console.log('Position counts:', JSON.stringify(positionCounts));

    // Step 5: Get current week for league
    const currentWeek = await getCurrentWeek(accessToken, leagueKey);
    const week = requestedWeek || currentWeek;
    console.log(`Using week: ${week}`);

    // Step 6: Get team roster (use authenticated user's team from league object)
    const teamKey = requestedTeam || league.team_key; // Use user's team, not team 1!
    console.log(`Using team: ${teamKey} (${league.team_name})`);
    const roster = await getTeamRoster(accessToken, teamKey, week);
    console.log(`Fetched roster: ${roster.length} players`);

    if (roster.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'No roster found',
          message: 'Could not fetch roster for specified team'
        })
      };
    }

    // Step 7: Fetch game lines and player props
    console.log('Fetching game lines and props from TheOddsAPI...');
    const [lines, allProps] = await Promise.all([
      getWeekLines(week),
      getPlayerProps(week)
    ]);
    console.log(`Fetched ${lines.length} game lines, ${Object.keys(allProps).length} player props`);

    // Step 8: Calculate EFP and sit/start scores for each player
    const scoredPlayers = [];

    for (const player of roster) {
      // Get game context for player's team
      const gameContext = getGameContext(lines, player.team);

      // Handle bye weeks or missing games (context is null)
      if (!gameContext) {
        // Bye week or game not scheduled - player scores 0
        console.log(`Player ${player.name} (${player.team}) has no game context (bye week or game not found)`);
        scoredPlayers.push({
          ...player,
          props: {},
          context: null,
          efp: 0,
          ceiling_bonus: 0,
          is_bye_week: true
        });
        continue;
      }

      // Get player props (match by name with fuzzy matching)
      let playerPropsData = allProps[player.name]; // Exact match first
      
      // If no exact match, try fuzzy match (remove suffixes like "Jr.", "II", "III")
      if (!playerPropsData) {
        const normalizedName = player.name.replace(/\s+(Jr\.|Sr\.|II|III|IV)$/i, '').trim();
        playerPropsData = allProps[normalizedName];
        
        // Try even looser match - find any player with same first and last name
        if (!playerPropsData) {
          const [first, ...lastParts] = player.name.split(' ');
          const last = lastParts.join(' ');
          
          for (const [propsName, propsData] of Object.entries(allProps)) {
            if (propsName.includes(first) && propsName.includes(last)) {
              playerPropsData = propsData;
              console.log(`  Fuzzy matched: "${player.name}" → "${propsName}"`);
              break;
            }
          }
        }
      }
      
      const props = playerPropsData?.props || {}; // Extract nested props object
      const hasProps = Object.keys(props).length > 0;

      // Calculate base EFP
      const efp = expectedFantasyPoints(props, scoringRules, player.position, gameContext);
      console.log(`Player ${player.name} (${player.position}, ${player.team}): EFP=${efp.toFixed(1)}, hasProps=${hasProps}`);

      // Add multi-TD ceiling bonus
      const ceilingBonus = applyMultiTDBonus(efp, props, scoringRules, player.position);
      const totalEFP = efp + ceilingBonus;

      // Store for scoring
      scoredPlayers.push({
        ...player,
        props,
        context: gameContext,
        efp: totalEFP,
        ceiling_bonus: ceilingBonus,
        is_bye_week: false
      });
    }

    // Calculate sit/start scores (needs all players for z-score)
    for (const player of scoredPlayers) {
      // Bye week players get score of 0 (unplayable)
      if (player.is_bye_week) {
        player.score = 0;
        player.tier = 'BYE';
        continue;
      }

      player.score = calculateSitStartScore(
        player.efp, 
        player.context, 
        player, 
        scoringRules, 
        scoredPlayers.filter(p => !p.is_bye_week) // Only compare to non-bye players
      );
    }

    // Assign tiers
    const tieredPlayers = assignTiers(scoredPlayers);

    // Generate reasons (if explain=all)
    if (explain === 'all') {
      for (const player of tieredPlayers) {
        player.reasons = generateReasons(player, scoringRules);
      }
    }

    // OPPONENT ANALYSIS: Fetch opponent's roster and calculate their optimal lineup
    let opponentAnalysis = null;
    try {
      console.log(`🔍 Fetching matchup data for week ${week}...`);
      const matchups = await getLeagueScoreboard(accessToken, leagueKey, week);
      console.log(`Found ${matchups.length} total matchups for week ${week}`);
      console.log(`Looking for team_key: ${teamKey}`);
      
      const userMatchup = matchups.find(m => m.team1.team_key === teamKey || m.team2.team_key === teamKey);
      
      if (userMatchup) {
        const opponentTeam = userMatchup.team1.team_key === teamKey ? userMatchup.team2 : userMatchup.team1;
        console.log(`✅ Found opponent: ${opponentTeam.name} (${opponentTeam.team_key})`);
        
        // Fetch opponent's roster
        const opponentRoster = await getTeamRoster(accessToken, opponentTeam.team_key, week);
        console.log(`Fetched opponent roster: ${opponentRoster.length} players`);
        
        // Process opponent's players (same logic as user's roster)
        const opponentScoredPlayers = [];
        for (const player of opponentRoster) {
          const gameContext = await getGameContext(player.team, week, lines);
          
          if (!gameContext || gameContext.is_bye) {
            opponentScoredPlayers.push({ ...player, props: {}, context: null, efp: 0, ceiling_bonus: 0, is_bye_week: true });
            continue;
          }
          
          let playerPropsData = allProps[player.name];
          if (!playerPropsData) {
            const normalizedName = player.name.replace(/\s+(Jr\.|Sr\.|II|III|IV)$/i, '').trim();
            playerPropsData = allProps[normalizedName];
          }
          
          const props = playerPropsData?.props || {};
          const efp = expectedFantasyPoints(props, scoringRules, player.position, gameContext);
          const ceilingBonus = applyMultiTDBonus(efp, props, scoringRules, player.position);
          const totalEFP = efp + ceilingBonus;
          
          opponentScoredPlayers.push({
            ...player,
            props,
            context: gameContext,
            efp: totalEFP,
            ceiling_bonus: ceilingBonus,
            is_bye_week: false
          });
        }
        
        // Calculate sit/start scores for opponent
        for (const player of opponentScoredPlayers) {
          if (player.is_bye_week) {
            player.score = 0;
            player.tier = 'BYE';
            continue;
          }
          player.score = calculateSitStartScore(player.efp, player.context, player, scoringRules, opponentScoredPlayers.filter(p => !p.is_bye_week));
        }
        
        const opponentTieredPlayers = assignTiers(opponentScoredPlayers);
        
        // Calculate opponent's optimal lineup
        const { starters: opponentOptimalStarters } = fillLineup(opponentTieredPlayers, positionCounts);
        const opponentProjected = opponentOptimalStarters.reduce((sum, p) => sum + (p.efp || 0), 0);
        
        opponentAnalysis = {
          team_name: opponentTeam.name,
          team_key: opponentTeam.team_key,
          projected_points: opponentProjected,
          top_players: opponentOptimalStarters
            .sort((a, b) => b.efp - a.efp)
            .slice(0, 3)
            .map(p => ({ name: p.name, position: p.position, projected: p.efp?.toFixed(1) }))
        };
        
        console.log(`Opponent ${opponentTeam.name} projected: ${opponentProjected.toFixed(1)} pts`);
      } else {
        console.log('No matchup found for this week (possible bye week for league)');
      }
    } catch (error) {
      console.error('Error fetching opponent analysis:', error.message);
      // Continue without opponent analysis
    }

    // APPROACH A: Use actual Yahoo lineup (what user set)
    const { starters: actualStarters, bench: actualBench } = fillLineupFromActual(tieredPlayers);

    // APPROACH B: Calculate optimal lineup (best possible)
    const { starters: optimalStarters, bench: optimalBench } = fillLineup(tieredPlayers, positionCounts);

    // Find recommendations: bench players who should be starting
    const recommendations = [];
    for (const benchPlayer of actualBench) {
      // Skip bye week players
      if (benchPlayer.is_bye_week) continue;

      // Find if any starter has lower score at same/FLEX position
      for (const starter of actualStarters) {
        const canSwap = (
          benchPlayer.position === starter.position || 
          starter.slot === 'FLEX' || 
          (benchPlayer.position === 'RB' || benchPlayer.position === 'WR' || benchPlayer.position === 'TE')
        );
        
        if (canSwap && benchPlayer.score > starter.score + 1.0) {
          recommendations.push({
            action: 'START',
            player: benchPlayer.name,
            instead_of: starter.name,
            improvement: `+${(benchPlayer.score - starter.score).toFixed(1)} pts`,
            reason: `${benchPlayer.name} (${benchPlayer.efp} proj) has higher score than ${starter.name} (${starter.efp} proj)`
          });
        }
      }
    }

    // Suggest FLEX swaps for optimal lineup
    const flexOptions = tryFlexSwaps(optimalStarters, optimalBench);

    // Step 9: Format response
    const meta = {
      week,
      league_name: league.name,
      league_key: leagueKey,
      team_key: teamKey,
      scoring: pprType,
      scoring_summary: `passTD=${scoringRules.passTD}, INT=${scoringRules.passInt}, reception=${scoringRules.reception}`,
      generated_at: new Date().toISOString()
    };

    const notes = [];
    if (recommendations.length > 0) {
      notes.push(`⚠️ ${recommendations.length} lineup change(s) recommended - see recommendations`);
    }
    if (flexOptions.length > 0) {
      notes.push(`${flexOptions.length} FLEX swap(s) suggested for optimal lineup - see optimal_flex_options`);
    }
    if (Object.keys(allProps).length === 0) {
      notes.push('Warning: No player props available from TheOddsAPI');
    }

    // Calculate total projected points
    const actualTotal = actualStarters.reduce((sum, p) => sum + (p.efp || 0), 0);
    const optimalTotal = optimalStarters.reduce((sum, p) => sum + (p.efp || 0), 0);
    const improvement = optimalTotal - actualTotal;

    // Calculate win probability if opponent data available
    let matchupPrediction = null;
    if (opponentAnalysis) {
      const pointDiff = optimalTotal - opponentAnalysis.projected_points;
      
      // Win probability based on point differential
      // Using logistic function: P(win) = 1 / (1 + e^(-pointDiff/15))
      // Standard deviation of ~15 points per game in fantasy football
      const winProb = 1 / (1 + Math.exp(-pointDiff / 15));
      
      // Convert to American odds
      let americanOdds;
      if (winProb > 0.5) {
        // Favorite (negative odds): -100 * (prob / (1 - prob))
        americanOdds = Math.round(-100 * (winProb / (1 - winProb)));
      } else {
        // Underdog (positive odds): 100 * ((1 - prob) / prob)
        americanOdds = Math.round(100 * ((1 - winProb) / winProb));
      }
      
      // Format odds with + for positive
      const oddsDisplay = americanOdds > 0 ? `+${americanOdds}` : `${americanOdds}`;
      
      matchupPrediction = {
        opponent: opponentAnalysis.team_name,
        your_projected: optimalTotal.toFixed(1),
        opponent_projected: opponentAnalysis.projected_points.toFixed(1),
        point_differential: pointDiff.toFixed(1),
        win_probability: `${(winProb * 100).toFixed(0)}%`,
        win_probability_decimal: winProb.toFixed(3),
        american_odds: oddsDisplay,
        prediction: winProb > 0.5 ? 'WIN' : 'LOSS',
        confidence: winProb > 0.7 ? 'High' : winProb > 0.55 ? 'Medium' : 'Low',
        opponent_top_threats: opponentAnalysis.top_players
      };
    }

    // JSON response
    if (format === 'json') {
      const response = {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          meta,
          summary: {
            actual_projected: actualTotal.toFixed(1),
            optimal_projected: optimalTotal.toFixed(1),
            potential_improvement: improvement.toFixed(1)
          },
          matchup: matchupPrediction,
          actual_lineup: {
            starters: actualStarters.map(formatPlayer),
            bench: actualBench.map(formatPlayer)
          },
          recommendations,
          optimal_lineup: {
            starters: optimalStarters.map(formatPlayer),
            bench: optimalBench.map(formatPlayer),
            flex_options: flexOptions
          },
          notes
        }, null, 2)
      };
      
      // Add updated cookies if token was refreshed (using multiValueHeaders)
      if (updatedCookies) {
        response.multiValueHeaders = {
          'Set-Cookie': updatedCookies
        };
      }

      return response;
    }

    // CSV response
    if (format === 'csv') {
      const csv = convertToCSV([...starters, ...bench]);
      const response = {
        statusCode: 200,
        headers: { 
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="sitstart-week${week}.csv"`,
          'Cache-Control': 'no-cache'
        },
        body: csv
      };
      
      // Add updated cookies if token was refreshed (using multiValueHeaders)
      if (updatedCookies) {
        response.multiValueHeaders = {
          'Set-Cookie': updatedCookies
        };
      }

      return response;
    }

    // Unknown format
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Invalid format',
        message: 'Format must be "json" or "csv"'
      })
    };

  } catch (error) {
    console.error('FF-Run error:', error.message);
    console.error(error.stack);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        details: error.stack
      })
    };
  }
};

/**
 * Format player object for JSON response (strip internal props)
 */
function formatPlayer(player) {
  return {
    name: player.name,
    position: player.position,
    team: player.team,
    slot: player.slot,
    opponent: player.context ? (player.team === player.context.home_team ? player.context.away_team : player.context.home_team) : null,
    efp: parseFloat(player.efp.toFixed(1)),
    score: parseFloat(player.score.toFixed(1)),
    tier: player.tier,
    status: player.status,
    bye_week: player.bye_week,
    reasons: player.reasons || []
  };
}

/**
 * Convert players to CSV format
 */
function convertToCSV(players) {
  const headers = [
    'Name', 'Position', 'Team', 'Slot', 'Opponent', 
    'EFP', 'Score', 'Tier', 'Status', 'Bye'
  ];

  const rows = players.map(p => {
    const opp = p.context ? (p.team === p.context.home_team ? p.context.away_team : p.context.home_team) : '';
    return [
      p.name,
      p.position,
      p.team,
      p.slot,
      opp,
      p.efp.toFixed(1),
      p.score.toFixed(1),
      p.tier,
      p.status || '',
      p.bye_week || ''
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
