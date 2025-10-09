/**
 * NFL TD Live Odds Debug Script
 * 
 * Run this in your browser console on the NFL TD page to diagnose issues
 * 
 * Usage:
 * 1. Go to your NFL TD Advanced/Comprehensive page
 * 2. Open browser console (F12)
 * 3. Paste this entire script and hit Enter
 * 4. Check the output for issues
 */

console.log('🔍 NFL TD Live Odds Debug Script Starting...');

async function debugNFLTDOdds() {
  try {
    console.group('🎯 NFL TD Live Odds Diagnostic');
    
    // Test 1: Check if API endpoints are accessible
    console.log('\n📡 Testing API Endpoints...');
    
    const apiUrls = [
      '/api/nfl-td-predictions-enhanced?type=all&top_n=10&min_confidence=low',
      '/.netlify/functions/nfl-td-predictions-enhanced?type=all&top_n=10&min_confidence=low'
    ];
    
    for (const url of apiUrls) {
      try {
        console.log(`Testing: ${url}`);
        const response = await fetch(url);
        console.log(`✅ ${url} - Status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`📊 Response format:`, {
            success: data.success,
            predictionsCount: data.predictions?.length || 0,
            samplePrediction: data.predictions?.[0] || null
          });
          
          // Check if predictions have live odds
          if (data.predictions && data.predictions.length > 0) {
            const firstPred = data.predictions[0];
            console.log(`🎲 First prediction odds check:`, {
              playerName: firstPred.name || firstPred.player_name,
              hasLiveOdds: !!firstPred.live_odds,
              oddsQualified: firstPred.odds_qualified,
              whitelistedBooksOnly: firstPred.whitelisted_books_only,
              liveOddsStructure: firstPred.live_odds,
              bestBook: firstPred.best_book,
              americanOdds: firstPred.american_odds,
              reliability: firstPred.metadata?.data_reliability || firstPred.reliability_raw_percent
            });
          }
        } else {
          const errorText = await response.text();
          console.error(`❌ ${url} failed:`, errorText);
        }
      } catch (apiError) {
        console.error(`❌ ${url} error:`, apiError.message);
      }
    }
    
    // Test 2: Check environment variables (client-side detection)
    console.log('\n🔐 Environment Check...');
    console.log('Note: THEODDS_API_KEY should be set on server, not visible here');
    
    // Test 3: Check current page data source
    console.log('\n📄 Current Page Data Analysis...');
    
    // Look for any prediction data in the page
    const pageText = document.body.innerText;
    const hasNoApprovedLines = pageText.includes('No approved market lines');
    const hasModelEstimate = pageText.includes('Model Estimate');
    const hasReliability7 = pageText.includes('Reliability: 7%');
    const hasLiveOdds = pageText.includes('FanDuel') || pageText.includes('DraftKings');
    
    console.log('Page content analysis:', {
      hasNoApprovedLines,
      hasModelEstimate,
      hasReliability7,
      hasLiveOdds,
      pageContainsBET: pageText.includes('BET'),
      pageContainsBETTER: pageText.includes('BETTER')
    });
    
    // Test 4: Check if page is using the hook or manual fetch
    console.log('\n🪝 Data Loading Method Detection...');
    
    // Check network tab for what's actually being called
    console.log('Check Network tab for actual API calls being made');
    console.log('Expected: /api/nfl-td-predictions-enhanced OR /.netlify/functions/nfl-td-predictions-enhanced');
    console.log('Unwanted: /nfl-anytime-td-player-data.json (static file)');
    
    // Test 5: TheOddsAPI test (if we can access it from client)
    console.log('\n🎰 TheOdds API Test...');
    console.log('Note: This will likely fail due to CORS, but server should access it');
    
    try {
      // This will probably fail due to CORS, but worth trying
      const oddsTest = await fetch('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=player_anytime_td&apiKey=test');
      console.log('🔍 TheOdds API accessible from client (unexpected)');
    } catch (corsError) {
      console.log('✅ TheOdds API blocked by CORS (expected - server should handle this)');
    }
    
    // Test 6: Check what data structure the page expects
    console.log('\n🏗️ Expected Data Structure Check...');
    
    const sampleExpectedStructure = {
      success: true,
      predictions: [{
        name: "Player Name",
        american_odds: 150,
        best_book: "FanDuel", 
        live_odds: {
          anytime_td: [{book: "FanDuel", american_odds: 150}]
        },
        odds_qualified: true,
        whitelisted_books_only: true,
        metadata: {
          data_reliability: 0.75  // Should be 0.3-0.95, NOT 0.07
        }
      }]
    };
    
    console.log('Expected successful response structure:', sampleExpectedStructure);
    
    console.groupEnd();
    
    // Final summary
    console.log('\n📋 DEBUG SUMMARY:');
    console.log('1. Check which API URL works (test results above)');
    console.log('2. Verify THEODDS_API_KEY is set in Netlify Environment Variables');
    console.log('3. Confirm page is calling API, not static JSON files');
    console.log('4. Look for odds_qualified: true and whitelisted_books_only: true');
    console.log('5. Reliability should be 30-95%, not 7%');
    
  } catch (error) {
    console.error('❌ Debug script failed:', error);
  }
}

// Run the debug
debugNFLTDOdds();