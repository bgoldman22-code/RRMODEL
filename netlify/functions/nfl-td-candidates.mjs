import { bootstrapSchedule } from '../lib/schedule.mjs';
import { fetchDepthChartsSportsData } from '../lib/depth.mjs';
import { normalizeAbbr } from '../lib/teams.mjs';

function pickCandidatesForGame(home, away, depth, limitPerTeam=3){
  const out = [];
  const sides = [
    { abbr: normalizeAbbr(home.abbrev), opp: normalizeAbbr(away.abbrev) },
    { abbr: normalizeAbbr(away.abbrev), opp: normalizeAbbr(home.abbrev) },
  ];
  for(const side of sides){
    const d = depth.byTeam?.[side.abbr] || {};
    // prefer RB1, WR1, TE1 if present
    const priority = [
      ...(d.RB ? [ {pos:'RB', players:d.RB} ] : []),
      ...(d.WR ? [ {pos:'WR', players:d.WR} ] : []),
      ...(d.TE ? [ {pos:'TE', players:d.TE} ] : []),
      ...(d.QB ? [ {pos:'QB', players:d.QB} ] : []),
    ];
    for(const bucket of priority){
      for(const p of bucket.players.slice(0,limitPerTeam)){
        // naive model: RB1 ~ 36%, WR1 ~ 28%, TE1 ~ 18%, QB1 ~ 6% rushing
        const depthN = p.depth || 1;
        const base = bucket.pos==='RB' ? 0.36 : bucket.pos==='WR' ? 0.28 : bucket.pos==='TE' ? 0.18 : 0.06;
        const adj = base / depthN; // penalize depth
        out.push({
          player: p.name,
          pos: bucket.pos,
          modelTD: Math.round(adj*1000)/10,
          why: `${bucket.pos}${depthN} • vs ${side.opp} • depth ${depthN}`
        });
      }
    }
  }
  return out;
}

export const handler = async (event) => {
  try{
    const params = event.queryStringParameters || {};
    const season = params.season ? parseInt(params.season,10) : 2025;
    const week = params.week ? parseInt(params.week,10) : 1;

    const boot = await bootstrapSchedule({ season, week, mode:'auto', useBlobs: params.noblobs?false:true });
    if(!boot.ok) return { statusCode:500, body: JSON.stringify({ ok:false, error:'schedule unavailable'}) };

    const depth = await fetchDepthChartsSportsData({ season, useBlobs: params.noblobs?false:true });
    if(!depth.ok) return { statusCode:500, body: JSON.stringify({ ok:false, error: depth.error || 'depth unavailable'}) };

    const rows = [];
    for(const g of boot.games){
      const picks = pickCandidatesForGame(g.home, g.away, depth);
      for(const r of picks) rows.push(r);
    }
    // sort by modelTD desc and cap 100
    rows.sort((a,b)=>b.modelTD - a.modelTD);
    const best = rows.slice(0,100);

    return {
      statusCode: 200,
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ ok:true, season, week, games: boot.games.length, candidates: best })
    };
  }catch(err){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
}