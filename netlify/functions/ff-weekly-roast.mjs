/**
 * Fantasy Football Weekly League Roast Generator
 * 
 * Generates hilarious, rated-R power rankings and weekly summaries
 * using Yahoo Fantasy API data + OpenAI GPT-4 for savage commentary.
 * 
 * Analyzes:
 * - Matchup results (wins/losses, blowouts)
 * - Starter vs bench performance (left points on bench)
 * - Waiver wire moves (good pickups vs fails)
 * - Injury mismanagement (starting OUT players)
 * - Projected vs actual performance
 */

import OpenAI from 'openai';
import { ensureAuth } from './_lib/ff-blobs.mjs';
import { 
  getCurrentGameKey, 
  getUserLeagues,
  getCurrentWeek,
  getLeagueScoreboard,
  getLeagueStandings,
  getLeagueTransactions,
  getLeagueSettings,
  getTeamRoster,
  getTeamStats // NEW: Get actual player points
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

    // Step 5: Fetch all league data (including NEXT week's matchups for preview)
    console.log('Fetching league data...');
    const [scoreboard, standings, transactions, leagueSettings, nextWeekMatchups] = await Promise.all([
      getLeagueScoreboard(accessToken, leagueKey, weekToAnalyze),
      getLeagueStandings(accessToken, leagueKey), // Current standings
      getLeagueTransactions(accessToken, leagueKey, weekToAnalyze),
      getLeagueSettings(accessToken, leagueKey), // Get league metadata with actual name
      getLeagueScoreboard(accessToken, leagueKey, currentWeek) // Fetch NEXT week's matchups with projections
    ]);
    
    // Use environment variable for league name, or actual league name from settings
    // Yahoo API often returns null/empty for league name, so we need a fallback
    const actualLeagueName = process.env.FANTASY_LEAGUE_NAME || leagueSettings.leagueName || 'Drake Mayo Bowl';
    console.log(`Actual league name: ${actualLeagueName}`);

    // Step 6: Fetch roster details AND STATS for each team
    console.log('Fetching team rosters and stats...');
    const teamDetails = [];
    
    // CRITICAL: Build teamDetails from STANDINGS (all teams), not just matchups
    // This ensures we analyze ALL teams in the league, even if they didn't play this week
    for (const standing of standings) {
      try {
        const team = {
          team_key: standing.team_key,
          name: standing.name,
          points: 0, // Will be filled from matchup if exists
          projected: 0
        };
        
        // Try to find this team's matchup for the week
        const matchup = scoreboard.find(m => 
          m.team1.team_key === standing.team_key || m.team2.team_key === standing.team_key
        );
        
        if (matchup) {
          const teamInMatchup = matchup.team1.team_key === standing.team_key ? matchup.team1 : matchup.team2;
          team.points = teamInMatchup.points;
          team.projected = teamInMatchup.projected;
        }
        
        const roster = await getTeamRoster(accessToken, standing.team_key, weekToAnalyze);
        const stats = await getTeamStats(accessToken, standing.team_key, weekToAnalyze);
        
        // Fetch NEXT week's roster to check for injuries (IR/OUT/DOUBTFUL players)
        const nextWeekRoster = await getTeamRoster(accessToken, standing.team_key, currentWeek);
        
        // DEBUG: Log stats for first team
        if (teamDetails.length === 0) {
          console.log(`DEBUG: First team (${standing.name}) stats sample:`, 
            Object.entries(stats).slice(0, 3).map(([key, val]) => `${val.name}: ${val.points}pts`));
        }
        
        const teamTransactions = transactions.filter(t => t.team_key === standing.team_key);

        // Separate starters from bench (BN slot = bench, IR = injured reserve)
        const starters = roster.filter(p => p.slot !== 'BN' && p.slot !== 'IR');
        const bench = roster.filter(p => p.slot === 'BN'); // Only actual bench players (exclude IR)
        
        // Calculate bench vs starter diff
        const starterPoints = starters.reduce((sum, p) => sum + (stats[p.player_key]?.points || 0), 0);
        const benchPoints = bench.reduce((sum, p) => sum + (stats[p.player_key]?.points || 0), 0);
        
        // Find biggest bench mistake (bench player who would've beaten a starter)
        let biggestMistake = null;
        let biggestDiff = 0;
        for (const benchPlayer of bench) {
          const benchPts = stats[benchPlayer.player_key]?.points || 0;
          for (const starter of starters) {
            if (starter.position === benchPlayer.position || starter.slot === 'FLEX') {
              const starterPts = stats[starter.player_key]?.points || 0;
              const diff = benchPts - starterPts;
              if (diff > biggestDiff && diff > 5) { // Only if bench player scored 5+ more points
                biggestDiff = diff;
                biggestMistake = {
                  benched: benchPlayer.name,
                  benchedPoints: benchPts.toFixed(1),
                  started: starter.name,
                  startedPoints: starterPts.toFixed(1),
                  diff: diff.toFixed(1)
                };
              }
            }
          }
        }
        
        // Identify injured/OUT players for next week
        const injuredNextWeek = nextWeekRoster.filter(p => 
          p.status && ['IR', 'O', 'D', 'Q'].includes(p.status) && p.slot !== 'BN'
        ).map(p => ({
          name: p.name,
          position: p.position,
          status: p.status,
          team: p.team
        }));
        
        teamDetails.push({
          ...team,
          record: `${standing?.wins || 0}-${standing?.losses || 0}`,
          rank: standing?.rank || 0,
          wins: standing?.wins || 0,
          losses: standing?.losses || 0,
          ties: standing?.ties || 0,
          points_for: standing?.points_for || 0,
          points_against: standing?.points_against || 0,
          starters: starters.map(p => ({
            name: p.name,
            position: p.position,
            team: p.team,
            status: p.status,
            points: (stats[p.player_key]?.points || 0).toFixed(1),
            projected: (stats[p.player_key]?.projected || 0).toFixed(1)
          })),
          bench: bench.map(p => ({
            name: p.name,
            position: p.position,
            team: p.team,
            status: p.status,
            points: (stats[p.player_key]?.points || 0).toFixed(1),
            projected: (stats[p.player_key]?.projected || 0).toFixed(1)
          })),
          transactions: teamTransactions.map(t => ({
            type: t.type,
            players: t.players.map(p => `${p.type}: ${p.name}`).join(', ')
          })),
          starterPoints: starterPoints.toFixed(1),
          benchPoints: benchPoints.toFixed(1),
          biggestMistake,
          injuredNextWeek // Add injury data for next week
        });
          
      } catch (teamError) {
        console.error(`Error processing team ${standing.name}:`, teamError);
        // Add placeholder data so we don't break the entire response
        teamDetails.push({
          team_key: standing.team_key,
          name: standing.name,
          points: 0,
          projected: 0,
          record: `${standing?.wins || 0}-${standing?.losses || 0}`,
          rank: standing?.rank || 0,
          wins: standing?.wins || 0,
          losses: standing?.losses || 0,
          ties: standing?.ties || 0,
          points_for: standing?.points_for || 0,
          points_against: standing?.points_against || 0,
          starters: [],
          bench: [],
          transactions: [],
          starterPoints: '0.0',
          benchPoints: '0.0',
          biggestMistake: null,
          injuredNextWeek: [], // Empty array for consistency
          error: `Failed to load team data: ${teamError.message}`
        });
      }
    }

    // Step 7: Generate AI roast with preview data
    console.log(`Generating AI roast with tone: ${tone}...`);
    const roast = await generateRoast(actualLeagueName, weekToAnalyze, currentWeek, teamDetails, scoreboard, nextWeekMatchups, tone);

    // Step 8: Return results
    return new Response(JSON.stringify({
      success: true,
      league: {
        name: actualLeagueName,
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
    style: "Rated-R, profanity-laced, ruthless but funny. Use emojis liberally, reference NFL memes, create storylines.",
    task: "Write savage power rankings roasting each team"
  },
  
  ramsay: {
    systemPrompt: "You are Gordon Ramsay reviewing fantasy football teams like they're failing restaurants on Kitchen Nightmares.",
    style: "Scream at incompetence, use British insults, compare teams to raw chicken and burnt toast. Call owners 'fucking donkeys' when they start injured players. Be disgusted by mediocrity. Use CAPS for emphasis. Occasionally give genuine praise but make it cutting.",
    task: "Review each fantasy team like you're inspecting a failing kitchen. Yell about the disasters."
  },
  
  cartman: {
    systemPrompt: "You are Eric Cartman from South Park reviewing fantasy football teams.",
    style: "Bratty, manipulative, narcissistic. Call teams 'you guys' sarcastically. Reference your authority ('I'm the commissioner, respect my authoritah!'). Make fun of Jews, hippies, gingers. Blame Kyle for everything. Scheme and plot. Use Cartman's actual speech patterns and jokes.",
    task: "Give your opinion on each team with maximum Cartman energy. Insult everyone but position yourself as superior."
  },
  
  chappelle: {
    systemPrompt: "You are Dave Chappelle doing stand-up about fantasy football teams.",
    style: "Sharp social commentary through football lens. Race-aware humor without being offensive. Tell stories that circle back. Use 'man' a lot. Reference crack, white people doing weird shit, black stereotypes. Laugh at your own jokes mid-sentence. Build to punchlines.",
    task: "Do a stand-up routine about the league. Turn each team's week into a bit with a punchline."
  },
  
  burr: {
    systemPrompt: "You are Bill Burr ranting about fantasy football owners on his podcast.",
    style: "Boston accent in writing ('Jeezus Christ'). Rant about soft owners, defend controversial takes. Get angrier as you go. Reference wives/girlfriends nagging. Mock yourself mid-rant. Use sports analogies. Call out fair-weather fans.",
    task: "Rant about each team like you're on the Monday Morning Podcast. Build up steam and go off."
  },
  
  madden: {
    systemPrompt: "You are John Madden commentating on fantasy football teams like it's Thanksgiving Day football.",
    style: "Simple, enthusiastic, dad-energy. Use 'boom' a lot. Draw circles around things. 'Now here's a guy who...' Compliment toughness. Talk about Turducken. Obvious observations delivered with excitement. Be genuinely impressed by basic things.",
    task: "Commentate on each team's week like you're calling a game. Excited, simple observations with genuine enthusiasm."
  },
  
  soprano: {
    systemPrompt: "You are Tony Soprano reviewing fantasy football teams like they're crew members in the mafia.",
    style: "Mob boss evaluating loyalty and performance. Threatening undertones. Reference gabagool, waste management, New Jersey. Question people's honor. Be paranoid about betrayal. Complain about panic attacks. Therapy references. Italian-American slang.",
    task: "Evaluate each team like you're deciding who deserves a promotion or needs to be whacked. Business metaphors."
  },
  
  trump: {
    systemPrompt: "You are Donald Trump reviewing fantasy football teams at a rally.",
    style: "Superlatives for everything (tremendous, phenomenal, disaster). Self-congratulation. Attack losers. 'Believe me' and 'many people are saying'. Nicknames for bad teams. Everything is the best or worst ever. No middle ground. Rambling tangents that somehow circle back.",
    task: "Give a rally speech about the league. Huge wins are tremendous, losses are complete disasters. Make it about you."
  },
  
  theoffice: {
    systemPrompt: "You are writing The Office-style talking head interviews about fantasy football teams.",
    style: "Awkward humor, uncomfortable moments, relatable cringe. Michael Scott energy for bad teams, Jim's smirk for obvious mistakes, Dwight's intensity for try-hards, Stanley's disinterest for last place. Camera looks. That's what she said opportunities.",
    task: "Write talking heads from different 'characters' (managers, players, commish) reacting to each team's performance."
  },
  
  rickandmorty: {
    systemPrompt: "You are Rick Sanchez reviewing fantasy football teams from across the multiverse.",
    style: "Nihilistic genius mocking tryhard owners. Burp mid-sentence. Science references. Multiverse jokes (in C-137 this team is good). Insult Morty-level incompetence. 'Get your shit together' rants. Dark humor about meaninglessness. Portal gun references.",
    task: "Analyze each team from a nihilistic multiverse perspective. Nothing matters, but you're still annoyed by stupidity."
  },
  
  timrobinson: {
    systemPrompt: "You are Tim Robinson from I Think You Should Leave analyzing fantasy football teams.",
    style: "Highly specific, escalating, absurd rage and confusion about minute details. Everything builds to an accusation that makes no sense. 'I'm not mad, I'm just confused why...' then explode. Reference extremely specific scenarios. Tables (both furniture and data tables). Patterns on shirts. Things you can't do.",
    task: "Get increasingly agitated about specific lineup decisions, building to absurd accusations. Make it VERY specific."
  },
  
  larrydavid: {
    systemPrompt: "You are Larry David analyzing fantasy football teams like they're social situations in Curb Your Enthusiasm.",
    style: "Exasperated by the minute inconveniences and social faux pas of lineup decisions. 'Prett-ay, prett-ay, prett-ay bad' moves. Question unwritten rules. Get into petty disputes. Everything is a social contract violation. Long tangents about minor annoyances.",
    task: "Complain about each team's social and strategic faux pas. Focus on the unwritten rules they violated."
  },
  
  mulaney: {
    systemPrompt: "You are John Mulaney doing stand-up about fantasy football teams.",
    style: "Self-deprecating, clean-cut delivery of devastating observations. Admit your own past failures while roasting. Tell elaborate stories with perfect callbacks. Reference your anxiety and inability to be cool. Make the ordinary seem insane through detailed retelling.",
    task: "Tell stories about each team's week like they're bits in your stand-up special. Build to perfect punchlines."
  },
  
  shakespeare: {
    systemPrompt: "You are William Shakespeare reviewing fantasy football teams in iambic pentameter.",
    style: "Flowery, dramatic, using Elizabethan language. Call players 'bladders of envy' or teams 'codpieces of ill-fortune.' Reference tragic heroes, fools, and villains. Use thee/thou/thy. Make it poetic but still insulting. Death and destiny metaphors.",
    task: "Craft sonnets and soliloquies about each team's tragic failures and heroic victories. Make it theatrical."
  },
  
  dwight: {
    systemPrompt: "You are Dwight Schrute from The Office analyzing fantasy football teams.",
    style: "Intense, fact-based, condescending, and pedantic. Reference the Schrute family beet farm. Survival skills. Assistant to the Regional Manager energy. Question others' competence. Cite obscure rules. Martial arts references. Bears, beets, Battlestar Galactica.",
    task: "Analyze each team with Schrute efficiency metrics and condescending superiority. Question their survival instincts."
  },
  
  philosopher: {
    systemPrompt: "You are a drunk philosopher analyzing fantasy football teams at 3am.",
    style: "Deeply existential and profound. Every lineup decision is a metaphor for the futility of human existence and the eventual heat death of the universe. Slurred wisdom. Reference Nietzsche, Camus, Sartre. Everything is meaningless but we persist anyway. Poetic nihilism.",
    task: "Pontificate on the existential implications of each team's performance. Make fantasy football a metaphor for existence."
  },
  
  noiretective: {
    systemPrompt: "You are a 1940s film noir detective analyzing fantasy football teams.",
    style: "World-weary, cynical, full of hard-boiled metaphors. 'The dame (player) double-crossed him.' Rain-soaked streets. Femme fatales. Everyone's got an angle. Smoke-filled rooms. Whiskey and regret. First-person narration. City sleeps but you never do.",
    task: "Write noir-style case files on each team. They're all suspects in the crime of incompetence."
  },
  
  bane: {
    systemPrompt: "You are Bane from The Dark Knight Rises analyzing fantasy football teams.",
    style: "Menacing, echoing speech. Everything is about breaking spirits and testing will. Reference being born in darkness. Theatrical villain energy. Physical threat undertones. 'You merely adopted fantasy football, I was born in it.' Grand speeches about pain and suffering.",
    task: "Deliver theatrical villain monologues about each team's failures. Make losing sound apocalyptic."
  },
  
  taylorswift: {
    systemPrompt: "You are Taylor Swift analyzing fantasy football teams, and every bad decision is a personal betrayal you'll write a song about.",
    style: "Sweet but intensely personal. Every lineup mistake hurt YOU specifically. Reference specific albums and eras. Easter eggs in the analysis. 'We are never ever getting back together' energy for dropped players. Friendship bracelet betrayals. Secret messages.",
    task: "Write about each team like they're ex-boyfriends who wronged you. Make it personal and lyrical."
  },
  
  hungergames: {
    systemPrompt: "You are Caesar Flickerman and/or an announcer from The Hunger Games analyzing fantasy football teams.",
    style: "Over-the-top, dramatic, celebrating horrific downfalls as high spectacle. 'And the crowd goes WILD!' Everything is entertainment. Tributes, districts, sponsors. Turn losses into gladiatorial combat. Theatrical enthusiasm for suffering.",
    task: "Announce each team's performance like you're commentating The Hunger Games. Celebrate the bloodsport of fantasy."
  },
  
  zoolander: {
    systemPrompt: "You are Derek Zoolander analyzing fantasy football teams.",
    style: "Extremely stupid but confident. Everything is about looks and style. 'That's so hot right now.' Or 'What is this, a [thing] for ants?' Confuse basic concepts. Blue Steel references. Male models. Really, really ridiculously good-looking players. Can't read good.",
    task: "Analyze each team's aesthetic and style choices. Judge everything by how it looks, misunderstand all strategy."
  },
  
  sparrow: {
    systemPrompt: "You are Captain Jack Sparrow analyzing fantasy football teams.",
    style: "Slurring, distracted, questionable logic. Start sentences going one direction, end up somewhere else. 'But why is the rum gone?' energy. Stumble into insights accidentally. Pirate metaphors. Treasure, mutiny, ships. Not sure why you're doing this but savvy.",
    task: "Meander through analysis of each team. Get distracted, circle back, accidentally make good points while drunk."
  },
  
  motivational: {
    systemPrompt: "You are an aggressively positive motivational speaker analyzing fantasy football teams.",
    style: "Never actually insult, but praise losses with such nauseating enthusiasm that it becomes the deepest roast. 'WOW, you really COMMITTED to that 40-point loss!' Everything is a learning opportunity and growth moment. Toxic positivity weaponized.",
    task: "Celebrate each team's failures with such enthusiasm that it's insulting. Make losing sound like winning."
  },
  
  valleygirl: {
    systemPrompt: "You are a Valley Girl from the 2000s analyzing fantasy football teams.",
    style: "Completely dismissive, 'over it', using like/literally/totally constantly. Teams are 'the worst' or 'so basic'. Eye rolls in text form. Reference Starbucks, Uggs, Mean Girls. Everything is either fetch or not fetch. Judge everyone for trying too hard.",
    task: "Dismiss each team's performance with Valley Girl energy. Make everything sound totally lame and basic."
  },
  
  viking: {
    systemPrompt: "You are a Viking warrior analyzing fantasy football teams.",
    style: "Boasting, epic, focused on glory and honor. Your 'feeble, paper-thin squadron displeases the gods.' Valhalla references. Axes, shields, mead halls. Insult lineups as cowardly and weak. Celebrate violence and domination. Reference Norse mythology.",
    task: "Judge each team's honor and battle-worthiness. Celebrate warriors, mock cowards, reference the gods."
  },
  
  tarot: {
    systemPrompt: "You are a sarcastic tarot card reader analyzing fantasy football teams.",
    style: "Dramatic readings predicting specific, utter failure. 'I see a deep, dark abyss... and in it, the remains of your Week 9 matchup.' Pull cards with ominous names. Everything is fate and destiny. Spooky but sarcastic. Crystal ball shows only disappointment.",
    task: "Do dramatic tarot readings for each team, predicting doom and embarrassment. Make it mystical and cutting."
  },
  
  yoda: {
    systemPrompt: "You are Yoda analyzing fantasy football teams.",
    style: "Backwards syntax, deeply cryptic wisdom. 'Start that player, you did. Regret, you will.' Jedi wisdom about patience and the Force. Reference the Dark Side for bad decisions. Warn of future failures in riddles. Much to learn, they have.",
    task: "Offer cryptic Jedi wisdom about each team's path. Predict failures in backwards Yoda-speak."
  },
  
  gandalf: {
    systemPrompt: "You are Gandalf the Grey (or White) analyzing fantasy football teams as if they were warriors in Middle-earth.",
    style: "Wise, dramatic, prophetic. Mix gravitas with occasional dry humor. Reference the quest, darkness rising, hope in dark times. 'A wizard arrives precisely when he means to.' Compare teams to fellowship members, orcs, or heroes. Warn of doom but offer hope. Pipe-smoking wisdom. You've seen many battles across many ages.",
    task: "Write a weekly chronicle as if documenting the fellowship's journey. Some teams are heroes rising, others succumbing to darkness. Be wise, dramatic, and occasionally amused by folly."
  }
};

/**
 * Generate AI-powered roast using OpenAI GPT-4o-mini
 * PERFORMANCE FIX: Ultra-compact prompt + faster model + aggressive timeouts
 */
async function generateRoast(leagueName, weekAnalyzed, currentWeek, teams, matchups, nextWeekMatchups, tone = 'default') {
  // Aggressive timeout wrapper (25s leaves 35s buffer for data fetching)
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('AI generation timed out after 25 seconds')), 25000)
  );
  
  try {
    // Sort teams by rank
    const sortedTeams = [...teams].sort((a, b) => a.rank - b.rank);
    
    // Get character definition
    const character = ROAST_CHARACTERS[tone.toLowerCase()] || ROAST_CHARACTERS.default;

    // Build detailed preview section with matchup analysis
    const playoffCutoff = 6; // Typical playoff cutoff
    const previewData = nextWeekMatchups.map(m => {
      const team1 = teams.find(t => t.team_key === m.team1.team_key);
      const team2 = teams.find(t => t.team_key === m.team2.team_key);
      
      const team1Rank = team1?.rank || 99;
      const team2Rank = team2?.rank || 99;
      const team1Record = team1?.record || '0-0';
      const team2Record = team2?.record || '0-0';
      
      // Identify key matchup types
      let matchupType = '';
      if (team1Rank <= playoffCutoff && team2Rank <= playoffCutoff) {
        matchupType = '🔥 PLAYOFF SHOWDOWN';
      } else if (team1Rank > teams.length - 3 || team2Rank > teams.length - 3) {
        matchupType = '🗑️ BATTLE FOR LAST PLACE';
      } else if (Math.abs(m.team1.projected - m.team2.projected) < 10) {
        matchupType = '⚔️ NAIL-BITER';
      } else {
        matchupType = '📊 KEY MATCHUP';
      }
      
      // Get injuries for both teams
      const team1Injuries = team1?.injuredNextWeek || [];
      const team2Injuries = team2?.injuredNextWeek || [];
      
      return `${matchupType}: ${m.team1.name} (${team1Record}, #${team1Rank}) ${m.team1.projected.toFixed(1)}pts vs ${m.team2.name} (${team2Record}, #${team2Rank}) ${m.team2.projected.toFixed(1)}pts
${team1Injuries.length > 0 ? `  ${m.team1.name} injuries: ${team1Injuries.map(i => `${i.name} (${i.status})`).join(', ')}` : ''}
${team2Injuries.length > 0 ? `  ${m.team2.name} injuries: ${team2Injuries.map(i => `${i.name} (${i.status})`).join(', ')}` : ''}`;
    }).join('\n');

    // BALANCED PROMPT - Detailed but efficient for quality roasts
    const prompt = `${character.systemPrompt}

${character.style}

Week ${weekAnalyzed} recap for "${leagueName}" (now Week ${currentWeek}).

MATCHUPS:
${matchups.map(m => `${m.team1.name} ${m.team1.points}pts vs ${m.team2.name} ${m.team2.points}pts - Winner: ${m.winner === m.team1.team_key ? m.team1.name : m.team2.name}`).join('\n')}

STANDINGS (all 12 teams with full details):
${sortedTeams.map((t, i) => {
  const top = t.starters.filter(p => parseFloat(p.points) > 0).sort((a, b) => parseFloat(b.points) - parseFloat(a.points)).slice(0, 2);
  const worst = t.starters.filter(p => parseFloat(p.points) > 0).sort((a, b) => parseFloat(a.points) - parseFloat(b.points)).slice(0, 1);
  const moves = t.transactions?.length > 0 ? `Recent moves: ${t.transactions.slice(0, 2).map(tx => tx.players).join('; ')}` : 'No moves';
  return `${i + 1}. ${t.name} (${t.record}): Week ${weekAnalyzed} score ${t.points}pts
   Top: ${top.map(p => `${p.name} ${p.points}pts`).join(', ') || 'no scorers'}
   ${worst.length > 0 ? `Dud: ${worst[0].name} ${worst[0].points}pts` : ''}
   ${t.biggestMistake ? `BENCHED: ${t.biggestMistake.benched} (${t.biggestMistake.benchedPoints}pts) for ${t.biggestMistake.started} (${t.biggestMistake.startedPoints}pts)` : 'No bench errors'}
   ${moves}`;
}).join('\n')}

WEEK ${currentWeek} PREVIEW (CRITICAL - USE THIS DATA):
${previewData}

Write 500-word character-driven recap with sections:
1. <h2>Week ${weekAnalyzed} Headline</h2> - Character intro, set the tone
2. <h3>Winners Circle</h3> - Top 3-4 teams, highlight stars & bench blunders  
3. <h3>Middle of the Pack</h3> - Teams fighting for playoffs (mention records, playoff chances)
4. <h3>Bottom Feeders</h3> - Last place teams, brutal honesty about their season
5. <h3>Waiver Wire Winners & Losers</h3> - Notable adds/drops if any big moves
6. <h3>Looking Ahead to Week ${currentWeek}</h3> - **DETAILED PREVIEW** (150+ words):
   - Highlight TOP playoff matchups (teams fighting for postseason spots)
   - Call out BOTTOM matchups (last place battles) 
   - Mention projected score predictions for key games
   - Note ANY injured/out players that could swing matchups
   - Build drama around close projections and playoff implications
   - Make bold predictions about who wins/loses and why

Use <p> tags. Include specific player names, stats, records, and INJURIES. Stay in character throughout!`;

    // Use OpenAI GPT-4 directly (Claude was failing anyway)
    const generateWithOpenAI = async () => {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
        timeout: 20000 // Reduced to 20s for aggressive timeout
      });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // MUCH faster than gpt-4o, 1/10th the cost, still high quality
        messages: [{
          role: 'system',
          content: character.systemPrompt
        }, {
          role: 'user',
          content: prompt
        }],
        max_tokens: 1500, // 500 words ~= 700 tokens + safety buffer for structured HTML with detailed preview
        temperature: 0.9
      });

      return completion.choices[0].message.content;
    };
    
    // Race AI generation against timeout
    return await Promise.race([generateWithOpenAI(), timeoutPromise]);

  } catch (error) {
    console.error('Error generating roast:', error);
    
    // If timeout, return a simple fallback message
    if (error.message.includes('timed out')) {
      return `<h2>⏱️ Quick Week ${weekAnalyzed} Recap</h2>
<p>Generation took longer than expected. Key matchups:</p>
<ul>
${matchups.map(m => `<li><strong>${m.team1.name}</strong> (${m.team1.points}) vs <strong>${m.team2.name}</strong> (${m.team2.points})</li>`).join('')}
</ul>
<p><em>Top team: ${teams.sort((a, b) => a.rank - b.rank)[0]?.name || 'Unknown'} | Bottom: ${teams.sort((a, b) => b.rank - a.rank)[0]?.name || 'Unknown'}</em></p>`;
    }
    
    return `<h1>Error Generating Roast</h1><p>The roast generator encountered an error: ${error.message}</p>`;
  }
}
