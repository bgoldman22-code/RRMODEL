// netlify/functions/injuries-cron-all.js
// NETLIFY SCHEDULED FUNCTION: Runs comprehensive injury analysis in background
// Configured via netlify.toml: runs every 30 minutes

import { buildInjurySnapshot } from '../../scripts/build-injuries-snapshot.js';

export const handler = async (event, context) => {
  console.log('🕐 Scheduled injury snapshot starting...');
  console.log('Event source:', event.source || 'manual');
  console.log('Trigger time:', new Date().toISOString());
  
  try {
    const result = await buildInjurySnapshot();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Injury snapshot completed successfully',
        trigger: 'scheduled_function',
        asOf: result.asOf,
        teams: result.summary.totalTeamsProcessed,
        injuries: result.summary.totalInjuriesFound,
        significant: result.summary.significantInjuries,
        buildTimeSeconds: result.summary.buildTimeSeconds,
        playerCacheSize: result.summary.playerCacheSize,
        criticalAlerts: result.summary.criticalAlerts.length
      })
    };
    
  } catch (error) {
    console.error('❌ Scheduled injury snapshot failed:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Scheduled injury snapshot failed',
        trigger: 'scheduled_function'
      })
    };
  }
};