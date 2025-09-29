/**
 * SIMPLE API TEST - Check if Netlify function is working
 */

async function testAPI() {
  console.log('🧪 SIMPLE API TEST - Starting...');
  console.log('==================================');
  
  try {
    console.log('📡 Testing API endpoint...');
    const response = await fetch('/api/nfl-td-predictions?type=raw&limit=1');
    
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('✅ SUCCESS! API returned JSON');
      console.log('Response keys:', Object.keys(data));
      console.log('Games found:', data.games?.length || 0);
      
      if (data.games && data.games.length > 0) {
        const game = data.games[0];
        console.log('Sample game:', game.home_team, 'vs', game.away_team);
        console.log('Has injury fields:', 'injuries' in game, 'qb_status' in game);
      }
    } else {
      console.log('❌ API returned error status');
      const text = await response.text();
      console.log('Response preview:', text.substring(0, 200));
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
  
  console.log('==================================');
  console.log('🏁 TEST COMPLETE');
}

// Run test
testAPI();