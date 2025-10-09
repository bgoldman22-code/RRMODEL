// Unbiased Web Console Test - Just Pull Raw Data
// Copy and paste this into your browser console to see what injury data exists

(async function pullRawInjuryData() {
  console.log('🔍 RAW INJURY DATA DISCOVERY TEST');
  console.log('='.repeat(50));
  console.log('📋 This test just shows what data exists - no calculations');
  
  let foundData = {};
  let dataSource = 'none';
  
  // 1. Try fetching from potential endpoints
  console.log('\n📡 CHECKING API ENDPOINTS:');
  const endpoints = [
    '/data/nfl/injuries/latest.json',
    '/data/nfl-injuries-2025-week4.json', 
    '/api/nfl/injuries/current',
    './data/nfl/injuries/latest.json',
    'data/nfl/injuries/latest.json',
    '/netlify/functions/nfl-injuries-collect'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`   Trying: ${endpoint}`);
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ SUCCESS: Found data at ${endpoint}`);
        console.log(`   📊 Data structure:`, Object.keys(data));
        foundData = { ...foundData, [endpoint]: data };
        dataSource = endpoint;
      } else {
        console.log(`   ❌ ${response.status}: ${endpoint}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${endpoint} - ${e.message}`);
    }
  }
  
  // 2. Check for global window variables
  console.log('\n🌐 CHECKING WINDOW GLOBALS:');
  const globalVars = [
    'injuryData', 'nflInjuries', 'injuries', 'gameData', 
    'nflData', 'sportsData', 'predictions', 'teams'
  ];
  
  globalVars.forEach(varName => {
    try {
      const globalData = window[varName];
      if (globalData && typeof globalData === 'object') {
        console.log(`   ✅ Found: window.${varName}`);
        console.log(`   📊 Type: ${Array.isArray(globalData) ? 'Array' : 'Object'}`);
        console.log(`   📋 Keys:`, Object.keys(globalData).slice(0, 10));
        foundData[`window.${varName}`] = globalData;
      } else {
        console.log(`   ❌ window.${varName}: ${typeof globalData}`);
      }
    } catch (e) {
      console.log(`   ❌ window.${varName}: undefined`);
    }
  });
  
  // 3. Check DOM for data attributes or embedded JSON
  console.log('\n🏗️ CHECKING DOM FOR EMBEDDED DATA:');
  
  // Look for script tags with JSON data
  const scripts = document.querySelectorAll('script[type="application/json"], script[data-injury], script[data-nfl]');
  scripts.forEach((script, idx) => {
    try {
      const data = JSON.parse(script.textContent);
      console.log(`   ✅ Found JSON in script tag ${idx + 1}`);
      console.log(`   📊 Keys:`, Object.keys(data).slice(0, 10));
      foundData[`dom-script-${idx}`] = data;
    } catch (e) {
      console.log(`   ❌ Script ${idx + 1}: Not valid JSON`);
    }
  });
  
  // Look for data attributes
  const dataElements = document.querySelectorAll('[data-injury], [data-nfl], [data-teams], [data-games]');
  dataElements.forEach((el, idx) => {
    console.log(`   📋 Found element with data attributes: ${el.tagName}`);
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('data-')) {
        console.log(`     ${attr.name}: ${attr.value.substring(0, 100)}...`);
      }
    });
  });
  
  // 4. Show raw findings
  console.log('\n📊 RAW DATA SUMMARY:');
  console.log('='.repeat(50));
  
  if (Object.keys(foundData).length === 0) {
    console.log('❌ NO INJURY DATA FOUND');
    console.log('   The site may not have injury data loaded yet');
    console.log('   Or it might be loaded dynamically after page load');
    
    // Check for common frameworks that might load data async
    console.log('\n🔍 Checking for async data loading...');
    if (window.React) console.log('   📱 React detected - data may load after render');
    if (window.Vue) console.log('   📱 Vue detected - data may load after mount');
    if (window.jQuery) console.log('   📱 jQuery detected - data may load via AJAX');
    
  } else {
    console.log(`✅ FOUND ${Object.keys(foundData).length} DATA SOURCES:`);
    
    Object.entries(foundData).forEach(([source, data]) => {
      console.log(`\n📍 SOURCE: ${source}`);
      
      if (data && typeof data === 'object') {
        // Look for team data
        const possibleTeams = Object.keys(data).filter(key => 
          key.length === 3 && key.match(/^[A-Z]{3}$/) // NFL team codes
        );
        
        if (possibleTeams.length > 0) {
          console.log(`   🏈 Potential NFL teams found: ${possibleTeams.slice(0, 5).join(', ')}${possibleTeams.length > 5 ? '...' : ''}`);
          
          // Show sample team data
          const sampleTeam = data[possibleTeams[0]];
          if (sampleTeam) {
            console.log(`   📋 Sample team (${possibleTeams[0]}) structure:`);
            console.log('     Keys:', Object.keys(sampleTeam));
            
            // Look for injury-related fields
            Object.keys(sampleTeam).forEach(key => {
              if (key.toLowerCase().includes('injur') || 
                  key.toLowerCase().includes('status') ||
                  key.toLowerCase().includes('qb') ||
                  key.toLowerCase().includes('player')) {
                console.log(`     🏥 ${key}:`, sampleTeam[key]);
              }
            });
          }
        } else {
          console.log('   📊 Top-level keys:', Object.keys(data).slice(0, 10));
          
          // Check if it's wrapped in a teams object
          if (data.teams) {
            console.log('   🏈 Found teams object with keys:', Object.keys(data.teams).slice(0, 10));
          }
        }
      }
    });
  }
  
  // 5. Store results globally for inspection
  window.rawInjuryTest = {
    timestamp: new Date().toISOString(),
    foundSources: Object.keys(foundData),
    data: foundData,
    summary: {
      totalSources: Object.keys(foundData).length,
      hasTeamData: Object.values(foundData).some(d => 
        d && typeof d === 'object' && Object.keys(d).some(k => k.match(/^[A-Z]{3}$/))
      )
    }
  };
  
  console.log('\n✅ Raw test complete! Results stored in window.rawInjuryTest');
  console.log('🔍 Type "rawInjuryTest" in console to inspect the full data');
  
  return window.rawInjuryTest;
  
})().catch(error => {
  console.error('❌ Raw data test failed:', error);
});