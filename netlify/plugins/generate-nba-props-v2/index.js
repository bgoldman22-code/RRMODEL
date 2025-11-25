// Netlify Build Plugin: Auto-generate NBA Props V2 predictions during build
// This runs automatically on every Netlify deploy

module.exports = {
  async onPreBuild({ utils, constants }) {
    const { run } = utils;
    
    console.log('🏀 Generating NBA Props V2 predictions...');
    
    try {
      // Check if ODDS_API_KEY is available
      if (!process.env.ODDS_API_KEY) {
        console.warn('⚠️  ODDS_API_KEY not set - skipping V2 predictions generation');
        console.log('   Set ODDS_API_KEY in Netlify environment variables');
        return;
      }
      
      // Generate V2 predictions
      await run.command('node scripts/nba/generate-pra-predictions-v2.mjs', {
        env: {
          ODDS_API_KEY: process.env.ODDS_API_KEY
        }
      });
      
      console.log('✅ NBA Props V2 predictions generated successfully!');
      
    } catch (error) {
      console.error('❌ Failed to generate NBA Props V2 predictions:', error.message);
      // Don't fail the build - just warn
      console.log('   V2 page will show "no predictions" until this is fixed');
    }
  }
};
