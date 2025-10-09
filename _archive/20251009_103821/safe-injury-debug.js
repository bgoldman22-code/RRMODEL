/**
 * SIMPLE INJURY DEBUG SCRIPT - Error-Safe Version
 * This version handles JSON parse errors and provides detailed diagnostics
 */

async function safeDebugInjuries() {
  console.log('🔧 SAFE INJURY DEBUG - Starting...');
  console.log('=====================================');
  
  // Test 1: Check API endpoint status
  try {
    console.log('\n📡 Testing API Endpoint...');
    const apiResponse = await fetch('/api/nfl-td-predictions?type=raw&limit=1');
    console.log('API Response Status:', apiResponse.status);
    console.log('API Response Headers:', [...apiResponse.headers.entries()]);
    
    if (!apiResponse.ok) {
      console.log('❌ API returned error status');
      const errorText = await apiResponse.text();
      console.log('Error response (first 200 chars):', errorText.substring(0, 200));
      return;
    }
    
    // Try to get response as text first
    const responseText = await apiResponse.text();
    console.log('Response type check (first 100 chars):', responseText.substring(0, 100));
    
    // Check if it's HTML instead of JSON
    if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<html')) {
      console.log('❌ API returned HTML page instead of JSON');
      console.log('This usually means:');
      console.log('  - Netlify deployment is still in progress');
      console.log('  - The API endpoint path is incorrect');
      console.log('  - There was a build error');
      return;
    }
    
    // Try to parse as JSON
    let apiData;
    try {
      apiData = JSON.parse(responseText);
      console.log('✅ JSON parsed successfully');
    } catch (parseError) {
      console.log('❌ JSON parse failed:', parseError.message);
      console.log('Raw response preview:', responseText.substring(0, 500));
      return;
    }
    
    // Check data structure
    console.log('\n🔍 API Data Structure:');
    console.log('Top-level keys:', Object.keys(apiData));
    console.log('Games array length:', apiData.games?.length || 'No games array');
    
    if (apiData.games && apiData.games.length > 0) {
      const firstGame = apiData.games[0];
      console.log('First game keys:', Object.keys(firstGame));
      
      // Check for injury fields
      const hasInjuries = 'injuries' in firstGame;
      const hasHomeInjuries = 'home_injuries' in firstGame;
      const hasAwayInjuries = 'away_injuries' in firstGame;
      const hasQBStatus = 'qb_status' in firstGame;
      
      console.log('\n📋 Injury Field Check:');
      console.log('✅ injuries field:', hasInjuries, firstGame.injuries?.length || 'undefined');
      console.log('✅ home_injuries field:', hasHomeInjuries, firstGame.home_injuries?.length || 'undefined');
      console.log('✅ away_injuries field:', hasAwayInjuries, firstGame.away_injuries?.length || 'undefined');
      console.log('✅ qb_status field:', hasQBStatus, firstGame.qb_status || 'undefined');
      
      if (hasInjuries && firstGame.injuries && firstGame.injuries.length > 0) {
        console.log('\n🎉 SUCCESS! Injury data found in API response');
        console.log('Sample injury:', firstGame.injuries[0]);
        
        // Look for Washington injuries
        const wasInjuries = firstGame.injuries.filter(i => i.team === 'WAS');
        if (wasInjuries.length > 0) {
          console.log('\n🚨 Washington injuries found:', wasInjuries.length);
          wasInjuries.forEach(i => console.log(`  ${i.name} (${i.position}): ${i.status}`));
        }
      } else {
        console.log('\n⚠️ No injury data in games - this means the fix hasn\'t deployed yet');
      }
    }
    
  } catch (error) {
    console.log('❌ API test failed:', error.message);
  }
  
  // Test 2: Direct injury data file
  try {
    console.log('\n📊 Testing Direct Injury File...');
    const injuryResponse = await fetch('/data/nfl/injuries/latest.json');
    console.log('Injury file status:', injuryResponse.status);
    
    if (injuryResponse.ok) {
      const injuryText = await injuryResponse.text();
      
      // Check if it's valid JSON
      if (injuryText.trim().startsWith('{')) {
        const injuryData = JSON.parse(injuryText);
        console.log('✅ Direct injury file loaded successfully');
        console.log('Teams with data:', Object.keys(injuryData.teams || {}).length);
        
        if (injuryData.teams?.WAS) {
          console.log('✅ Washington data found');
          console.log('WAS QB Status:', injuryData.teams.WAS.qb_status);
          console.log('WAS QB Name:', injuryData.teams.WAS.qb_name);
        }
      } else {
        console.log('❌ Injury file contains HTML, not JSON');
      }
    } else {
      console.log('❌ Could not load injury file');
    }
  } catch (error) {
    console.log('❌ Direct injury file test failed:', error.message);
  }
  
  // Test 3: Netlify build status check
  console.log('\n🏗️ DEPLOYMENT STATUS CHECK:');
  console.log('If you see HTML instead of JSON, this usually means:');
  console.log('1. 🕐 Netlify is still building/deploying (wait 2-3 minutes)');
  console.log('2. 🔧 Build failed (check Netlify deploy logs)');
  console.log('3. 🛣️ API endpoint path changed or misconfigured');
  console.log('');
  console.log('✅ To check: Go to Netlify dashboard → Deploys → View latest');
  console.log('✅ Expected: Green checkmark with "Published" status');
  
  console.log('\n=====================================');
  console.log('🏁 SAFE INJURY DEBUG - Complete');
}

// Quick manual test
async function quickInjuryTest() {
  try {
    const response = await fetch('/data/nfl/injuries/latest.json');
    const data = await response.json();
    console.log('WAS injuries:', data.teams?.WAS);
  } catch (err) {
    console.log('Quick test failed:', err.message);
  }
}

// Run the safe debug
safeDebugInjuries();

// Provide manual alternatives
console.log('\n🛠️ MANUAL ALTERNATIVES:');
console.log('- Run: quickInjuryTest() for direct injury data');
console.log('- Check: Netlify dashboard for deployment status');
console.log('- Wait: 2-3 minutes if deployment is in progress');