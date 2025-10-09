// test-td-function.js
// Test the comprehensive TD predictions function locally

const fs = require('fs').promises;

// Import the Netlify function
async function loadFunction() {
  const { default: handler } = await import('./netlify/functions/nfl-td-comprehensive-predictions/index.mjs');
  return handler;
}

async function testTDFunction() {
  console.log('🧪 Testing TD Comprehensive Predictions Function...');
  
  try {
    const handler = await loadFunction();
    
    // Create a mock request
    const mockRequest = {
      method: 'GET',
      url: 'https://test.com/.netlify/functions/nfl-td-comprehensive-predictions?week=3&season=2025'
    };
    
    // Call the function
    const response = await handler(mockRequest, {});
    
    // Parse the response
    const responseText = await response.text();
    const result = JSON.parse(responseText);
    
    console.log('✅ Function executed successfully!');
    console.log('📊 Response metadata:', result.metadata);
    console.log('🎯 Number of predictions:', result.predictions?.length || 0);
    
    if (result.predictions && result.predictions.length > 0) {
      const firstGame = result.predictions[0];
      console.log('🏈 First game:', firstGame.home_team, 'vs', firstGame.away_team);
      console.log('👥 Players in first game:', firstGame.players?.length || 0);
    }
    
  } catch (error) {
    console.error('❌ Function test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
  
  return true;
}

testTDFunction().then(success => {
  process.exit(success ? 0 : 1);
});