import { bootstrapSchedule } from '../lib/schedule.mjs';

export const handler = async (event) => {
  try{
    const params = event.queryStringParameters || {};
    const season = params.season ? parseInt(params.season,10) : 2025;
    const week = params.week ? parseInt(params.week,10) : 1;
    const mode = params.mode || 'auto';
    const useBlobs = params.noblobs ? false : true;

    const boot = await bootstrapSchedule({ season, week, mode, useBlobs });
    if(boot.ok){
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok:true, season, week, games:boot.games, used: boot.used })
      }
    }else{
      return { statusCode: 500, body: JSON.stringify(boot) }
    }
  }catch(err){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(err) }) }
  }
}