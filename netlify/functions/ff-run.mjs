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

import { ensureAuth } from './_lib/ff-blobs.mjs';
import { 
  getCurrentGameKey, 
  getUserLeagues, 
  getLeagueSettings, 
  getTeamRoster, 
  getCurrentWeek 
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

    // Step 1: Ensure valid access token
    const accessToken = await ensureAuth();
    if (!accessToken) {
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

    // Step 5: Get current week for league
    const currentWeek = await getCurrentWeek(accessToken, leagueKey);
    const week = requestedWeek || currentWeek;
    console.log(`Using week: ${week}`);

    // Step 6: Get team roster
    const teamKey = requestedTeam || `${leagueKey}.t.1`; // Default to team 1 if not specified
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

      // Get player props (match by name)
      const props = allProps[player.name] || {};
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

    // Fill lineup (starters vs bench)
    const { starters, bench } = fillLineup(tieredPlayers, positionCounts);

    // Suggest FLEX swaps
    const flexOptions = tryFlexSwaps(starters, bench);

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
    if (flexOptions.length > 0) {
      notes.push(`${flexOptions.length} FLEX swap(s) suggested - see flex_options`);
    }
    if (Object.keys(allProps).length === 0) {
      notes.push('Warning: No player props available from TheOddsAPI');
    }

    // JSON response
    if (format === 'json') {
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          meta,
          starters: starters.map(formatPlayer),
          bench: bench.map(formatPlayer),
          flex_options: flexOptions,
          notes
        }, null, 2)
      };
    }

    // CSV response
    if (format === 'csv') {
      const csv = convertToCSV([...starters, ...bench]);
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="sitstart-week${week}.csv"`,
          'Cache-Control': 'no-cache'
        },
        body: csv
      };
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
