/**
 * VERIFICATION SCRIPT: Check actual score values for Week 6 games
 * Purpose: Determine if remaining 10-point divergences are legitimate or errors
 */

import { readFile } from 'fs/promises';

async function main() {
  console.log('🔍 SCORE VALUE VERIFICATION\n');
  
  // Load the latest predictions
  const predictionsPath = '.netlify/blobs/deploy/predictions-cache/nfl-td/6_2024_predictions.json';
  
  try {
    const data = JSON.parse(await readFile(predictionsPath, 'utf-8'));
    const predictions = data.predictions || [];
    
    // Focus on the games with concerning divergences
    const targetGames = [
      { away: 'BUF', home: 'ATL' },  // 10.4 pt divergence
      { away: 'TEN', home: 'LV' },   // 10.3 pt divergence
      { away: 'SF', home: 'TB' },    // 7.9 pt divergence (improved)
      { away: 'CIN', home: 'GB' }    // 4.3 pt divergence (good)
    ];
    
    for (const target of targetGames) {
      const game = predictions.find(p => 
        p.away_team === target.away && p.home_team === target.home
      );
      
      if (!game) {
        console.log(`❌ Game not found: ${target.away} @ ${target.home}`);
        continue;
      }
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`GAME: ${target.away} @ ${target.home}`);
      console.log(`${'='.repeat(60)}`);
      
      // Extract diagnostic data if present
      const diagnostic = game.modelEnhancements?.diagnostic;
      if (diagnostic) {
        console.log('\n📊 RAW FEATURES:');
        console.log(`  Home Off EPA: ${diagnostic.features?.offEpa_home?.toFixed(4) || 'N/A'}`);
        console.log(`  Home Def EPA: ${diagnostic.features?.defEpa_home?.toFixed(4) || 'N/A'}`);
        console.log(`  Away Off EPA: ${diagnostic.features?.offEpa_away?.toFixed(4) || 'N/A'}`);
        console.log(`  Away Def EPA: ${diagnostic.features?.defEpa_away?.toFixed(4) || 'N/A'}`);
        console.log(`  Base Home Score: ${diagnostic.features?.base_home_score?.toFixed(4) || 'N/A'}`);
        console.log(`  Base Away Score: ${diagnostic.features?.base_away_score?.toFixed(4) || 'N/A'}`);
        
        console.log('\n⚙️  COMPUTATIONS:');
        console.log(`  Pre-Injury Home: ${diagnostic.comp?.preInjury_home_score?.toFixed(4) || 'N/A'}`);
        console.log(`  Pre-Injury Away: ${diagnostic.comp?.preInjury_away_score?.toFixed(4) || 'N/A'}`);
        console.log(`  Injury Impact Home: ${diagnostic.comp?.injury_home_total?.toFixed(2) || 'N/A'} (${diagnostic.comp?.injury_home_count || 0} players)`);
        console.log(`  Injury Impact Away: ${diagnostic.comp?.injury_away_total?.toFixed(2) || 'N/A'} (${diagnostic.comp?.injury_away_count || 0} players)`);
        console.log(`  Score Difference: ${diagnostic.comp?.scoreDifference?.toFixed(4) || 'N/A'}`);
        console.log(`  Predicted Spread: ${diagnostic.comp?.predictedSpread?.toFixed(2) || 'N/A'}`);
        console.log(`  Clamp Applied: ${diagnostic.comp?.clampApplied ? 'YES (±17)' : 'NO'}`);
        
        console.log('\n📈 OUTPUTS:');
        console.log(`  Model Margin: ${diagnostic.out?.model_home_margin?.toFixed(2) || 'N/A'}`);
        console.log(`  Market Margin: ${diagnostic.out?.market_home_margin?.toFixed(2) || 'N/A'}`);
        console.log(`  Divergence: ${diagnostic.out?.diff?.toFixed(2) || 'N/A'} points`);
      } else {
        // Fall back to available data
        console.log('\n⚠️  No diagnostic data found. Using available fields:');
        console.log(`  Model Spread: ${game.spread?.predicted?.toFixed(2) || 'N/A'}`);
        console.log(`  Market Spread: ${game.spread?.line?.toFixed(2) || 'N/A'}`);
        console.log(`  Home Win Prob: ${(game.home_win_prob * 100).toFixed(1)}%`);
        console.log(`  Away Win Prob: ${(game.away_win_prob * 100).toFixed(1)}%`);
      }
      
      // Check if scores look like probabilities (0-1 range) vs points (-10 to +10 range)
      if (diagnostic?.features) {
        const homeScore = diagnostic.features.base_home_score;
        const awayScore = diagnostic.features.base_away_score;
        
        if (homeScore !== undefined && awayScore !== undefined) {
          const avgScore = (Math.abs(homeScore) + Math.abs(awayScore)) / 2;
          
          if (avgScore < 1.5) {
            console.log('\n🚨 WARNING: Scores look like probabilities or normalized values!');
            console.log(`   Expected range: -5 to +10 (points)`);
            console.log(`   Actual average: ${avgScore.toFixed(2)}`);
          } else if (avgScore > 15) {
            console.log('\n🚨 WARNING: Scores seem too large!');
            console.log(`   Expected range: -5 to +10 (points)`);
            console.log(`   Actual average: ${avgScore.toFixed(2)}`);
          } else {
            console.log('\n✅ Scores appear to be in expected range');
            console.log(`   Average magnitude: ${avgScore.toFixed(2)} points`);
          }
        }
      }
    }
    
    console.log(`\n${'='.repeat(60)}\n`);
    console.log('✅ Verification complete\n');
    
  } catch (err) {
    console.error('❌ Error reading predictions:', err.message);
    console.log('\nTrying alternate path...');
    
    // Try the direct blob path
    try {
      const altPath = '.netlify/blobs/nfl-td/6_2024_predictions.json';
      const data = JSON.parse(await readFile(altPath, 'utf-8'));
      console.log(`Found predictions at: ${altPath}`);
      console.log(`Games: ${data.predictions?.length || 0}`);
    } catch (altErr) {
      console.error('❌ Alternate path also failed:', altErr.message);
    }
  }
}

main();
