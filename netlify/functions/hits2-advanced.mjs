// netlify/functions/hits2-advanced.mjs
export async function handler(event){
  if(event.httpMethod !== "POST"){
    return { statusCode: 405, body: "POST only" };
  }
  try{
    const body = JSON.parse(event.body||"{}");
    const players = Array.isArray(body.players) ? body.players : [];
    const out = {};
    for(const p of players){
      out[String(p.id)] = {
        formMult: 1.0, pitchEdgeMult: 1.0, parkNote: null, formNote: null, pitchMatchNote: null, lineupNote: null
      };
    }
    return { statusCode: 200, body: JSON.stringify({ map: out }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ map: {} }) };
  }
}
