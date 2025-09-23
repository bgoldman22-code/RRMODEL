// netlify/functions/soccer-btts-predictions.js
// Soccer Both Teams To Score (BTTS) prediction system
// Uses Poisson model with market edge analysis and vig removal

const LEAGUES = {
  'premier-league': {
    id: '4328',
    name: 'Premier League', 
    season: '2024-25',
    btts_baseline: 0.52, // Historical BTTS rate
    goals_per_game: 2.8
  },
  'champions-league': {
    id: '4480', 
    name: 'UEFA Champions League',
    season: '2024-25', 
    btts_baseline: 0.48,
    goals_per_game: 2.9
  },
  'bundesliga': {
    id: '4331',
    name: 'German Bundesliga',
    season: '2024-25',
    btts_baseline: 0.58, // Highest scoring league
    goals_per_game: 3.2
  }
};

// ---- utils: odds & vig removal ----
function decimalToImpliedProb(decimalOdds) {
  if (!decimalOdds || decimalOdds <= 1) return null;
  return 1 / decimalOdds;
}

function removeVigTwoWay(pYes, pNo) {
  if (!pYes || !pNo) return { yes: 0.5, no: 0.5, overround: null };
  const sum = pYes + pNo;
  return { yes: pYes / sum, no: pNo / sum, overround: sum - 1 };
}

function marketYesProbFromOdds(odds /* { btts_yes, btts_no } */) {
  const pYes = decimalToImpliedProb(odds?.btts_yes);
  const pNo  = decimalToImpliedProb(odds?.btts_no);
  return removeVigTwoWay(pYes, pNo).yes; // vig-free
}

// ---- BTTS core via Poisson ----
function shrinkMean(x, n, k = 12, prior = 1.4) {
  // Empirical-Bayes shrink toward a prior mean
  return (x * n + prior * k) / (n + k);
}

function teamLambdas(home, away, league) {
  // Per-game rates
  const hGF = (home.goals_scored_home   || 0) / Math.max(home.games_home, 1);
  const hGA = (home.goals_conceded_home || 0) / Math.max(home.games_home, 1);
  const aGF = (away.goals_scored_away   || 0) / Math.max(away.games_away, 1);
  const aGA = (away.goals_conceded_away || 0) / Math.max(away.games_away, 1);

  // Shrink toward league-ish priors
  const hGF_s = shrinkMean(hGF, home.games_home || 0, 12, league.goals_per_game/2);
  const aGF_s = shrinkMean(aGF, away.games_away || 0, 12, league.goals_per_game/2);
  const hGA_s = shrinkMean(hGA, home.games_home || 0, 12, league.goals_per_game/2);
  const aGA_s = shrinkMean(aGA, away.games_away || 0, 12, league.goals_per_game/2);

  // Very lightweight attack×defense interaction with home tilt
  const leagueHomeShare = Math.min(Math.max(league.goals_per_game * 0.52, 1.2), 1.7);
  const leagueAwayShare = Math.max(league.goals_per_game - leagueHomeShare, 0.9);

  const lambdaHome = Math.max(0.2, Math.min(3.8, (hGF_s * aGA_s) / (league.goals_per_game/2) * leagueHomeShare));
  const lambdaAway = Math.max(0.2, Math.min(3.5, (aGF_s * hGA_s) / (league.goals_per_game/2) * leagueAwayShare));

  return { home: lambdaHome, away: lambdaAway };
}

function bttsProbFromLambdas(lambdaHome, lambdaAway) {
  // Independent Poisson: P(BTTS) = 1 − P(H=0) − P(A=0) + P(H=0)P(A=0)
  const pH0 = Math.exp(-lambdaHome);
  const pA0 = Math.exp(-lambdaAway);
  return 1 - pH0 - pA0 + pH0 * pA0;
}

function calculateConfidence(probability, homeTeam, awayTeam, league, marketYesProb = 0.5, absEdge = 0) {
  let c = 50;

  // signal strength
  c += Math.min(18, Math.abs(probability - 0.5) * 100 * 0.45);

  // market disagreement bonus
  c += Math.min(10, absEdge * 100 * 0.6);

  // sample size (home home-games + away away-games)
  const n = (homeTeam.games_home || 0) + (awayTeam.games_away || 0);
  c += Math.min(12, (n / 30) * 12);

  // league "data reliability" nudge
  if (league.id === '4328') c += 4; // PL
  if (league.id === '4331') c += 2; // Bundesliga

  // mild calibration: pull in the 55–65% band slightly
  c = Math.max(35, Math.min(82, c));
  if (c >= 55 && c <= 65) c -= 3;

  return Math.round(c);
}

function recommendationFromEdge(prob, marketYes, confidence) {
  const edge = prob - marketYes;
  const absEdge = Math.abs(edge);

  if (absEdge >= 0.05 && confidence >= 62) return 'BET';
  if (absEdge >= 0.03 && confidence >= 58) return 'CONSIDER';
  return 'PASS';
}

// Kelly Criterion-based value betting with confidence adjustment
function calculateValueBet(probability, decimalOdds, confidence = 50) {
  if (!decimalOdds || decimalOdds <= 1) return 0;
  
  const impliedProb = 1 / decimalOdds;
  const edge = probability - impliedProb;
  
  if (edge <= 0) return 0;
  
  // Kelly fraction with confidence adjustment
  const kellyFraction = edge / (decimalOdds - 1);
  const confidenceMultiplier = Math.min(1, confidence / 70); // Scale down for lower confidence
  
  return Math.min(0.02, kellyFraction * confidenceMultiplier); // Cap at 2% of bankroll for safer BTTS betting
}

// Convert decimal odds to American odds for display
function toAmericanOdds(decimal) {
  if (decimal >= 2) {
    return `+${Math.round((decimal - 1) * 100)}`;
  } else {
    return `-${Math.round(100 / (decimal - 1))}`;
  }
}

// Convert decimal odds to numeric American odds for computation
function toAmericanOddsNumeric(decimal) {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  } else {
    return -Math.round(100 / (decimal - 1));
  }
}

// Team name normalization dictionary - handles variations across sources
const TEAM_NAME_MAPPING = {
  // Premier League
  'Manchester City': ['Man City', 'Manchester City FC', 'MCFC'],
  'Manchester United': ['Man United', 'Man Utd', 'Manchester United FC', 'MUFC'],
  'Arsenal': ['Arsenal FC', 'Gunners'],
  'Liverpool': ['Liverpool FC', 'LFC'],
  'Chelsea': ['Chelsea FC', 'CFC'],
  'Tottenham': ['Tottenham Hotspur', 'Spurs', 'THFC'],
  'Newcastle': ['Newcastle United', 'Newcastle United FC', 'NUFC'],
  'Brighton': ['Brighton & Hove Albion', 'Brighton Hove Albion', 'BHAFC'],
  
  // Bundesliga  
  'Bayern Munich': ['FC Bayern Munich', 'Bayern München', 'FCB'],
  'Borussia Dortmund': ['BVB', 'Dortmund', 'Borussia Dortmund'],
  'RB Leipzig': ['Leipzig', 'RasenBallsport Leipzig'],
  'Bayer Leverkusen': ['Leverkusen', 'Bayer 04 Leverkusen'],
  
  // Champions League additions
  'Barcelona': ['FC Barcelona', 'Barca', 'FCB'],
  'Real Madrid': ['Real Madrid CF', 'Madrid', 'RMCF'],
  'PSG': ['Paris Saint-Germain', 'Paris SG', 'Paris Saint Germain'],
  'AC Milan': ['Milan', 'AC Milan', 'ACM'],
  'Inter Milan': ['Inter', 'Internazionale', 'Inter Milano']
};

// Reverse lookup for normalization
const NORMALIZED_NAMES = {};
Object.entries(TEAM_NAME_MAPPING).forEach(([canonical, variants]) => {
  NORMALIZED_NAMES[canonical] = canonical;
  variants.forEach(variant => NORMALIZED_NAMES[variant] = canonical);
});

function normalizeTeamName(name) {
  return NORMALIZED_NAMES[name] || name;
}

// Competition whitelist to avoid random cups/friendlies
const COMPETITION_WHITELIST = {
  'premier-league': ['Premier League', 'English Premier League', 'EPL'],
  'champions-league': ['UEFA Champions League', 'Champions League', 'UCL'],
  'bundesliga': ['Bundesliga', 'German Bundesliga', '1. Bundesliga']
};

// Live fixture fetching using TheSportsDB (free API) - Enhanced with robust timestamp parsing
async function fetchLiveFixtures(league, daysAhead = 7) {
  const now = new Date();
  const inN = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000);

  try {
    const leagueIds = { 'premier-league': '4328', 'champions-league': '4480', 'bundesliga': '4331' };
    const leagueId = leagueIds[league];
    if (!leagueId) throw new Error(`Unknown league: ${league}`);

    const url = `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`;
    console.log(`Fetching fixtures from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const data = await response.json();
    const events = Array.isArray(data?.events) ? data.events : [];

    const parseKickoff = (ev) => {
      // Prefer strTimestamp (UTC)
      if (ev.strTimestamp) {
        const d = new Date(ev.strTimestamp);
        if (!isNaN(d)) return d;
      }
      // Fallback: dateEvent + strTime (best effort)
      if (ev.dateEvent) {
        const timePart = ev.strTime && /^\d{2}:\d{2}(:\d{2})?$/.test(ev.strTime) ? ev.strTime : '00:00:00';
        const d = new Date(`${ev.dateEvent}T${timePart.replace(/^(\d{2}:\d{2})$/, '$1:00')}Z`);
        if (!isNaN(d)) return d;
      }
      return null;
    };

    // First pass: strict within daysAhead
    let fixtures = events
      .map(ev => {
        const ko = parseKickoff(ev);
        return !ko ? null : {
          id: `${league}-${ev.idEvent}`,
          home_team: normalizeTeamName(ev.strHomeTeam || ''),
          away_team: normalizeTeamName(ev.strAwayTeam || ''),
          league,
          kickoff: ko.toISOString(),
          venue: ev.strVenue || `${ev.strHomeTeam} Stadium`,
          round: ev.intRound || ev.strRound || 'Unknown',
          season: ev.strSeason || '2024-25',
          fixture_source: 'api',
          odds: null
        };
      })
      .filter(Boolean)
      .filter(f => {
        const t = new Date(f.kickoff);
        return t >= now && t <= inN;
      });

    // If nothing in 7 days (common for UCL), relax to "next 15 events" regardless of day window
    if (fixtures.length === 0 && events.length > 0) {
      console.log(`No fixtures in next ${daysAhead} days for ${league}, using next 15 events fallback`);
      fixtures = events.slice(0, 15).map(ev => {
        const ko = parseKickoff(ev) || now; // ensure a date
        return {
          id: `${league}-${ev.idEvent}`,
          home_team: normalizeTeamName(ev.strHomeTeam || ''),
          away_team: normalizeTeamName(ev.strAwayTeam || ''),
          league,
          kickoff: ko.toISOString(),
          venue: ev.strVenue || `${ev.strHomeTeam} Stadium`,
          round: ev.intRound || ev.strRound || 'Unknown',
          season: ev.strSeason || '2024-25',
          fixture_source: 'api',
          odds: null
        };
      }).filter(f => f.home_team && f.away_team); // ensure valid teams
    }

    console.log(`Found ${fixtures.length} fixtures for ${league}`);
    return fixtures;
    
  } catch (error) {
    console.error(`Failed to fetch fixtures for ${league}:`, error);
    
    // Fallback to mock current week data
    return getFallbackFixtures(league);
  }
}

// Fallback fixtures with correct current dates
function getFallbackFixtures(league) {
  const now = new Date();
  const dow = now.getUTCDay(); // 0..6
  const daysUntilSat = (6 - dow + 7) % 7;
  const daysUntilSun = (0 - dow + 7) % 7; // next Sunday

  const nextSaturday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSat, 15, 30, 0, 0
  ));
  const nextSunday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSun, 16, 30, 0, 0
  ));
  
  const fixtures = {
    'premier-league': [
      {
        id: 'pl-fallback-001',
        home_team: 'Arsenal',
        away_team: 'Manchester City',
        league: 'premier-league',
        kickoff: nextSaturday.toISOString(),
        venue: 'Emirates Stadium',
        round: 'Matchweek 6',
        season: '2024-25',
        fixture_source: 'fallback',
        odds: { btts_yes: 1.75, btts_no: 2.10, bookmaker: 'FanDuel' }
      },
      {
        id: 'pl-fallback-002',
        home_team: 'Liverpool', 
        away_team: 'Manchester United',
        league: 'premier-league',
        kickoff: nextSunday.toISOString(),
        venue: 'Anfield',
        round: 'Matchweek 6',
        season: '2024-25', 
        fixture_source: 'fallback',
        odds: { btts_yes: 1.65, btts_no: 2.25, bookmaker: 'DraftKings' }
      }
    ],
    'bundesliga': [
      {
        id: 'bun-fallback-001',
        home_team: 'Bayern Munich',
        away_team: 'Borussia Dortmund',
        league: 'bundesliga',
        kickoff: nextSaturday.toISOString(),
        venue: 'Allianz Arena',
        round: 'Matchday 5',
        season: '2024-25',
        fixture_source: 'fallback',
        odds: { btts_yes: 1.55, btts_no: 2.45, bookmaker: 'BetMGM' }
      }
    ],
    'champions-league': [
      {
        id: 'ucl-fallback-001',
        home_team: 'Barcelona',
        away_team: 'PSG', 
        league: 'champions-league',
        kickoff: new Date(nextSaturday.getTime() + 3 * 24 * 3600000).toISOString(), // Tuesday
        venue: 'Camp Nou',
        round: 'Group Stage - MD 2',
        season: '2024-25',
        fixture_source: 'fallback',
        odds: { btts_yes: 1.70, btts_no: 2.15, bookmaker: 'BetMGM' }
      }
    ]
  };
  
  return fixtures[league] || [];
}

// Mock odds bridge - in production, this would fetch from your odds API
async function fetchBTTSOdds(league, fixtures) {
  // Simulate odds fetching with realistic prices
  return fixtures.map(fixture => {
    if (fixture.odds) return fixture; // Already has odds from fallback
    
    // Generate realistic odds based on team strength
    const attackingTeams = ['Liverpool', 'Manchester City', 'Bayern Munich', 'Barcelona', 'Real Madrid', 'Arsenal'];
    const defensiveTeams = ['Atletico Madrid', 'Juventus', 'Chelsea'];
    
    let baseYesOdds = 1.75;
    
    const homeAttacking = attackingTeams.includes(fixture.home_team);
    const awayAttacking = attackingTeams.includes(fixture.away_team);
    const homeDefensive = defensiveTeams.includes(fixture.home_team);
    const awayDefensive = defensiveTeams.includes(fixture.away_team);
    
    if (homeAttacking && awayAttacking) {
      baseYesOdds = 1.50; // Both attacking = likely BTTS
    } else if (homeDefensive || awayDefensive) {
      baseYesOdds = 2.20; // Defensive teams = less likely BTTS
    }
    
    const variation = (Math.random() - 0.5) * 0.3;
    const yesOdds = Math.max(1.30, Math.min(3.00, baseYesOdds + variation));
    
    const yesImplied = 1 / yesOdds;
    const targetOverround = 1.05;
    const noImplied = targetOverround - yesImplied;
    const noOdds = Math.max(1.20, 1 / noImplied);
    
    return {
      ...fixture,
      odds: {
        btts_yes: Math.round(yesOdds * 100) / 100,
        btts_no: Math.round(noOdds * 100) / 100,
        bookmaker: ['FanDuel', 'DraftKings', 'BetMGM', 'Caesars'][Math.floor(Math.random() * 4)]
      }
    };
  });
}

// Enhanced team stats with Bundesliga teams and Champions League
const MOCK_TEAM_STATS = {
  'Manchester City': {
    name: 'Manchester City',
    games_home: 15, goals_scored_home: 28, goals_conceded_home: 8,
    games_away: 15, goals_scored_away: 22, goals_conceded_away: 12,
    btts_rate_home: 0.60, btts_rate_away: 0.55
  },
  'Arsenal': {
    name: 'Arsenal', 
    games_home: 15, goals_scored_home: 25, goals_conceded_home: 10,
    games_away: 15, goals_scored_away: 20, goals_conceded_away: 15,
    btts_rate_home: 0.55, btts_rate_away: 0.58
  },
  'Liverpool': {
    name: 'Liverpool',
    games_home: 15, goals_scored_home: 30, goals_conceded_home: 12,
    games_away: 15, goals_scored_away: 24, goals_conceded_away: 18,
    btts_rate_home: 0.65, btts_rate_away: 0.62
  },
  'Manchester United': {
    name: 'Manchester United',
    games_home: 15, goals_scored_home: 18, goals_conceded_home: 16,
    games_away: 15, goals_scored_away: 16, goals_conceded_away: 22,
    btts_rate_home: 0.58, btts_rate_away: 0.64
  },
  'Bayern Munich': {
    name: 'Bayern Munich',
    games_home: 12, goals_scored_home: 35, goals_conceded_home: 8,
    games_away: 12, goals_scored_away: 28, goals_conceded_away: 14,
    btts_rate_home: 0.75, btts_rate_away: 0.70
  },
  'Borussia Dortmund': {
    name: 'Borussia Dortmund', 
    games_home: 12, goals_scored_home: 26, goals_conceded_home: 15,
    games_away: 12, goals_scored_away: 22, goals_conceded_away: 20,
    btts_rate_home: 0.80, btts_rate_away: 0.75
  },
  'Barcelona': {
    name: 'Barcelona',
    games_home: 10, goals_scored_home: 24, goals_conceded_home: 9,
    games_away: 10, goals_scored_away: 18, goals_conceded_away: 12,
    btts_rate_home: 0.70, btts_rate_away: 0.65
  },
  'PSG': {
    name: 'PSG',
    games_home: 10, goals_scored_home: 22, goals_conceded_home: 7,
    games_away: 10, goals_scored_away: 19, goals_conceded_away: 11,
    btts_rate_home: 0.60, btts_rate_away: 0.58
  }
};

exports.handler = async (event, context) => {
  try {
    const { league = 'premier-league', limit = 20, days = 7 } = event.queryStringParameters || {};
    
    // Safely coerce parameters
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const daysAhead = Math.max(1, Math.min(14, parseInt(days, 10) || 7));
    
    if (!LEAGUES[league]) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid league',
          available: Object.keys(LEAGUES)
        })
      };
    }

    const leagueConfig = LEAGUES[league];
    
    console.log(`Fetching fixtures for ${league}, next ${daysAhead} days, limit ${lim}`);
    
    // HYBRID APPROACH: Get fixtures from API, then enhance with odds
    const rawFixtures = await fetchLiveFixtures(league, daysAhead);
    const fixturesWithOdds = await fetchBTTSOdds(league, rawFixtures);
    
    // Apply limit and keep all fixtures (fetchBTTSOdds ensures odds are populated)
    const fixtures = fixturesWithOdds.slice(0, lim);
    
    if (fixtures.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          league: leagueConfig.name,
          season: leagueConfig.season,
          predictions: [],
          metadata: {
            total_fixtures: 0,
            generated_at: new Date().toISOString(),
            model_version: 'btts_v1.1_hybrid',
            league_btts_baseline: leagueConfig.btts_baseline,
            high_confidence: 0,
            message: 'No fixtures found for the specified period'
          }
        })
      };
    }
    
    const predictions = fixtures.map(fixture => {
      const homeTeam = MOCK_TEAM_STATS[fixture.home_team];
      const awayTeam = MOCK_TEAM_STATS[fixture.away_team];
      
      if (!homeTeam || !awayTeam) {
        return {
          fixture_id: fixture.id,
          home_team: fixture.home_team,
          away_team: fixture.away_team,
          league: leagueConfig.name,
          kickoff: fixture.kickoff,
          venue: fixture.venue,
          error: 'Team stats not available',
          fixture_source: fixture.fixture_source
        };
      }

      // Calculate Poisson lambdas and BTTS probability
      const lambdas = teamLambdas(homeTeam, awayTeam, leagueConfig);
      const modelProb = bttsProbFromLambdas(lambdas.home, lambdas.away);
      
      // Market analysis
      const marketYes = fixture.odds ? marketYesProbFromOdds(fixture.odds) : 0.5;
      const edge = modelProb - marketYes;
      const absEdge = Math.abs(edge);
      
      // Confidence and recommendation
      const confidence = calculateConfidence(modelProb, homeTeam, awayTeam, leagueConfig, marketYes, absEdge);
      const recommendation = recommendationFromEdge(modelProb, marketYes, confidence);
      
      const prediction = modelProb > 0.5 ? 'YES' : 'NO';

      // Add odds analysis if available
      const odds = fixture.odds || {};
      
      // Calculate fair market probabilities for transparency
      const rawYes = odds.btts_yes ? 1/odds.btts_yes : null;
      const rawNo = odds.btts_no ? 1/odds.btts_no : null;
      const fair = removeVigTwoWay(rawYes, rawNo);
      
      let valueBet = null;
      let recommendedStake = 0;
      let expectedValue = 0;

      if (odds.btts_yes && odds.btts_no) {
        const yesValueFraction = calculateValueBet(modelProb, odds.btts_yes, confidence);
        const noProbability = 1 - modelProb;
        const noValueFraction = calculateValueBet(noProbability, odds.btts_no, confidence);
        
        // Calculate expected values against fair market prices
        const yesExpectedValuePerUnit = (modelProb * (odds.btts_yes - 1)) - ((1 - modelProb) * 1);
        const noExpectedValuePerUnit = (noProbability * (odds.btts_no - 1)) - (modelProb * 1);

        // Choose the better value bet
        if (yesValueFraction > noValueFraction && yesValueFraction > 0) {
          valueBet = 'YES';
          recommendedStake = yesValueFraction;
          expectedValue = yesExpectedValuePerUnit;
        } else if (noValueFraction > 0) {
          valueBet = 'NO'; 
          recommendedStake = noValueFraction;
          expectedValue = noExpectedValuePerUnit;
        }
      }

      return {
        fixture_id: fixture.id,
        matchup: `${fixture.away_team} @ ${fixture.home_team}`,
        home_team: fixture.home_team,
        away_team: fixture.away_team,
        league: leagueConfig.name,
        kickoff: fixture.kickoff,
        venue: fixture.venue,
        round: fixture.round || 'Unknown',
        season: fixture.season || leagueConfig.season,
        fixture_source: fixture.fixture_source,
        btts_prediction: prediction,
        btts_probability: Math.round(modelProb * 100) / 100,
        confidence: Math.round(confidence),
        edge_pct: Math.round(edge * 1000) / 10,
        edge_pct_abs: Math.round(Math.abs(edge) * 1000) / 10,
        recommendation: recommendation,
        // Odds information
        market_odds: {
          btts_yes: odds.btts_yes || null,
          btts_no: odds.btts_no || null,
          btts_yes_american: odds.btts_yes ? toAmericanOdds(odds.btts_yes) : null,
          btts_no_american: odds.btts_no ? toAmericanOdds(odds.btts_no) : null,
          btts_yes_american_numeric: odds.btts_yes ? toAmericanOddsNumeric(odds.btts_yes) : null,
          btts_no_american_numeric: odds.btts_no ? toAmericanOddsNumeric(odds.btts_no) : null,
          bookmaker: odds.bookmaker || null,
          implied_prob_yes: odds.btts_yes ? (1 / odds.btts_yes) : null,
          implied_prob_no: odds.btts_no ? (1 / odds.btts_no) : null,
          fair_prob_yes: fair.yes ?? null,
          fair_prob_no: fair.no ?? null,
          overround: fair.overround ?? null
        },
        // Value betting analysis (stake_fraction = % of bankroll)
        value_bet: {
          selection: valueBet,
          stake_fraction: recommendedStake > 0 ? Math.round(recommendedStake * 1000) / 1000 : 0,
          expected_value: Math.round(expectedValue * 1000) / 1000
        },
        factors: {
          lambda_home: Math.round(lambdas.home * 100) / 100,
          lambda_away: Math.round(lambdas.away * 100) / 100,
          home_goals_pg: Math.round((homeTeam.goals_scored_home / homeTeam.games_home) * 10) / 10,
          away_goals_pg: Math.round((awayTeam.goals_scored_away / awayTeam.games_away) * 10) / 10,
          home_conceded_pg: Math.round((homeTeam.goals_conceded_home / homeTeam.games_home) * 10) / 10, 
          away_conceded_pg: Math.round((awayTeam.goals_conceded_away / awayTeam.games_away) * 10) / 10,
          home_btts_rate: homeTeam.btts_rate_home,
          away_btts_rate: awayTeam.btts_rate_away
        }
      };
    });

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        league: leagueConfig.name,
        season: leagueConfig.season,
        predictions: predictions,
        metadata: {
          total_fixtures: predictions.length,
          api_fixtures: rawFixtures.length,
          days_ahead: daysAhead,
          generated_at: new Date().toISOString(),
          model_version: 'btts_v1.1_hybrid',
          league_btts_baseline: leagueConfig.btts_baseline,
          high_confidence: predictions.filter(p => p.confidence >= 65).length,
          fixture_sources: {
            api: predictions.filter(p => p.fixture_source === 'api').length,
            fallback: predictions.filter(p => p.fixture_source === 'fallback').length
          }
        }
      })
    };

  } catch (error) {
    console.error('BTTS Prediction Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Prediction generation failed',
        details: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};