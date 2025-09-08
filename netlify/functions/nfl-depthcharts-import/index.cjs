'use strict';
// Drop-in replacement for netlify/functions/nfl-depthcharts-import/index.cjs
// Improves Sportradar parsing: map position names (HB/FB/Slot/etc) and use player depth field.

const fetch = global.fetch;
const { writeDepthCharts } = require('../_lib/common.cjs');

const TEAM_ABBR = {
  "Arizona Cardinals": "ARI","Atlanta Falcons":"ATL","Baltimore Ravens":"BAL","Buffalo Bills":"BUF",
  "Carolina Panthers":"CAR","Chicago Bears":"CHI","Cincinnati Bengals":"CIN","Cleveland Browns":"CLE",
  "Dallas Cowboys":"DAL","Denver Broncos":"DEN","Detroit Lions":"DET","Green Bay Packers":"GB",
  "Houston Texans":"HOU","Indianapolis Colts":"IND","Jacksonville Jaguars":"JAX","Kansas City Chiefs":"KC",
  "Los Angeles Chargers":"LAC","Los Angeles Rams":"LAR","Las Vegas Raiders":"LV","Miami Dolphins":"MIA",
  "Minnesota Vikings":"MIN","New England Patriots":"NE","New Orleans Saints":"NO","New York Giants":"NYG",
  "New York Jets":"NYJ","Philadelphia Eagles":"PHI","Pittsburgh Steelers":"PIT","Seattle Seahawks":"SEA",
  "San Francisco 49ers":"SF","Tampa Bay Buccaneers":"TB","Tennessee Titans":"TEN","Washington Commanders":"WAS"
};
const ALT_TEAM = {"ARI":"ARI","ATL":"ATL","BAL":"BAL","BUF":"BUF","CAR":"CAR","CHI":"CHI","CIN":"CIN","CLE":"CLE","DAL":"DAL","DEN":"DEN","DET":"DET","GB":"GB","GNB":"GB","HOU":"HOU","IND":"IND","JAX":"JAX","JAC":"JAX","KC":"KC","KCC":"KC","KAN":"KC","LAC":"LAC","SD":"LAC","SDC":"LAC","LAR":"LAR","LA":"LAR","STL":"LAR","LV":"LV","OAK":"LV","MIA":"MIA","MIN":"MIN","NE":"NE","NWE":"NE","NEP":"NE","NO":"NO","NOR":"NO","NYG":"NYG","NYJ":"NYJ","PHI":"PHI","PHL":"PHI","PIT":"PIT","SEA":"SEA","SF":"SF","SFO":"SF","TB":"TB","TAM":"TB","TEN":"TEN","WAS":"WAS","WSH":"WAS","WFT":"WAS"};

function toAbbr(nameOrObj) {
  if (!nameOrObj) return null;
  if (typeof nameOrObj === 'string') {
    if (TEAM_ABBR[nameOrObj]) return TEAM_ABBR[nameOrObj];
    const up = nameOrObj.toUpperCase();
    if (ALT_TEAM[up]) return ALT_TEAM[up];
    return up;
  }
  const ab = nameOrObj.alias || nameOrObj.abbreviation || nameOrObj.abbr || nameOrObj.key;
  if (ab) {
    const up = String(ab).toUpperCase();
    if (ALT_TEAM[up]) return ALT_TEAM[up];
    if (TEAM_ABBR[ab]) return TEAM_ABBR[ab];
    return up;
  }
  const nm = nameOrObj.name || (nameOrObj.market ? `${nameOrObj.market} ${nameOrObj.name}` : null);
  if (nm && TEAM_ABBR[nm]) return TEAM_ABBR[nm];
  return null;
}

function mapPosName(n) {
  if (!n) return null;
  const s = String(n).toLowerCase();
  if (['qb','quarterback'].includes(s)) return 'QB';
  if (['rb','hb','fb','running back','halfback','fullback'].includes(s)) return 'RB';
  if (['wr','wide receiver','flanker','split end','slot','slot wr','wr1','wr2','wr3'].includes(s)) return 'WR';
  if (['te','tight end'].includes(s)) return 'TE';
  return null;
}

function defaultShares(pos, depth){
  const d=Number(depth)||0;
  if(pos==='RB') return {goal_line_share:d===1?0.60:(d===2?0.30:0.10)};
  if(pos==='WR') return {red_zone_target_share:d===1?0.22:0.18, deep_threat:d===1?0.35:0.30};
  if(pos==='TE') return {red_zone_target_share:0.18};
  if(pos==='QB') return {rush_td_rate:0.05};
  return {};
}

function normalizeUnit(arr){
  const out={RB:[],WR:[],TE:[],QB:[]};
  for(const p of arr){
    const pos=mapPosName(p.position) || p.position; // already normalized maybe
    if(!['RB','WR','TE','QB'].includes(pos)) continue;
    if(!p.name) continue;
    const depth = Number(p.depth)||1;
    const shares = Object.assign({}, defaultShares(pos, depth), p.usage||{});
    const role = depth===1?`${pos}1`:(depth===2?`${pos}2`:`${pos}3`);
    out[pos].push({ name:p.name, role, ...shares });
  }
  return out;
}

// -------- Sportradar --------
async function fetchSportradar(qs){
  const key=process.env.SPORTRADAR_API_KEY; if(!key) throw new Error('Missing env SPORTRADAR_API_KEY');
  const season=parseInt(qs.season||'2025',10); const week=parseInt(qs.week||'1',10);
  const stype=(qs.season_type||'REG').toUpperCase();
  const access=qs.access_level||process.env.SPORTRADAR_ACCESS_LEVEL||'trial';
  const lang=qs.lang||process.env.SPORTRADAR_LANG||'en';
  const url=qs.url||`https://api.sportradar.com/nfl/official/${access}/v7/${lang}/seasons/${season}/${stype}/${week}/depth_charts.json?api_key=${encodeURIComponent(key)}`;
  const r=await fetch(url); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const data=await r.json();
  const charts={}; const teams=data.teams||[];
  for(const t of teams){
    const abbr=t.alias || toAbbr(t);
    if(!abbr) continue;
    // Sportradar shape: t.depth_chart.offense.positions -> [{ name:'running back', players:[{name,depth,...}] }, ...]
    const positions = (t.depth_chart && t.depth_chart.offense && (t.depth_chart.offense.positions || t.depth_chart.offense)) || [];
    const unit=[];
    for(const pos of positions){
      const pname = mapPosName(pos.name || pos.position || pos.abbreviation);
      const players = pos.players || pos.depth || [];
      if (!pname || !Array.isArray(players)) continue;
      for(const pl of players){
        const nm = pl.name || (pl.first_name && pl.last_name ? `${pl.first_name} ${pl.last_name}` : pl.full_name);
        if (!nm) continue;
        const d = Number(pl.depth || pl.order || pl.rank || pl.position_depth || pl.depth_chart || unit.filter(x=>x.position===pname).length+1);
        unit.push({ name:nm, position:pname, depth:d });
      }
    }
    charts[abbr]=normalizeUnit(unit);
  }
  return charts;
}

// -------- RapidAPI --------
async function fetchRapidAPI(qs){
  const key=process.env.RAPIDAPI_KEY; const host=process.env.RAPIDAPI_HOST||'football-datafeeds-by-rolling-insights1.p.rapidapi.com';
  if(!key) throw new Error('Missing env RAPIDAPI_KEY');
  const base=`https://${host}`;
  const ids=qs.team_id?[qs.team_id]:Array.from({length:40},(_,i)=>String(i+1));
  const headers={'x-rapidapi-key':key,'x-rapidapi-host':host,'RS-DATA-TYPE':'DEPTH-CHARTS'};
  const charts={};
  for(const id of ids){
    const url=`${base}/depth-charts/NFL?team_id=${encodeURIComponent(id)}`;
    try{
      const r=await fetch(url,{headers}); if(!r.ok) continue; const data=await r.json();
      const teamName=data.team?.name||data.team_name||data.team||data.Team||null;
      const abbr=data.team?.abbr||data.team?.code||toAbbr(teamName);
      if(!abbr) continue;
      const unit=[];
      if(data.offense){
        for(const k of ['RB','WR','TE','QB']){
          const list=data.offense[k]||[];
          for(const p of list){
            const nm=p.name||p.player||p.full_name||(p.first_name&&p.last_name?`${p.first_name} ${p.last_name}`:null);
            if(!nm) continue;
            const d=Number(p.depth||p.depth_chart||p.rank|| (k==='WR' && p.role && /slot/i.test(p.role) ? 3 : 1));
            unit.push({ name:nm, position:k, depth:d });
          }
        }
      } else if (Array.isArray(data.players)){
        for(const p of data.players){
          const nm=p.name||p.player||(p.first_name&&p.last_name?`${p.first_name} ${p.last_name}`:null);
          const k=(p.position_group||p.position||p.pos||'').toUpperCase();
          const d=Number(p.depth||p.depth_chart||p.rank||1);
          unit.push({ name:nm, position:k, depth:d });
        }
      }
      if(unit.length) charts[abbr]=normalizeUnit(unit);
    }catch(_){}
  }
  return charts;
}

exports.handler = async (event)=>{
  try{
    const qs=event.queryStringParameters||{};
    const season=parseInt(qs.season||'2025',10);
    const week=parseInt(qs.week||'1',10);
    let source=(qs.source||process.env.DEFAULT_DEPTH_SOURCE||'sportradar').toLowerCase();
    let charts={};

    if(source==='sportradar'){ charts=await fetchSportradar(qs); }
    else if(source==='rapidapi'){ charts=await fetchRapidAPI(qs); }
    else if(source==='auto'){
      try{ charts=await fetchSportradar(qs); } catch(_){ charts={}; }
      if(!Object.keys(charts).length){ charts=await fetchRapidAPI(qs); }
    } else {
      return { statusCode:400, body:'Unsupported source' };
    }

    if(!Object.keys(charts).length){
      return { statusCode:502, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'No charts parsed from source', source }) };
    }

    const saved=await writeDepthCharts(season, week, charts);
    return { statusCode:200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, week, source, saved, teams:Object.keys(charts).length }) };
  }catch(err){
    return { statusCode:500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
