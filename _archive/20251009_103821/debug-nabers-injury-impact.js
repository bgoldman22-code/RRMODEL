// Debug script to trace exactly how Malik Nabers injury affects predictions
// This will show step-by-step calculation details and score adjustments

console.log('🔬 TRACING MALIK NABERS INJURY IMPACT ON PREDICTIONS');
console.log('='.repeat(70));

async function debugNabersInjuryImpact() {
  try {
    // STEP 1: Get current injury data and verify Nabers status
    console.log('\n📊 STEP 1: Verifying Malik Nabers Injury Status...');
    
    // Test NYG specifically since that's where Nabers is
    const nygInjuryResponse = await fetch('https://bgroundrobin.com/.netlify/functions/test-simple-injuries', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!nygInjuryResponse.ok) {
      throw new Error(`NYG injury API failed: ${nygInjuryResponse.status}`);
    }
    
    const nygInjuryData = await nygInjuryResponse.json();
    console.log('✅ NYG Injury Data Retrieved:');
    console.log(`   Team: ${nygInjuryData.team}`);
    console.log(`   Total Injuries: ${nygInjuryData.injuryCount}`);
    
    // Find Malik Nabers specifically
    const nabersInjury = nygInjuryData.injuries.find(inj => 
      inj.player.toLowerCase().includes('nabers') || 
      inj.player.toLowerCase().includes('malik')
    );
    
    if (nabersInjury) {
      console.log('\n🎯 MALIK NABERS INJURY FOUND:');
      console.log(`   Name: ${nabersInjury.player}`);
      console.log(`   Position: ${nabersInjury.position}`);
      console.log(`   Status: ${nabersInjury.status}`);
      console.log(`   Description: ${nabersInjury.description}`);
      console.log(`   Last Updated: ${nabersInjury.lastUpdated}`);
    } else {
      console.log('❌ Malik Nabers not found in current injury data');
      console.log('   Available injured players:');
      nygInjuryData.injuries.forEach(inj => {
        if (inj.status !== 'Active') {
          console.log(`     ${inj.player} (${inj.position}): ${inj.status}`);
        }
      });
    }
    
    // STEP 2: Run prediction with enhanced debug logging
    console.log('\n📈 STEP 2: Running Prediction with Debug Logging...');
    
    const debugPredictionResponse = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        games: [
          { home_team: 'DAL', away_team: 'NYG' } // NYG has Nabers injury
        ],
        debug: true,
        verbose: true,
        includeInjuryBreakdown: true,
        tracingMode: true
      })
    });
    
    if (!debugPredictionResponse.ok) {
      throw new Error(`Debug prediction failed: ${debugPredictionResponse.status}`);
    }
    
    const debugData = await debugPredictionResponse.json();
    console.log('✅ Debug Prediction Data Retrieved');
    
    const prediction = debugData.predictions[0];
    
    // STEP 3: Analyze the prediction for injury traces
    console.log('\n🔍 STEP 3: Analyzing Prediction for Injury Impact Traces...');
    
    console.log('\n--- BASIC PREDICTION DATA ---');
    console.log(`Game: ${prediction.away_team} @ ${prediction.home_team}`);
    console.log(`Home Win Prob: ${(prediction.predictions.home_win_prob * 100).toFixed(1)}%`);
    console.log(`Away Win Prob: ${(prediction.predictions.away_win_prob * 100).toFixed(1)}%`);
    
    console.log('\n--- BETTING LINES ---');
    console.log(`Moneyline Pick: ${prediction.predictions.moneyline.pick} (${prediction.predictions.moneyline.confidence}% confidence)`);
    console.log(`Spread Pick: ${prediction.predictions.spread.pick} at ${prediction.predictions.spread.line}`);
    console.log(`Predicted Spread: ${prediction.predictions.spread.predicted}`);
    console.log(`Total Pick: ${prediction.predictions.total.pick} (line: ${prediction.predictions.total.line}, predicted: ${prediction.predictions.total.predicted})`);
    
    // STEP 4: Look for injury-specific data in the response
    console.log('\n🔬 STEP 4: Searching for Injury Impact Evidence...');
    
    // Check model enhancements for diagnostics
    if (prediction.modelEnhancements?.diagnostics) {
      const diagnostics = prediction.modelEnhancements.diagnostics;
      
      console.log('\n--- DIAGNOSTIC DATA ---');
      console.log(`Home Score: ${diagnostics.homeScore}`);
      console.log(`Away Score: ${diagnostics.awayScore}`);
      console.log(`Score Difference: ${diagnostics.scoreDiff}`);
      
      if (diagnostics.injuryAdjustments) {
        console.log('\n🏥 INJURY ADJUSTMENTS FOUND:');
        console.log(JSON.stringify(diagnostics.injuryAdjustments, null, 2));
      }
      
      if (diagnostics.gameContext) {
        console.log('\n--- GAME CONTEXT ---');
        console.log(`Major Injuries: ${diagnostics.gameContext.majorInjuries}`);
        console.log(`Week: ${diagnostics.gameContext.week}`);
        console.log(`Divisional: ${diagnostics.gameContext.divisional}`);
        
        if (diagnostics.gameContext.injuryDetails) {
          console.log('\n🎯 INJURY DETAILS:');
          console.log(JSON.stringify(diagnostics.gameContext.injuryDetails, null, 2));
        }
      }
    }
    
    // STEP 5: Check the raw response for any mention of injuries or Nabers
    console.log('\n🔍 STEP 5: Scanning Response for Injury Keywords...');
    
    const responseText = JSON.stringify(prediction, null, 2);
    const injuryKeywords = ['nabers', 'malik', 'injury', 'injured', 'out', 'ir', 'reserve'];
    
    injuryKeywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = responseText.match(regex);
      if (matches) {
        console.log(`   Found "${keyword}": ${matches.length} occurrence(s)`);
        
        // Show context around the keyword
        const lines = responseText.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(keyword.toLowerCase())) {
            console.log(`     Line ${idx}: ${line.trim()}`);
          }
        });
      }
    });
    
    // STEP 6: Compare with a control game (no major injuries)
    console.log('\n⚖️ STEP 6: Control Comparison (Game Without Major Injuries)...');
    
    const controlResponse = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        games: [
          { home_team: 'KC', away_team: 'LV' } // Control game
        ],
        debug: true
      })
    });
    
    if (controlResponse.ok) {
      const controlData = await controlResponse.json();
      const controlPrediction = controlData.predictions[0];
      
      console.log('\n--- CONTROL GAME (KC vs LV) ---');
      console.log(`Home Win Prob: ${(controlPrediction.predictions.home_win_prob * 100).toFixed(1)}%`);
      console.log(`Spread: ${controlPrediction.predictions.spread.line}`);
      console.log(`Confidence: ML ${controlPrediction.predictions.moneyline.confidence}%, Spread ${controlPrediction.predictions.spread.confidence}%`);
      
      if (controlPrediction.modelEnhancements?.diagnostics) {
        console.log(`Control Scores - Home: ${controlPrediction.modelEnhancements.diagnostics.homeScore}, Away: ${controlPrediction.modelEnhancements.diagnostics.awayScore}`);
      }
      
      // Compare confidence levels
      const nygConfidence = prediction.predictions.moneyline.confidence;
      const controlConfidence = controlPrediction.predictions.moneyline.confidence;
      const confidenceDiff = controlConfidence - nygConfidence;
      
      console.log(`\n📊 CONFIDENCE COMPARISON:`);
      console.log(`   NYG Game Confidence: ${nygConfidence}%`);
      console.log(`   Control Game Confidence: ${controlConfidence}%`);
      console.log(`   Difference: ${confidenceDiff > 0 ? '+' : ''}${confidenceDiff}% ${confidenceDiff > 0 ? '(injury game has lower confidence)' : '(injury game has higher confidence)'}`);
    }
    
    // STEP 7: Try to trigger the injury system directly
    console.log('\n🔧 STEP 7: Testing Direct Injury System Access...');
    
    const directInjuryResponse = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-injuries-comprehensive', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (directInjuryResponse.ok) {
      const directInjuryData = await directInjuryResponse.json();
      
      if (directInjuryData.teams?.NYG) {
        console.log('\n🏥 DIRECT INJURY SYSTEM - NYG DATA:');
        console.log(JSON.stringify(directInjuryData.teams.NYG, null, 2));
        
        // Look specifically for WR injuries or Nabers
        if (directInjuryData.teams.NYG.wr_injuries) {
          console.log('\n🎯 WR INJURIES FOUND:');
          directInjuryData.teams.NYG.wr_injuries.forEach(wr => {
            console.log(`   ${wr.name}: ${wr.status} (depth: ${wr.depth || 'unknown'})`);
            if (wr.name.toLowerCase().includes('nabers')) {
              console.log(`   🚨 MALIK NABERS DETECTED: ${wr.status}`);
            }
          });
        }
      } else {
        console.log('❌ No NYG data found in direct injury system');
      }
    } else {
      console.log(`❌ Direct injury system failed: ${directInjuryResponse.status}`);
    }
    
    console.log('\n🎯 SUMMARY:');
    console.log('='.repeat(40));
    console.log('This debug trace shows how the injury system processes data.');
    console.log('Look for:');
    console.log('• Malik Nabers in injury reports');
    console.log('• Score adjustments in diagnostics');
    console.log('• Confidence differences vs control games'); 
    console.log('• WR injury processing in direct system calls');
    
  } catch (error) {
    console.error('❌ Debug trace failed:', error);
  }
}

// Run the debug trace
debugNabersInjuryImpact();