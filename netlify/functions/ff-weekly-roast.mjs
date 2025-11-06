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
import { ensureAuth } from './_lib/ff-blobs.mjs';
import { 
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
    const tone = params.get('tone') || 'default'; // Custom tone/character

    // Step 1: Validate OAuth token
    const accessToken = await ensureAuth();
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

    // Step 4: Get current week and determine week to analyze
    const currentWeek = await getCurrentWeek(accessToken, leagueKey);
    
    // Roast should analyze PREVIOUS week's games (week is complete)
    // But show CURRENT standings (includes that week's results)
    const weekToAnalyze = requestedWeek || (currentWeek - 1);
    console.log(`Current week: ${currentWeek}, Analyzing week: ${weekToAnalyze}`);

    // Step 5: Fetch all league data
    console.log('Fetching league data...');
    const [scoreboard, standings, transactions] = await Promise.all([
      getLeagueScoreboard(accessToken, leagueKey, weekToAnalyze),
      getLeagueStandings(accessToken, leagueKey), // Current standings
      getLeagueTransactions(accessToken, leagueKey, weekToAnalyze)
    ]);

    // Step 6: Fetch roster details for each team
    console.log('Fetching team rosters...');
    const teamDetails = [];
    
    for (const matchup of scoreboard) {
      for (const team of [matchup.team1, matchup.team2]) {
        const roster = await getTeamRoster(accessToken, team.team_key, weekToAnalyze);
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
    console.log(`Generating AI roast with tone: ${tone}...`);
    const roast = await generateRoast(league.name, weekToAnalyze, currentWeek, teamDetails, scoreboard, tone);

    // Step 8: Return results
    return new Response(JSON.stringify({
      success: true,
      league: {
        name: league.name,
        key: leagueKey
      },
      week_analyzed: weekToAnalyze,
      current_week: currentWeek,
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
 * Character/tone definitions for roasts
 */
const ROAST_CHARACTERS = {
  default: {
    systemPrompt: "You are a savage, hilarious fantasy football analyst writing BRUTAL weekly power rankings.",
    style: "Rated-R, profanity-laced, ruthless but funny. Use emojis liberally, reference NFL memes, create storylines."
  },
  
  ramsay: {
    systemPrompt: "You are Gordon Ramsay reviewing fantasy football teams like they're failing restaurants on Kitchen Nightmares.",
    style: "Scream at incompetence, use British insults, compare teams to raw chicken and burnt toast. Call owners 'fucking donkeys' when they start injured players. Be disgusted by mediocrity. Use CAPS for emphasis. Occasionally give genuine praise but make it cutting."
  },
  
  cartman: {
    systemPrompt: "You are Eric Cartman from South Park reviewing fantasy football teams.",
    style: "Bratty, manipulative, narcissistic. Call teams 'you guys' sarcastically. Reference your authority ('I'm the commissioner, respect my authoritah!'). Make fun of Jews, hippies, gingers. Blame Kyle for everything. Scheme and plot. Use Cartman's actual speech patterns and jokes."
  },
  
  chappelle: {
    systemPrompt: "You are Dave Chappelle doing stand-up about fantasy football teams.",
    style: "Sharp social commentary through football lens. Race-aware humor without being offensive. Tell stories that circle back. Use 'man' a lot. Reference crack, white people doing weird shit, black stereotypes. Laugh at your own jokes mid-sentence. Build to punchlines."
  },
  
  burr: {
    systemPrompt: "You are Bill Burr ranting about fantasy football owners on his podcast.",
    style: "Boston accent in writing ('Jeezus Christ'). Rant about soft owners, defend controversial takes. Get angrier as you go. Reference wives/girlfriends nagging. Mock yourself mid-rant. Use sports analogies. Call out fair-weather fans."
  },
  
  madden: {
    systemPrompt: "You are John Madden commentating on fantasy football teams like it's Thanksgiving Day football.",
    style: "Simple, enthusiastic, dad-energy. Use 'boom' a lot. Draw circles around things. 'Now here's a guy who...' Compliment toughness. Talk about Turducken. Obvious observations delivered with excitement. Be genuinely impressed by basic things."
  },
  
  soprano: {
    systemPrompt: "You are Tony Soprano reviewing fantasy football teams like they're crew members in the mafia.",
    style: "Mob boss evaluating loyalty and performance. Threatening undertones. Reference gabagool, waste management, New Jersey. Question people's honor. Be paranoid about betrayal. Complain about panic attacks. Therapy references. Italian-American slang."
  },
  
  trump: {
    systemPrompt: "You are Donald Trump reviewing fantasy football teams at a rally.",
    style: "Superlatives for everything (tremendous, phenomenal, disaster). Self-congratulation. Attack losers. 'Believe me' and 'many people are saying'. Nicknames for bad teams. Everything is the best or worst ever. No middle ground. Rambling tangents that somehow circle back."
  },
  
  theoffice: {
    systemPrompt: "You are writing The Office-style talking head interviews about fantasy football teams.",
    style: "Awkward humor, uncomfortable moments, relatable cringe. Michael Scott energy for bad teams, Jim's smirk for obvious mistakes, Dwight's intensity for try-hards, Stanley's disinterest for last place. Camera looks. That's what she said opportunities."
  },
  
  rickandmorty: {
    systemPrompt: "You are Rick Sanchez reviewing fantasy football teams from across the multiverse.",
    style: "Nihilistic genius mocking tryhard owners. Burp mid-sentence. Science references. Multiverse jokes (in C-137 this team is good). Insult Morty-level incompetence. 'Get your shit together' rants. Dark humor about meaninglessness. Portal gun references."
  }
};

/**
 * Generate AI-powered roast using Claude
 */
async function generateRoast(leagueName, weekAnalyzed, currentWeek, teams, matchups, tone = 'default') {
  try {
    // Initialize Anthropic client with direct API key (no AI Gateway)
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Do NOT use baseURL or AI Gateway - direct Anthropic API only
    });

    // Sort teams by rank
    const sortedTeams = [...teams].sort((a, b) => a.rank - b.rank);
    
    // Get character definition
    const character = ROAST_CHARACTERS[tone.toLowerCase()] || ROAST_CHARACTERS.default;

    const prompt = `${character.systemPrompt}

CRITICAL: You must FULLY EMBODY this character's voice, speech patterns, and personality. This is not a surface-level impression - you ARE this character analyzing fantasy football. Use their actual vocabulary, rhythm, and worldview.

Style Guide: ${character.style}

Week ${weekAnalyzed} just finished in the "${leagueName}" league. We're now in Week ${currentWeek}.

Your task: Write power rankings reviewing each team IN CHARACTER. Stay in character the ENTIRE time.

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
      model: 'claude-3-5-sonnet-20240620', // Using stable version
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
