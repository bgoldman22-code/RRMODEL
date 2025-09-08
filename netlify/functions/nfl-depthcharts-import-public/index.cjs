'use strict';
// REPLACEMENT for netlify/functions/nfl-depthcharts-import-public/index.cjs
// Adds OurLads fallback after FantasyPros and ESPN.
const fetch = global.fetch;
const { getStore } = require('@netlify/blobs');

function blobsStoreNFL() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}

const TEAM_MAP = {
  "Arizona Cardinals":"ARI","Atlanta Falcons":"ATL","Baltimore Ravens":"BAL","Buffalo Bills":"BUF",
  "Carolina Panthers":"CAR","Chicago Bears":"CHI","Cincinnati Bengals":"CIN","Cleveland Browns":"CLE",
  "Dallas Cowboys":"DAL","Denver Broncos":"DEN","Detroit Lions":"DET","Green Bay Packers":"GB",
  "Houston Texans":"HOU","Indianapolis Colts":"IND","Jacksonville Jaguars":"JAX","Kansas City Chiefs":"KC",
  "Las Vegas Raiders":"LV","Los Angeles Chargers":"LAC","Los Angeles Rams":"LAR","Miami Dolphins":"MIA",
  "Minnesota Vikings":"MIN","New England Patriots":"NE","New Orleans Saints":"NO","New York Giants":"NYG",
  "New York Jets":"NYJ","Philadelphia Eagles":"PHI","Pittsburgh Steelers":"PIT","San Francisco 49ers":"SF",
  "Seattle Seahawks":"SEA","Tampa Bay Buccaneers":"TB","Tennessee Titans":"TEN","Washington Commanders":"WAS"
};
const ESPN_CODES = {
  "ARI":"ari","ATL":"atl","BAL":"bal","BUF":"buf","CAR":"car","CHI":"chi","CIN":"cin","CLE":"cle",
  "DAL":"dal","DEN":"den","DET":"det","GB":"gb","HOU":"hou","IND":"ind","JAX":"jac","KC":"kc",
  "LAC":"lac","LAR":"lar","LV":"lv","MIA":"mia","MIN":"min","NE":"ne","NO":"no","NYG":"nyg",
  "NYJ":"nyj","PHI":"phi","PIT":"pit","SEA":"sea","SF":"sf","TB":"tb","TEN":"ten","WAS":"wsh"
};
const OURLADS_SLUGS = {
  "ARI":"arizona-cardinals","ATL":"atlanta-falcons","BAL":"baltimore-ravens","BUF":"buffalo-bills",
  "CAR":"carolina-panthers","CHI":"chicago-bears","CIN":"cincinnati-bengals","CLE":"cleveland-browns",
  "DAL":"dallas-cowboys","DEN":"denver-broncos","DET":"detroit-lions","GB":"green-bay-packers",
  "HOU":"houston-texans","IND":"indianapolis-colts","JAX":"jacksonville-jaguars","KC":"kansas-city-chiefs",
  "LAC":"los-angeles-chargers","LAR":"los-angeles-rams","LV":"las-vegas-raiders","MIA":"miami-dolphins",
  "MIN":"minnesota-vikings","NE":"new-england-patriots","NO":"new-orleans-saints","NYG":"new-york-giants",
  "NYJ":"new-york-jets","PHI":"philadelphia-eagles","PIT":"pittsburgh-steelers","SEA":"seattle-seahawks",
  "SF":"san-francisco-49ers","TB":"tampa-bay-buccaneers","TEN":"tennessee-titans","WAS":"washington-commanders"
};

function clean(html) {
  return String(html || '').replace(/\r/g,'').replace(/>\s+</g,'><').replace(/\s{2,}/g,' ').trim();
}
function innerText(tagHtml){
  if (!tagHtml) return '';
  const noTags = String(tagHtml).replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g, '');
  return noTags.replace(/\s+/g, ' ').trim();
}
function defaultShares(pos, depth){
  const d = Number(depth)||1;
  if (pos==='RB') return { goal_line_share: d===1?0.60 : (d===2?0.30 : 0.10) };
  if (pos==='WR') return { red_zone_target_share: d===1?0.22 : 0.18, deep_threat: d===1?0.35 : 0.30 };
  if (pos==='TE') return { red_zone_target_share: 0.18 };
  if (pos==='QB') return { rush_td_rate: 0.05 };
  return {};
}
function buildPos(groups, key, names){
  const list = [];
  let depth=0;
  for (const nm of names.slice(0,3)){
    if (!nm) continue;
    depth += 1;
    list.push({ name:nm, role:`${key}${depth}`, ...defaultShares(key, depth) });
  }
  groups[key] = list;
  return groups;
}

async function tryFantasyPros(){
  const url = 'https://www.fantasypros.com/nfl/depth-charts.php';
  const r = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0 (DepthChartsBot/1.0)' } });
  if (!r.ok) return { ok:false, error:`HTTP ${r.status}`, url };
  const html = await r.text();
  const body = clean(html);
  const out = {};
  for (const [teamFull, abbr] of Object.entries(TEAM_MAP)){
    const h3re = new RegExp(`<h3[^>]*>\\s*${teamFull}[^<]*</h3>([\\s\\S]*?)(?:<h3|$)`, 'i');
    const m = body.match(h3re); if(!m) continue; const block = m[1];
    const groups = { RB:[], WR:[], TE:[], QB:[] };
    const defs = [ ['QB','(QB|Quarterbacks?)'], ['RB','(RB|Running\\s*Backs?)'], ['WR','(WR|Wide\\s*Receivers?)'], ['TE','(TE|Tight\\s*Ends?)'] ];
    for (const [key,label] of defs){
      const posRe = new RegExp(`(${label})[\\s\\S]*?(<table[\\s\\S]*?</table>|<ul[\\s\\S]*?</ul>)`, 'i');
      const pm = block.match(posRe); if(!pm) continue; const seg = pm[2];
      const nameTags = seg.match(/<a [^>]*>([^<]+)<\/a>|<strong[^>]*>([^<]+)<\/strong>|<span[^>]*class="player-name"[^>]*>([^<]+)<\/span>/gi) || [];
      const names = [];
      for (const t of nameTags){
        const nm = innerText(t); if(nm && !names.includes(nm)) names.push(nm); if(names.length>=4) break;
      }
      if (names.length === 0){
        const cells = seg.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
        for (const c of cells){
          const nm = innerText(c); if(/^(QB|RB|WR|TE)$/i.test(nm)) continue;
          if (nm && /^[A-Za-z'\.\-\s]+$/.test(nm) && nm.length>2){ if(!names.includes(nm)) names.push(nm); if(names.length>=4) break; }
        }
      }
      buildPos(groups, key, names);
    }
    if (Object.values(groups).some(a=>a.length)) out[abbr]=groups;
  }
  const teams = Object.keys(out);
  if (!teams.length) return { ok:false, error:'no teams parsed', tried:'FantasyPros' };
  return { ok:true, charts: out, source:'FantasyPros' };
}

async function tryESPN(){
  const out = {};
  for (const [abbr, code] of Object.entries(ESPN_CODES)){
    const url = `https://www.espn.com/nfl/team/depth/_/name/${code}`;
    try{
      const r = await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 (DepthChartsBot/1.0)' } });
      if(!r.ok) continue;
      const body = clean(await r.text());
      const groups = { RB:[], WR:[], TE:[], QB:[] };
      function grab(label, key){
        const re = new RegExp(`<h2[^>]*>\\s*${label}\\s*</h2>([\\s\\S]*?)(?:<h2|$)`, 'i');
        const m = body.match(re); if(!m) return;
        const seg = m[1];
        const links = seg.match(/<a[^>]+href="[^"]*\/player\/[^"]+"[^>]*>(.*?)<\/a>/gi) || [];
        const names = [];
        for (const l of links){
          const nm = innerText(l); if(nm && !names.includes(nm)) names.push(nm); if(names.length>=4) break;
        }
        if (names.length===0){
          const lis = seg.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
          for (const li of lis){
            const nm = innerText(li);
            if (nm && nm.length>2 && !/depth|injury|practice|roster/i.test(nm)){ if(!names.includes(nm)) names.push(nm); if(names.length>=4) break; }
          }
        }
        buildPos(groups, key, names);
      }
      grab('Quarterback','QB'); grab('Running Back','RB'); grab('Wide Receiver','WR'); grab('Tight End','TE');
      if (Object.values(groups).some(a=>a.length)) out[abbr]=groups;
    }catch(_){}
  }
  const teams = Object.keys(out);
  if (!teams.length) return { ok:false, error:'no teams parsed', tried:'ESPN' };
  return { ok:true, charts: out, source:'ESPN' };
}

async function tryOurlads(){
  const out = {};
  for (const [abbr, slug] of Object.entries(OURLADS_SLUGS)){
    const url = `https://www.ourlads.com/nfldepthcharts/depthchart/${slug}/1`;
    try{
      const r = await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 (DepthChartsBot/1.0)' } });
      if(!r.ok) continue;
      const body = clean(await r.text());
      const groups = { RB:[], WR:[], TE:[], QB:[] };
      function grab(label, key){
        // Look for section headers like <h2>Quarterback</h2> or table rows labeled RB/WR...
        const re = new RegExp(`(${label}|${key})[\\s\\S]*?(<table[\\s\\S]*?</table>|<ul[\\s\\S]*?</ul>)`, 'i');
        const m = body.match(re); if(!m) return;
        const seg = m[2];
        const cells = seg.match(/<a[^>]*>(.*?)<\/a>|<td[^>]*>(.*?)<\/td>|<li[^>]*>(.*?)<\/li>/gi) || [];
        const names = [];
        for (const c of cells){
          const nm = innerText(c);
          if (!nm || nm.length<2) continue;
          if (/^(QB|RB|WR|TE)$/i.test(nm)) continue;
          // crude filter to avoid header junk
          if (!/[A-Za-z]/.test(nm)) continue;
          if (!names.includes(nm)) names.push(nm);
          if (names.length>=4) break;
        }
        buildPos(groups, key, names);
      }
      grab('Quarterback','QB'); grab('Running Back','RB'); grab('Wide Receiver','WR'); grab('Tight End','TE');
      if (Object.values(groups).some(a=>a.length)) out[abbr]=groups;
    }catch(_){}
  }
  const teams = Object.keys(out);
  if (!teams.length) return { ok:false, error:'no teams parsed', tried:'OurLads' };
  return { ok:true, charts: out, source:'OurLads' };
}

exports.handler = async (event)=>{
  try{
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);

    let res = await tryFantasyPros();
    if (!res.ok) res = await tryESPN();
    if (!res.ok) res = await tryOurlads();

    if (!res.ok) return { statusCode: 502, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'All public parsers found 0 teams', details: res }) };

    const store = blobsStoreNFL();
    const key = `depth/${season}/week${week}/depth-charts.json`;
    await store.set(key, JSON.stringify(res.charts, null, 2), { contentType: 'application/json; charset=utf-8' });

    const teams = Object.keys(res.charts);
    const sampleTeam = teams[0];
    return { statusCode:200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, week, source: res.source, saved:key, teams:teams.length, sampleTeam, sample:res.charts[sampleTeam] }) };
  }catch(err){
    return { statusCode:500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
