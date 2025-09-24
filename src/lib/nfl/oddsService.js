// Real NFL TD Props Odds Service - TheOddsAPI Integration
// Replaces mock data with actual sportsbook odds

export class NFLOddsService {
  constructor() {
    this.baseUrl = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds';
    this.apiKey = process.env.THEODDS_API_KEY || process.env.REACT_APP_ODDS_API_KEY || 'demo'; // Match Netlify env var
    this.enableDebug = true; // Enhanced logging for real odds investigation
  }

  /**
   * Fetch live TD prop odds for NFL players
   * Returns actual sportsbook odds across multiple books
   */
  async fetchTDPropOdds(playerName, position, team) {
    const cacheKey = `${playerName}_${team}_${position}`;
    
    // DEBUG: Log API call details
    console.log(`🔍 ODDS DEBUG: Fetching for ${playerName} (${position}, ${team})`);
    console.log(`🔑 API Key status: ${this.hasValidApiKey ? 'LIVE API' : 'DEMO MODE - Will use fallback'}`);
    
    // Skip API call entirely if in demo mode
    if (!this.hasValidApiKey) {
      console.log(`⚠️ DEMO MODE: Returning fallback odds immediately for ${playerName}`);
      return this.generateFallbackOdds(playerName, position, team);
    }
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      console.log(`📦 CACHE HIT: Using cached odds for ${playerName}`);
      return cached.data;
    }

    try {
      const apiUrl = `${this.baseUrl}/sports/americanfootball_nfl/odds/?apiKey=${this.apiKey}&regions=us&markets=player_anytime_td,player_1st_td,player_tds_over&oddsFormat=american`;
      console.log(`🌐 API CALL: ${apiUrl.replace(this.apiKey, '[HIDDEN]')}`);
      
      // Fetch current NFL games for this week
      const gamesResponse = await fetch(apiUrl);
      
      console.log(`📡 API RESPONSE: Status ${gamesResponse.status}`);
      
      if (!gamesResponse.ok) {
        console.error(`❌ API ERROR: ${gamesResponse.status} - ${gamesResponse.statusText}`);
        throw new Error(`Odds API error: ${gamesResponse.status}`);
      }

      const games = await gamesResponse.json();
      console.log(`📊 GAMES DATA: Found ${games.length} games with odds data`);
      
      // Find odds for this specific player
      const playerOdds = this.extractPlayerOdds(games, playerName, team);
      
      console.log(`🎯 PLAYER ODDS: ${playerName} found:`, playerOdds ? 'YES' : 'NO');
      if (playerOdds) {
        console.log(`💰 ODDS DETAILS:`, {
          books: playerOdds.books?.length || 0,
          anytime_td: playerOdds.anytime_td,
          source: playerOdds.source
        });
      }
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: playerOdds,
        timestamp: Date.now()
      });

      return playerOdds;

    } catch (error) {
      console.error(`❌ ODDS FETCH FAILED for ${playerName}:`, error.message);
      
      console.log(`⚠️ FALLBACK: Using position-based estimates for ${playerName}`);
      // Return fallback odds with clear indication
      return this.generateFallbackOdds(playerName, position, team);
    }
  }

  /**
   * Extract odds for specific player from API response
   */
  extractPlayerOdds(games, playerName, team) {
    const playerOdds = {
      anytime_td: null,
      first_td: null,
      books: [],
      last_updated: new Date().toISOString(),
      source: 'theoddsapi_live'
    };

    for (const game of games) {
      // Check if this game involves the player's team
      if (!this.gameInvolvesTeam(game, team)) continue;

      // Look through all bookmakers
      for (const bookmaker of game.bookmakers || []) {
        for (const market of bookmaker.markets || []) {
          
          if (market.key === 'player_anytime_td') {
            const playerOutcome = this.findPlayerInOutcomes(market.outcomes, playerName);
            if (playerOutcome) {
              playerOdds.anytime_td = this.convertOddsToImpliedProbability(playerOutcome.price);
              playerOdds.books.push({
                bookmaker: bookmaker.title,
                anytime_odds: playerOutcome.price,
                market: 'anytime_td'
              });
            }
          }

          if (market.key === 'player_first_td') {
            const playerOutcome = this.findPlayerInOutcomes(market.outcomes, playerName);
            if (playerOutcome) {
              playerOdds.first_td = this.convertOddsToImpliedProbability(playerOutcome.price);
              playerOdds.books.push({
                bookmaker: bookmaker.title,
                first_td_odds: playerOutcome.price,
                market: 'first_td'
              });
            }
          }

          if (market.key === 'player_tds_over') {
            // Look for OVER 1 TD lines (which means 2+ TDs)
            const playerOutcomes = market.outcomes.filter(outcome => 
              outcome.description && outcome.description.toLowerCase().includes(playerName.toLowerCase())
            );
            
            for (const outcome of playerOutcomes) {
              // Check if this is "Over 1" TD (meaning 2+ TDs)
              if (outcome.point === 1 && outcome.name === 'Over') {
                console.log(`🎯 FOUND 2+ TD: ${playerName} Over 1 TD at ${outcome.price} (${bookmaker.title})`);
                playerOdds.multiple_td = this.convertOddsToImpliedProbability(outcome.price);
                playerOdds.books.push({
                  bookmaker: bookmaker.title,
                  multiple_td_odds: outcome.price,
                  market: 'multiple_td',
                  line: 'Over 1 TD'
                });
                break;
              }
              // Also check for 1.5+ as backup
              else if (outcome.point === 1.5 && outcome.name === 'Over') {
                console.log(`🎯 FOUND 2+ TD: ${playerName} Over 1.5 TD at ${outcome.price} (${bookmaker.title})`);
                playerOdds.multiple_td = this.convertOddsToImpliedProbability(outcome.price);
                playerOdds.books.push({
                  bookmaker: bookmaker.title,
                  multiple_td_odds: outcome.price,
                  market: 'multiple_td', 
                  line: 'Over 1.5 TD'
                });
                break;
              }
            }
          }
        }
      }
    }

    return playerOdds;
  }

  /**
   * Check if game involves the specified team
   */
  gameInvolvesTeam(game, team) {
    const teamAliases = {
      'ARI': ['Arizona Cardinals', 'ARI'],
      'ATL': ['Atlanta Falcons', 'ATL'],
      'BAL': ['Baltimore Ravens', 'BAL'],
      'BUF': ['Buffalo Bills', 'BUF'],
      'CAR': ['Carolina Panthers', 'CAR'],
      'CHI': ['Chicago Bears', 'CHI'],
      'CIN': ['Cincinnati Bengals', 'CIN'],
      'CLE': ['Cleveland Browns', 'CLE'],
      'DAL': ['Dallas Cowboys', 'DAL'],
      'DEN': ['Denver Broncos', 'DEN'],
      'DET': ['Detroit Lions', 'DET'],
      'GB': ['Green Bay Packers', 'GB'],
      'HOU': ['Houston Texans', 'HOU'],
      'IND': ['Indianapolis Colts', 'IND'],
      'JAX': ['Jacksonville Jaguars', 'JAX'],
      'KC': ['Kansas City Chiefs', 'KC'],
      'LV': ['Las Vegas Raiders', 'LV'],
      'LAC': ['Los Angeles Chargers', 'LAC'],
      'LAR': ['Los Angeles Rams', 'LAR'],
      'MIA': ['Miami Dolphins', 'MIA'],
      'MIN': ['Minnesota Vikings', 'MIN'],
      'NE': ['New England Patriots', 'NE'],
      'NO': ['New Orleans Saints', 'NO'],
      'NYG': ['New York Giants', 'NYG'],
      'NYJ': ['New York Jets', 'NYJ'],
      'PHI': ['Philadelphia Eagles', 'PHI'],
      'PIT': ['Pittsburgh Steelers', 'PIT'],
      'SF': ['San Francisco 49ers', 'SF'],
      'SEA': ['Seattle Seahawks', 'SEA'],
      'TB': ['Tampa Bay Buccaneers', 'TB'],
      'TEN': ['Tennessee Titans', 'TEN'],
      'WAS': ['Washington Commanders', 'WAS']
    };

    const aliases = teamAliases[team] || [team];
    return aliases.some(alias => 
      game.home_team?.includes(alias) || 
      game.away_team?.includes(alias)
    );
  }

  /**
   * Find player in outcomes array with fuzzy name matching
   */
  findPlayerInOutcomes(outcomes, playerName) {
    return outcomes.find(outcome => {
      if (!outcome.description) return false;
      
      const outcomeName = outcome.description.toLowerCase();
      const searchName = playerName.toLowerCase();
      
      // Try exact match first
      if (outcomeName.includes(searchName)) return true;
      
      // Try last name match
      const lastName = searchName.split(' ').pop();
      if (lastName && outcomeName.includes(lastName)) return true;
      
      // Try first name + last initial
      const nameParts = searchName.split(' ');
      if (nameParts.length >= 2) {
        const firstLastInitial = `${nameParts[0]} ${nameParts[1][0]}`;
        if (outcomeName.includes(firstLastInitial.toLowerCase())) return true;
      }
      
      return false;
    });
  }

  /**
   * Convert American odds to implied probability
   */
  convertOddsToImpliedProbability(americanOdds) {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }

  /**
   * Generate fallback odds when API fails
   */
  generateFallbackOdds(playerName, position, team) {
    // Position-based fallback odds with REALISTIC 2+ TD probabilities
    const positionOdds = {
      'RB': { anytime: 0.35, first: 0.08, multiple: 0.12 }, // 12% for elite RBs like Henry
      'WR': { anytime: 0.25, first: 0.06, multiple: 0.06 }, // 6% for WRs
      'TE': { anytime: 0.18, first: 0.04, multiple: 0.04 }, // 4% for TEs  
      'QB': { anytime: 0.12, first: 0.03, multiple: 0.02 }  // 2% for QBs
    };

    const odds = positionOdds[position] || { anytime: 0.15, first: 0.04, multiple: 0.03 };

    return {
      anytime_td: odds.anytime,
      first_td: odds.first,
      multiple_td: odds.multiple,
      books: [{
        bookmaker: 'Model Estimate',
        anytime_odds: this.convertProbabilityToAmericanOdds(odds.anytime),
        first_td_odds: this.convertProbabilityToAmericanOdds(odds.first),
        multiple_td_odds: this.convertProbabilityToAmericanOdds(odds.multiple),
        market: 'fallback_model'
      }],
      last_updated: new Date().toISOString(),
      source: 'fallback_model',
      note: 'Live odds unavailable - using realistic model estimates'
    };
  }

  /**
   * Convert probability to American odds format
   */
  convertProbabilityToAmericanOdds(probability) {
    if (probability >= 0.5) {
      return -Math.round((probability / (1 - probability)) * 100);
    } else {
      return Math.round(((1 - probability) / probability) * 100);
    }
  }

  /**
   * Clear cached odds data
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get market consensus from multiple books
   */
  getMarketConsensus(playerOdds) {
    console.log(`📊 MARKET CONSENSUS CALC:`, {
      has_books: !!playerOdds.books,
      book_count: playerOdds.books?.length || 0,
      anytime_td_fallback: playerOdds.anytime_td
    });
    
    if (!playerOdds.books || playerOdds.books.length === 0) {
      const fallback = playerOdds.anytime_td || 0.15;
      console.log(`⚠️ NO BOOKS: Using fallback ${fallback} (${Math.round(fallback * 100)}%)`);
      return fallback;
    }

    // Average implied probabilities across all books
    const anytimeProbs = playerOdds.books
      .filter(book => book.anytime_odds)
      .map(book => {
        const prob = this.convertOddsToImpliedProbability(book.anytime_odds);
        console.log(`📖 BOOK: ${book.bookmaker} odds ${book.anytime_odds} = ${Math.round(prob * 100)}%`);
        return prob;
      });

    if (anytimeProbs.length === 0) {
      const fallback = playerOdds.anytime_td || 0.15;
      console.log(`⚠️ NO VALID ODDS: Using fallback ${fallback} (${Math.round(fallback * 100)}%)`);
      return fallback;
    }

    const consensus = anytimeProbs.reduce((sum, prob) => sum + prob, 0) / anytimeProbs.length;
    console.log(`🎯 CONSENSUS: ${Math.round(consensus * 100)}% from ${anytimeProbs.length} books`);
    return consensus;
  }
}

// Export singleton instance
export const oddsService = new NFLTDOddsService();