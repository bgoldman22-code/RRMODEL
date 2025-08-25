import { getOptionalStore, putJSON, getJSON } from '../shared/blobs.mjs';
import { normalizeAbbr } from './teams.mjs';

const BASE = 'https://api.sportsdata.io/v3/nfl/scores/json';

export async function fetchDepthChartsSportsData({ season=2025, useBlobs=true }){
  const apiKey = process.env.SPORTSDATA_API_KEY;
  const store = useBlobs ? getOptionalStore(['BLOBS_STORE_NFL','BLOBS_STORE']) : null;
  const cacheKey = `depth-charts.json`;

  // Try cache
  const cached = await getJSON(store, cacheKey);
  if(cached?.byTeam) return { ok:true, source:'cache', ...cached };

  if(!apiKey){
    return { ok:false, error:'SPORTSDATA_API_KEY missing' };
  }
  const url = `${BASE}/DepthCharts/${season}?key=${apiKey}`;
  const res = await fetch(url);
  if(!res.ok){
    return { ok:false, status:res.status, error:'sportsdata depthcharts fetch failed' };
  }
  const data = await res.json();
  // Build map by team abbrev -> { RB: [{name, depth}], WR:[], TE:[], QB:[] }
  const byTeam = {};
  for(const team of data){
    const abbr = normalizeAbbr(team.Team);
    const slots = {};
    for(const pd of team.PositionDepthCharts || []){
      const pos = pd.Position;
      const arr = [];
      for(const p of (pd.Players||[])){
        arr.push({ name: p.Name, pos: p.Position, depth: p.DepthOrder, playerId: p.PlayerID });
      }
      if(arr.length) slots[pos] = arr.sort((a,b)=>a.depth-b.depth);
    }
    byTeam[abbr] = slots;
  }
  const out = { byTeam, fetchedAt: new Date().toISOString() };
  await putJSON(store, cacheKey, out);
  return { ok:true, source:'sportsdata', ...out };
}