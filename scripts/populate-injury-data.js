#!/usr/bin/env node

// scripts/populate-injury-data.js
// One-time script to populate injury data and verify the pipeline works

import fetch from 'node-fetch';

async function populateInjuryData() {
  console.log('🏥 Populating NFL injury data...');
  
  const baseUrl = process.env.URL || 'https://main--dynamic-cajeta-e9ecb1.netlify.app';
  const injuryUrl = `${baseUrl}/.netlify/functions/nfl-injuries-collect`;
  
  console.log(`Calling: ${injuryUrl}`);
  
  try {
    const response = await fetch(injuryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ SUCCESS: Injury data populated!');
      console.log(`📊 Teams processed: ${result.teams}`);
      console.log(`🕐 As of: ${result.asOf}`);
      console.log('\n🎯 KEY FINDINGS:');
      
      if (result.sample?.WAS) {
        const wasData = result.sample.WAS;
        console.log(`WAS QB: ${wasData.qb_name} (${wasData.qb_status})`);
        console.log(`WAS RB injuries: ${wasData.rb_injuries?.length || 0}`);
        console.log(`WAS WR injuries: ${wasData.wr_injuries?.length || 0}`);
      }
      
      if (result.sample?.ATL) {
        const atlData = result.sample.ATL;  
        console.log(`ATL QB: ${atlData.qb_name} (${atlData.qb_status})`);
      }
      
      console.log('\n🚀 NEXT STEPS:');
      console.log('1. Refresh your NFL predictions page');
      console.log('2. Run: debugInjuries("ATL", "WAS") in browser console');
      console.log('3. You should see Jayden Daniels injury data!');
      
    } else {
      console.error('❌ FAILED:', result.error);
      console.log('💡 Trying in 30 seconds (deployment may be processing...)');
      setTimeout(() => populateInjuryData(), 30000);
    }
    
  } catch (error) {
    console.error('❌ Error calling injury function:', error.message);
    console.log('💡 Retrying in 30 seconds...');
    setTimeout(() => populateInjuryData(), 30000);
  }
}

// Call it
populateInjuryData();