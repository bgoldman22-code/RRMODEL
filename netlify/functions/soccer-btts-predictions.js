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

// Sample fixtures for demonstration with mock odds
const SAMPLE_FIXTURES = [
  {
    id: 'pl-001',
    home_team: 'Arsenal',
    away_team: 'Manchester City', 
    league: 'premier-league',
    kickoff: '2025-01-15T17:30:00Z',
    venue: 'Emirates Stadium',
    odds: {
      btts_yes: 1.75,  // -133 in American odds
      btts_no: 2.10,   // +110 in American odds
      bookmaker: 'FanDuel'
    }
  },
  {
    id: 'pl-002', 
    home_team: 'Liverpool',
    away_team: 'Manchester United',
    league: 'premier-league', 
    kickoff: '2025-01-15T20:00:00Z',
    venue: 'Anfield',
    odds: {
      btts_yes: 1.65,  // -154 in American odds  
      btts_no: 2.25,   // +125 in American odds
      bookmaker: 'DraftKings'
    }
  },
  {
    id: 'bun-001',
    home_team: 'Bayern Munich',
    away_team: 'Borussia Dortmund',
    league: 'bundesliga',
    kickoff: '2025-01-16T14:30:00Z', 
    venue: 'Allianz Arena',
    odds: {
      btts_yes: 1.55,  // -182 in American odds
      btts_no: 2.45,   // +145 in American odds
      bookmaker: 'BetMGM'
    }
  }
];

// Enhanced team stats with Bundesliga teams
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
  }
};

exports.handler = async (event, context) => {
  try {
    const { league = 'premier-league', limit = 20 } = event.queryStringParameters || {};
    
    // Safely coerce limit to prevent string/NaN issues
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    
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
    
    // Get fixtures (mock data for now)
    const fixtures = SAMPLE_FIXTURES.filter(f => f.league === league).slice(0, lim);
    
    const predictions = fixtures.map(fixture => {
      const homeTeam = MOCK_TEAM_STATS[fixture.home_team];
      const awayTeam = MOCK_TEAM_STATS[fixture.away_team];
      
      if (!homeTeam || !awayTeam) {
        return {
          fixture_id: fixture.id,
          home_team: fixture.home_team,
          away_team: fixture.away_team,
          error: 'Team stats not available'
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
          generated_at: new Date().toISOString(),
          model_version: 'btts_v1.0',
          league_btts_baseline: leagueConfig.btts_baseline,
          high_confidence: predictions.filter(p => p.confidence >= 65).length
        }
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Prediction generation failed',
        details: error.message
      })
    };
  }
};