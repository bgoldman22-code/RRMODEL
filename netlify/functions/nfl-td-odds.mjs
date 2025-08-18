// netlify/functions/nfl-td-odds.mjs
// Fetch Anytime TD odds + totals/spreads from TheOddsAPI.
// Env: THEODDS_API_KEY_NFL (preferred) or THEODDS_API_KEY (fallback).

const SPORT = 'americanfootball_nfl';
const REGIONS = process.env.ODDS_REGIONS || 'us';
const BOOKS = process.env.ODDS_BOOKS || 'draftkings,fanduel,betmgm,caesars,pointsbetus';
const API = process.env.THEODDS_API_KEY_NFL || process.env.THEODDS_API_KEY;

export async function handler(){
  try{
    if(!API) return { statusCode: 200, body: JSON.stringify({ ok:false, reason:'NO_API_KEY', events:[] }) };
    const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/?regions=${encodeURIComponent(REGIONS)}&markets=player_anytime_td,spreads,totals&oddsFormat=american&dateFormat=unix&apiKey=${API}`;
    const r = await fetch(url);
    if(!r.ok){ return { statusCode: 200, body: JSON.stringify({ ok:false, reason:'ODDS_FETCH_FAIL', events:[] }) }; }
    const events = await r.json();
    return { statusCode: 200, body: JSON.stringify({ ok:true, events }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ ok:false, reason:'EXCEPTION', events:[] }) };
  }
}
