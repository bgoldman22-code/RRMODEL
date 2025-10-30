/**
 * On-Demand NBA Predictions Trigger
 * 
 * Manual endpoint to generate predictions without waiting for scheduled run
 * Same logic as scheduled function, callable via HTTP
 * 
 * Usage: https://your-site.netlify.app/.netlify/functions/trigger-nba-predictions
 */

import { default as generatePredictions } from './generate-daily-predictions.mjs';

export default async (req, context) => {
  console.log('🎯 Manual trigger for NBA predictions');
  
  // Call the scheduled function logic
  const result = await generatePredictions(req, context);
  
  return result;
};
