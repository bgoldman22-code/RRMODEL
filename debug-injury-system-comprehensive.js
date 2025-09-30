// debug-injury-system-comprehensive.js
// COMPREHENSIVE analysis of the entire injury system pipeline

import fetch from 'node-fetch';

async function debugComprehensiveInjurySystem() {
  console.log('🔧 === COMPREHENSIVE INJURY SYSTEM DEBUG ===\n');
  
  try {
    // 1. Test ESPN API directly for a known injured team
    console.log('📡 Testing ESPN API directly...');
    await testESPNAPI();
    
    // 2. Test our injury collection endpoint
    console.log('\n🏥 Testing injury collection endpoint...');
    await testInjuryCollection();
    
    // 3. Test how injuries affect predictions
    console.log('\n🎯 Testing injury impact on predictions...');
    await testPredictionImpact();
    
    // 4. Analyze the data flow
    console.log('\n🔍 Analyzing data flow...');
    await analyzeDataFlow();
    
  } catch (error) {
    console.error('❌ Comprehensive debug failed:', error);
  }
}

async function testESPNAPI() {
  // Test CIN (Joe Burrow should be injured)
  const teamId = '4'; // CIN
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/1.0)'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ ESPN API response for CIN:`, {
        totalInjuries: data.items?.length || 0,
        sampleRefs: data.items?.slice(0, 3)?.map(item => item.$ref) || []
      });
      
      // Try to fetch first injury detail
      if (data.items && data.items.length > 0) {
        try {
          const firstInjuryResponse = await fetch(data.items[0].$ref);
          if (firstInjuryResponse.ok) {
            const injuryDetail = await firstInjuryResponse.json();
            console.log('Sample injury detail:', {
              status: injuryDetail.status,
              description: injuryDetail.description,
              athlete: injuryDetail.athlete?.$ref
            });
          }
        } catch (detailError) {
          console.log('⚠️ Could not fetch injury detail:', detailError.message);
        }
      }
    } else {
      console.log(`❌ ESPN API failed:`, response.status, response.statusText);
    }
  } catch (error) {
    console.log(`❌ ESPN API error:`, error.message);
  }
}

async function testInjuryCollection() {
  try {
    const response = await fetch('https://rrmodel.netlify.app/.netlify/functions/nfl-injuries-collect');
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Injury collection response:', {
        success: data.success,
        message: data.message,
        teams: data.teams
      });
      
      // Check if CIN data shows Joe Burrow as out
      if (data.sample && data.sample.CIN) {
        console.log('CIN injury data:', data.sample.CIN);
      }
    } else {
      console.log(`❌ Injury collection failed:`, response.status);
    }
  } catch (error) {
    console.log(`❌ Injury collection error:`, error.message);
  }
}

async function testPredictionImpact() {
  try {
    // Test with CIN @ DEN game specifically
    const response = await fetch('https://rrmodel.netlify.app/.netlify/functions/nfl-predictions-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: 'cin_den_week5',
        home_team: 'DEN',
        away_team: 'CIN'
      })
    });
    
    if (response.ok) {
      const predictions = await response.json();
      console.log('✅ Prediction generated');
      
      // Look for injury impact indicators
      const injuryMentions = JSON.stringify(predictions).toLowerCase().match(/injur/g)?.length || 0;
      const burrowMentions = JSON.stringify(predictions).toLowerCase().match(/burrow/g)?.length || 0;
      
      console.log('Injury system indicators:', {
        injuryMentions,
        burrowMentions,
        hasInjuryData: !!predictions.metadata?.injury_data,
        injuryTransparency: predictions.metadata?.injury_transparency
      });
      
    } else {
      console.log(`❌ Prediction generation failed:`, response.status);
    }
  } catch (error) {
    console.log(`❌ Prediction test error:`, error.message);
  }
}

async function analyzeDataFlow() {
  console.log('🔍 Data Flow Analysis:');
  console.log('1. ESPN API → fetch team injuries (complex nested calls)');
  console.log('2. Manual overrides → should supplement ESPN data');
  console.log('3. Dynamic impact calculation → should apply injury effects');
  console.log('4. Blob storage → cache injury data for R pipeline');
  console.log('5. Prediction generation → should use injury data');
  
  console.log('\n🎯 Key Questions:');
  console.log('- Is ESPN API actually returning injury data?');
  console.log('- Are manual overrides being applied correctly?');
  console.log('- Is the dynamic impact calculation working?');
  console.log('- Are predictions actually using the injury data?');
  
  console.log('\n🔧 Potential Issues:');
  console.log('- ESPN API rate limiting or structure changes');
  console.log('- Manual override logic not integrated properly');
  console.log('- Dynamic impact not applied to final predictions');
  console.log('- Week detection issues affecting injury relevance');
}

debugComprehensiveInjurySystem();