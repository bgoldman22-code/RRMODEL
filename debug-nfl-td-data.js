// Debug script to test NFL TD data loading
const fs = require('fs').promises;
const path = require('path');

async function testDataLoading() {
  try {
    console.log('🔍 Testing NFL TD data loading...');
    
    // Load the data file
    const dataPath = path.join(process.cwd(), 'data', 'nfl-td-comprehensive-latest.json');
    const rawData = await fs.readFile(dataPath, 'utf8');
    const data = JSON.parse(rawData);
    
    console.log('📊 Data structure:');
    console.log('- Type:', typeof data);
    console.log('- Keys:', Object.keys(data));
    console.log('- Has predictions:', !!data.predictions);
    console.log('- Predictions type:', Array.isArray(data.predictions) ? 'array' : typeof data.predictions);
    console.log('- Predictions length:', data.predictions?.length || 0);
    console.log('- Metadata:', data.metadata);
    
    if (data.predictions && data.predictions.length > 0) {
      console.log('\n🏈 Sample prediction:');
      const sample = data.predictions[0];
      console.log('- Name:', sample.name);
      console.log('- Position:', sample.position);
      console.log('- Team:', sample.team);
      console.log('- Anytime TD prob:', sample.anytime_td_prob);
      console.log('- Has odds_sources:', !!sample.odds_sources);
      console.log('- Keys:', Object.keys(sample).slice(0, 10));
    }
    
    // Test the structure that the enhanced function expects
    const expectedStructure = {
      full: {
        predictions: data.predictions,
        metadata: data.metadata,
        games: []
      }
    };
    
    console.log('\n✅ Expected structure would have:');
    console.log('- full.predictions length:', expectedStructure.full.predictions?.length || 0);
    console.log('- full.metadata:', expectedStructure.full.metadata);
    console.log('- full.games:', expectedStructure.full.games?.length || 0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDataLoading();