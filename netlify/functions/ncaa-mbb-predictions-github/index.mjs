// NCAA MBB Predictions Function - GitHub Fetch Version
// Fetches pre-generated picks from NCAA MBB Model GitHub repository

export default async function handler(event, context) {
  console.log('[NCAA MBB] Starting predictions (GitHub fetch mode)...');
  
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    console.log(`[NCAA MBB] Fetching predictions for ${today}`);
    
    // Fetch picks from GitHub raw URL
    const githubRawUrl = `https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_${today}.json`;
    
    console.log(`[NCAA MBB] Fetching from: ${githubRawUrl}`);
    
    const response = await fetch(githubRawUrl);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[NCAA MBB] No picks found for ${today}`);
        return new Response(JSON.stringify({
          ok: false,
          message: `No games available for ${today}. Picks are generated daily at 10 AM ET.`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`[NCAA MBB] Found ${data.num_picks} picks for ${today}`);
    
    // Transform to frontend format
    const transformed = transformPicks(data, today);
    
    return new Response(JSON.stringify({
      ok: true,
      predictions: transformed.predictions,
      metadata: transformed.metadata,
      generated: new Date().toISOString(),
      source: 'github'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900'
      }
    });
    
  } catch (error) {
    console.error('[NCAA MBB] Error:', error);
    
    return new Response(JSON.stringify({
      ok: false,
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function transformPicks(data, date) {
  const picks = (data.picks || []).map(pick => {
    const favorite = pick.side === 'home' ? pick.home_team : pick.away_team;
    const underdog = pick.side === 'home' ? pick.away_team : pick.home_team;
    const favoriteOdds = pick.odds;
    let underdogOdds;
    if (favoriteOdds < 0) {
      underdogOdds = Math.round((Math.abs(favoriteOdds) / (Math.abs(favoriteOdds) - 100)) * 100);
    } else {
      underdogOdds = -Math.round((favoriteOdds * 100) / (favoriteOdds + 100));
    }
    
    return {
      game: `${pick.away_team} @ ${pick.home_team}`,
      awayTeam: pick.away_team,
      homeTeam: pick.home_team,
      prediction: {
        pick: favorite,
        side: pick.side,
        confidence: Math.round(pick.edge * 100),
        winProbability: {
          favoriteTeam: favorite,
          favoritePercent: pick.model_prob * 100,
          underdogTeam: underdog,
          underdogPercent: (1 - pick.model_prob) * 100
        }
      },
      vegasLines: {
        moneyline: {
          favorite: favoriteOdds,
          favoriteTeam: favorite,
          underdog: underdogOdds,
          underdogTeam: underdog
        }
      },
      betting: {
        edge: pick.edge,
        recommendedStake: pick.bet_size_dollars,
        kellyFraction: data.kelly_fraction || 0.25,
        maxExposure: pick.bet_size_dollars
      },
      metadata: {
        date: date,
        model: 'NCAA Variant B',
        minEdge: data.min_edge || 0.1,
        market: pick.market
      }
    };
  });
  
  return {
    predictions: picks,
    metadata: {
      totalPicks: data.num_picks || picks.length,
      totalStake: data.total_bet_size || picks.reduce((sum, p) => sum + p.betting.recommendedStake, 0),
      avgEdge: data.avg_edge || (picks.length > 0 ? picks.reduce((sum, p) => sum + p.betting.edge, 0) / picks.length : 0),
      maxEdge: data.max_edge || (picks.length > 0 ? Math.max(...picks.map(p => p.betting.edge)) : 0),
      date: date,
      bankroll: data.bankroll || 10000,
      model: 'NCAA Variant B',
      minEdge: data.min_edge || 0.1,
      kellyFraction: data.kelly_fraction || 0.25
    }
  };
}
