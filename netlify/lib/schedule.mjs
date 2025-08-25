import { getOptionalStore, putJSON, getJSON } from '../shared/blobs.mjs';

async function fetchESPNByDates(start, end){
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${start}-${end}`;
  const res = await fetch(url);
  if(!res.ok) return { ok:false, status:res.status };
  const data = await res.json();
  const games = (data.events||[]).map(e => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c=>c.homeAway==='home')?.team;
    const away = comp?.competitors?.find(c=>c.homeAway==='away')?.team;
    return {
      id: e.id,
      date: e.date,
      home: { id: home?.id, abbrev: home?.abbreviation, displayName: home?.displayName },
      away: { id: away?.id, abbrev: away?.abbreviation, displayName: away?.displayName }
    };
  });
  return { ok:true, games };
}

export async function bootstrapSchedule({ season=2025, week=1, mode='auto', useBlobs=true }){
  const store = useBlobs ? getOptionalStore(['BLOBS_STORE_NFL','BLOBS_STORE']) : null;
  const cacheKey = `weeks/${season}/${week}/schedule.json`;

  // Try cache
  const cached = await getJSON(store, cacheKey);
  if(cached?.games?.length) return { ok:true, season, week, games:cached.games, used:{mode:'cache'} };

  // Simple fallback: Week 1 fixed window (Thu..Wed)
  let start = '20250904', end = '20250910';
  if(week !== 1){
    // very simple weekly window: add (week-1)*7 days to start
    const base = new Date('2025-09-04T00:00:00Z');
    base.setUTCDate(base.getUTCDate() + (week-1)*7);
    const s = base.toISOString().slice(0,10).replace(/-/g,'');
    const eDate = new Date(base); eDate.setUTCDate(eDate.getUTCDate()+6);
    const e = eDate.toISOString().slice(0,10).replace(/-/g,'');
    start = s; end = e;
  }

  const got = await fetchESPNByDates(start, end);
  if(got.ok){
    const schedule = { season, week, games: got.games };
    await putJSON(store, cacheKey, schedule);
    return { ok:true, season, week, games: got.games, used:{mode: mode==='auto' ? 'auto→dates' : 'dates'} };
  }

  return { ok:false, error:'schedule unavailable', season, week };
}