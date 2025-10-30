/**
 * Manual trigger for NHL schedule refresh
 * Use this to populate the cache immediately without waiting for the scheduled 4am run
 * 
 * Usage: https://bgroundrobin.com/.netlify/functions/trigger-nhl-schedule
 */

import scheduleRefresh from './nhl-schedule-refresh.mjs';

export default async (request, context) => {
  console.log('🔄 Manual NHL schedule refresh triggered');
  return await scheduleRefresh(request, context);
};
