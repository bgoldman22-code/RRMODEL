// netlify/functions/sb-advanced.mjs
export async function handler(event){
  if(event.httpMethod !== "POST"){
    return { statusCode: 405, body: "POST only" };
  }
  try{
    const body = JSON.parse(event.body||"{}");
    const players = Array.isArray(body.players) ? body.players : [];
    const out = {};
    for(const p of players){
      // TODO: wire real data (sprint speed, pitcher delivery time, catcher CS%)
      // For now, return neutral multipliers and empty notes.
      out[String(p.id)] = {
        speedMult: 1.0, pitcherHoldMult: 1.0, catcherArmMult: 1.0,
        recentObpDelta: 0.0,
        speedTier: null, pitcherHoldNote: null, catcherArmNote: null
      };
    }
    return { statusCode: 200, body: JSON.stringify({ map: out }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ map: {} }) };
  }
}
