/**
 * Fantasy Football Weekly League Roast Generator
 * 
 * Generates hilarious, rated-R power rankings and weekly summaries
 * using Yahoo Fantasy API data + Claude AI for savage commentary.
 * 
 * Analyzes:
 * - Matchup results (wins/losses, blowouts)
 * - Starter vs bench performance (left points on bench)
 * - Waiver wire moves (good pickups vs fails)
 * - Injury mismanagement (starting OUT players)
 * - Projected vs actual performance
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  validateToken, 
  getCurrentGameKey, 
  getUserLeagues,
  getCurrentWeek,
  getLeagueScoreboard,
  getLeagueStandings,
  getLeagueTransactions,
  getTeamRoster
} from './_lib/ff-yahoo.mjs';

export default async function handler(request, context) {
  console.log('FF-Weekly-Roast started');

  try {
    const params = new URL(request.url).searchParams;
    const requestedWeek = params.get('week') ? parseInt(params.get('week'), 10) : null;
    const requestedLeague = params.get('league');

    // Step 1: Validate OAuth token
    const accessToken = await validateToken();
    console.log('Access token validated');

    // Step 2: Get current game key (2025 season)
    const gameKey = await getCurrentGameKey(accessToken);
    console.log(`Game key: ${gameKey}`);

    // Step 3: Get user's leagues
    const leagues = await getUserLeagues(accessToken, gameKey);
    if (leagues.length === 0) {
      return new Response(JSON.stringify({ error: 'No leagues found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const leagueKey = requestedLeague || leagues[0].league_key;
    const league = leagues.find(l => l.league_key === leagueKey) || leagues[0];
    console.log(`Using league: ${league.name} (${leagueKey})`);

    // Step 4: Get current week
    const currentWeek = await getCurrentWeek(accessToken, leagueKey);
    const week = requestedWeek || currentWeek;
    console.log(`Using week: ${week}`);

    // Step 5: Fetch all league data
    console.log('Fetching league data...');
    const [scoreboard, standings, transactions] = await Promise.all([
      getLeagueScoreboard(accessToken, leagueKey, week),
      getLeagueStandings(accessToken, leagueKey),
      getLeagueTransactions(accessToken, leagueKey, week)
    ]);

    // Step 6: Fetch roster details for each team
    console.log('Fetching team rosters...');
    const teamDetails = [];
    
    for (const matchup of scoreboard) {
      for (const team of [matchup.team1, matchup.team2]) {
        const roster = await getTeamRoster(accessToken, team.team_key, week);
        const standing = standings.find(s => s.team_key === team.team_key);
        const teamTransactions = transactions.filter(t => t.team_key === team.team_key);

        // Calculate bench points
        const starters = roster.filter(p => p.slot !== 'BN' && p.slot !== 'IR');
        const bench = roster.filter(p => p.slot === 'BN' || p.slot === 'IR');
        
        // For now, use placeholder points (will be filled with actual when available)
        const benchPoints = 0; // TODO: Add actual points when available
        
        teamDetails.push({
          ...team,
          record: `${standing?.wins || 0}-${standing?.losses || 0}`,
          rank: standing?.rank || 0,
          starters: starters.map(p => ({
            name: p.name,
            position: p.position,
            team: p.team,
            status: p.status,
            points: 0, // Placeholder
            projected: 0 // Placeholder
          })),
          bench: bench.map(p => ({
            name: p.name,
            position: p.position,
            team: p.team,
            status: p.status,
            points: 0, // Placeholder
            projected: 0 // Placeholder
          })),
          transactions: teamTransactions.map(t => ({
            type: t.type,
            players: t.players.map(p => `${p.type}: ${p.name}`).join(', ')
          })),
          benchPoints,
          biggestMistake: 'TBD' // Will be calculated
        });
      }
    }

    // Step 7: Generate AI roast
    console.log('Generating AI roast...');
    const roast = await generateRoast(league.name, week, teamDetails, scoreboard);

    // Step 8: Return results
    return new Response(JSON.stringify({
      success: true,
      league: {
        name: league.name,
        key: leagueKey
      },
      week,
      roast,
      teams: teamDetails,
      matchups: scoreboard
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in FF-Weekly-Roast:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Generate AI-powered roast using Claude
 */
async function generateRoast(leagueName, week, teams, matchups) {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Sort teams by rank
    const sortedTeams = [...teams].sort((a, b) => a.rank - b.rank);

    const prompt = `You are a savage, hilarious fantasy football analyst writing BRUTAL weekly power rankings for the "${leagueName}" league.

Week ${week} is complete. Write rated-R, profanity-laced power rankings with the following style:
- Be RUTHLESS but funny
- Roast bad performances viciously
- Celebrate domination with hype
- Call out left bench points as ultimate failures
- Mock waiver wire disasters
- Reference NFL memes and current events
- Use emojis liberally
- Create rivalries and storylines
- Rate team names for creativity

MATCHUP RESULTS:
${matchups.map(m => `${m.team1.name} (${m.team1.points} pts) vs ${m.team2.name} (${m.team2.points} pts) - Winner: ${m.winner === m.team1.team_key ? m.team1.name : m.team2.name}`).join('\n')}

TEAM DATA (sorted by standings):
${sortedTeams.map((t, i) => `
${i + 1}. ${t.name} (${t.record}) - Rank: ${t.rank}
   Points this week: ${t.points} (projected: ${t.projected})
   Season total: ${t.points_for || 'N/A'}
   
   STARTERS (${t.starters.length}):
   ${t.starters.slice(0, 5).map(p => `   • ${p.name} (${p.position}, ${p.team})${p.status ? ` [${p.status}]` : ''}`).join('\n')}
   
   BENCH (${t.bench.length}):
   ${t.bench.slice(0, 3).map(p => `   • ${p.name} (${p.position}, ${p.team})${p.status ? ` [${p.status}]` : ''}`).join('\n')}
   
   TRANSACTIONS:
   ${t.transactions.length > 0 ? t.transactions.map(tx => `   • ${tx.players}`).join('\n') : '   None this week'}
`).join('\n')}

Write power rankings with:
1. Overall league narrative (who's dominating, who's tanking)
2. Individual team breakdowns (top 3 and bottom 3)
3. "Roast of the Week" - single most embarrassing moment
4. "Play of the Week" - best performance

Format in HTML with <h1>, <h2>, <p> tags. Make it SAVAGE. 🔥`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    return message.content[0].text;

  } catch (error) {
    console.error('Error generating roast:', error);
    return `<h1>Error Generating Roast</h1><p>The roast generator encountered an error: ${error.message}</p>`;
  }
}
