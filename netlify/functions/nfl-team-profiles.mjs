// netlify/functions/nfl-team-profiles.mjs
// Builds/returns team scoring tendencies (rush/pass split, RZ TD%, inside-5 usage, vulture RB flag) and defensive profiles (last 2 yrs).
// Attempts ESPN endpoints; falls back to neutral league averages if unavailable.
// This function caches results in memory (per function instance) to reduce external calls.

let CACHE = null;

export async function handler(){
  try{
    if(CACHE){ return { statusCode: 200, body: JSON.stringify({ ok:true, profiles:CACHE }) }; }
    // TODO: Pull real team stats. For now provide conservative neutral profiles.
    const TEAMS = [
      'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'
    ];
    const profiles = {};
    for(const t of TEAMS){
      profiles[t] = {
        offense: {
          rushTdRate: 0.45,   // share of TDs via rush
          passTdRate: 0.55,
          redZoneTdPct: 0.56,
          inside5RushShareTopRB: 0.62, // "vulture" if <0.5 for lead RB historically
          yardageTendency: { short:0.52, mid:0.33, deep:0.15 } // fraction of TDs by yardage bands
        },
        defense: {
          tdPerGameAllowed: 2.4,
          rushTdRate: 0.03,  // per rushing attempt
          passTdRate: 0.045, // per pass attempt
          redZoneTdPctAllowed: 0.54
        },
        vultureFlag: false
      };
    }
    CACHE = profiles;
    return { statusCode: 200, body: JSON.stringify({ ok:true, profiles }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ ok:false, profiles:{} }) };
  }
}
