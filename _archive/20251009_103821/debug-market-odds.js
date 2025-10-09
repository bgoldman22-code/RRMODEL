/**
 * Focused Market Odds Debug Script
 * 
 * Run this in browser console on NFL TD page to check specifically why Market Odds aren't showing
 */

console.log('🎯 Market Odds Debug - Starting...');

async function debugMarketOdds() {
  try {
    // Test the correct API endpoint
    console.log('📡 Fetching NFL TD predictions...');
    const response = await fetch('/.netlify/functions/nfl-td-predictions-enhanced?type=all&top_n=5&min_confidence=low');
    
    if (!response.ok) {
      console.error('❌ API Error:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ API Response received');
    
    // Check the first prediction for odds data
    const firstPred = data.predictions?.[0];
    if (!firstPred) {
      console.error('❌ No predictions found');
      return;
    }
    
    console.log('\n🎲 MARKET ODDS DEBUG for:', firstPred.name || firstPred.player_name);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check live odds structure
    console.log('📊 Live Odds Data:');
    console.log('  - Has live_odds:', !!firstPred.live_odds);
    console.log('  - live_odds type:', typeof firstPred.live_odds);
    console.log('  - live_odds content:', firstPred.live_odds);
    
    // Check qualification flags
    console.log('\n🏆 Qualification Status:');
    console.log('  - odds_qualified:', firstPred.odds_qualified);
    console.log('  - whitelisted_books_only:', firstPred.whitelisted_books_only);
    
    // Check odds info from API
    console.log('\n📈 API Odds Info:');
    console.log('  - odds_info:', data.odds_info);
    
    // Check what should show in Market Odds
    console.log('\n🎯 Market Odds Should Show:');
    if (firstPred.live_odds && Array.isArray(firstPred.live_odds) && firstPred.live_odds.length > 0) {
      firstPred.live_odds.forEach((odds, i) => {
        console.log(`  ${i + 1}. ${odds.bookmaker}: ${odds.odds} (${odds.market_type})`);
      });
    } else if (firstPred.american_odds && firstPred.best_book) {
      console.log(`  Fallback: ${firstPred.best_book} ${firstPred.american_odds}`);
    } else {
      console.log('  ❌ NO ODDS DATA AVAILABLE');
      console.log('  Reason: Missing live_odds AND missing american_odds/best_book');
    }
    
    console.log('\n💡 Summary:');
    if (data.odds_info?.source === 'live_api') {
      console.log('✅ Using LIVE API odds');
    } else {
      console.log('⚠️  Using FALLBACK odds');
      console.log('   - Check environment variable: THEODDS_API_KEY');
    }
    
  } catch (error) {
    console.error('❌ Debug Error:', error);
  }
}

debugMarketOdds();