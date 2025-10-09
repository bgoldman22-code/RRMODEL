// Test script to verify environment variable detection
console.log('🔍 Testing Environment Variables...\n');

console.log('Local Environment:');
console.log('THEODDS_API_KEY:', process.env.THEODDS_API_KEY ? '✅ FOUND' : '❌ NOT FOUND');
console.log('NODE_ENV:', process.env.NODE_ENV || 'undefined');

if (!process.env.THEODDS_API_KEY) {
  console.log('\n💡 This is normal for local development!');
  console.log('📋 To fix:');
  console.log('   1. Get your API key from https://the-odds-api.com/');
  console.log('   2. Add it to .env file: THEODDS_API_KEY=your_key_here');
  console.log('   3. Or test on production where it\'s already set');
}

console.log('\n🚀 Production should work fine since THEODDS_API_KEY is set in Netlify!');