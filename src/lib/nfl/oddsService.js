// Real NFL TD Props Odds Service - TheOddsAPI Integration
// Replaces mock data with actual sportsbook odds

export class NFLTDOddsService {
  constructor() {
    this.apiKey = process.env.REACT_APP_ODDS_API_KEY || 'demo'; // Set in production
    this.baseUrl = 'https://api.the-odds-api.com/v4';
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Fetch live TD prop odds for NFL players
   * Returns actual sportsbook odds across multiple books
   */
  async fetchTDPropOdds(playerName, position, team) {
    const cacheKey = `${playerName}_${team}_${position}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      // Fetch current NFL games for this week
      const gamesResponse = await fetch(
        `${this.baseUrl}/sports/americanfootball_nfl/odds/?apiKey=${this.apiKey}&regions=us&markets=player_anytime_td,player_first_td&oddsFormat=american`
      );
      
      if (!gamesResponse.ok) {
        throw new Error(`Odds API error: ${gamesResponse.status}`);
      }

      const games = await gamesResponse.json();
      
      // Find odds for this specific player
      const playerOdds = this.extractPlayerOdds(games, playerName, team);
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: playerOdds,
        timestamp: Date.now()
      });

      return playerOdds;

    } catch (error) {
      console.error('Failed to fetch real odds:', error);
      
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
    // Position-based fallback odds
    const positionOdds = {
      'RB': { anytime: 0.35, first: 0.08 },
      'WR': { anytime: 0.25, first: 0.06 },
      'TE': { anytime: 0.18, first: 0.04 },
      'QB': { anytime: 0.12, first: 0.03 }
    };

    const odds = positionOdds[position] || { anytime: 0.15, first: 0.04 };

    return {
      anytime_td: odds.anytime,
      first_td: odds.first,
      books: [{
        bookmaker: 'Model Estimate',
        anytime_odds: this.convertProbabilityToAmericanOdds(odds.anytime),
        market: 'fallback_model'
      }],
      last_updated: new Date().toISOString(),
      source: 'fallback_model',
      note: 'Live odds unavailable - using model estimates'
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
    if (!playerOdds.books || playerOdds.books.length === 0) {
      return playerOdds.anytime_td || 0.15;
    }

    // Average implied probabilities across all books
    const anytimeProbs = playerOdds.books
      .filter(book => book.anytime_odds)
      .map(book => this.convertOddsToImpliedProbability(book.anytime_odds));

    if (anytimeProbs.length === 0) {
      return playerOdds.anytime_td || 0.15;
    }

    return anytimeProbs.reduce((sum, prob) => sum + prob, 0) / anytimeProbs.length;
  }
}

// Export singleton instance
export const oddsService = new NFLTDOddsService();