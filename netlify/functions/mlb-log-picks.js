import { getBlobsStore, openStore, getSafeStore, makeStore } from './_blobs.js';
import { getStore } from '@netlify/blobs';
import { parkHRFactorForAbbrev } from './lib/parkFactors.js';
import { weatherHRMultiplier } from './lib/weatherMultiplier.js';

async function fetchJSON(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  if(!r.ok) return null;
  return r.json();
}
async function getScheduleMap(dateISO){
  const sched = await fetchJSON(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(dateISO)}`);
  const games = (sched?.dates?.[0]?.games)||[];
  const map = new Map(); // key: "AWY@HOM" string -> { gamePk, homeAb, awayAb, weather }
  for(const g of games){
    const homeAb = g?.teams?.home?.team?.abbreviation || g?.teams?.home?.team?.teamCode || g?.teams?.home?.team?.clubName || g?.teams?.home?.team?.name;
    const awayAb = g?.teams?.away?.team?.abbreviation || g?.teams?.away?.team?.teamCode || g?.teams?.away?.team?.clubName || g?.teams?.away?.team?.name;
    const key = `${awayAb}@${homeAb}`;
    map.set(key.toUpperCase(), { gamePk: g?.gamePk, homeAb, awayAb });
  }
  return map;
}
async function extractWeatherByGamePk(gamePk){
  try{
    const feed = await fetchJSON(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    const w = feed?.gameData?.weather || {};
    const tempF = typeof w?.temp === 'number' ? w.temp : null;
    let windOutMph = null;
    if(typeof w?.windSpeed === 'number'){
      const dir = String(w?.windDirection||'').toLowerCase();
      const towardCF = /out.*center|out.*cf/.test(dir);
      const fromCF = /in.*center|in.*cf/.test(dir);
      windOutMph = towardCF ? w.windSpeed : (fromCF ? -w.windSpeed : 0);
    }
    const precip = String(w?.condition||'').toLowerCase().includes('rain');
    return { tempF, windOutMph, precip };
  }catch{ return { tempF:null, windOutMph:null, precip:false }; }
}

export default async (req, context) => {
  try{
    if(req.method !== 'POST'){
      return new Response(JSON.stringify({ error: 'method-not-allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
    }
    const bodyText = await req.text();
    let body = {};
    try{ body = JSON.parse(bodyText || '{}'); }catch{}
    const date = String(body?.date || '').slice(0,10);
    const picks = Array.isArray(body?.picks) ? body.picks : null;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'bad-date', message: 'Expected YYYY-MM-DD' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    if(!picks){
      return new Response(JSON.stringify({ error: 'bad-body', message: 'Missing picks[]' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    // sanitize picks minimally
    const clean = picks.map(p => ({
      name: String(p?.name || ''),
      teamAbbr: p?.team || p?.teamAbbr || null,
      gameId: String(p?.gameId || ''),
      gameCode: String(p?.gameCode || ''),
      mlbId: p?.mlbId || null,
      prob: Number(p?.hr_prob_fgb || p?.prob || 0)
    }));

    const store = getBlobsStore();
    const key = `predictions/${date}.json`;
    const payload = { date, picks: clean, ts: Date.now() };
    await store.set(key, JSON.stringify(payload));

    return new Response(JSON.stringify({ ok:true, saved: clean.length }), { headers: { 'content-type': 'application/json' } });
  }catch(e){
    return new Response(JSON.stringify({ error: 'log-failed', message: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
