'use strict';
// Public depth-charts importer: tries FantasyPros first, then falls back to ESPN team pages.
// Saves to BLOBS_STORE_NFL: depth/{season}/week{week}/depth-charts.json
//
// Usage:
//   /.netlify/functions/nfl-depthcharts-import-public?season=2025&week=2
//
// No API keys needed.

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

function clean(html) {
  return String(html || '')
    .replace(/\r/g,'')
    .replace(/>\s+</g,'><')
    .replace(/\s{2,}/g,' ')
    .trim();
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

// FantasyPros: attempt to parse combined page
async function tryFantasyPros(){
  const url = 'https://www.fantasypros.com/nfl/depth-charts.php';
  const r = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0 (DepthChartsBot/1.0)' } });
  if (!r.ok) return { ok:false, error:`HTTP ${r.status}`, url };
  const html = await r.text();
  const body = clean(html);
  const out = {};

  for (const [teamFull, abbr] of Object.entries(TEAM_MAP)){
    // Team block between <h3>Team</h3> and next <h3>
    const h3re = new RegExp(`<h3[^>]*>\\s*${teamFull}[^<]*</h3>([\\s\\S]*?)(?:<h3|$)`, 'i');
    const blockMatch = body.match(h3re);
    if (!blockMatch) continue;
    const block = blockMatch[1];

    const groups = { RB:[], WR:[], TE:[], QB:[] };
    const def = [ ['QB','(QB|Quarterbacks?)'], ['RB','(RB|Running\\s*Backs?)'], ['WR','(WR|Wide\\s*Receivers?)'], ['TE','(TE|Tight\\s*Ends?)'] ];
    for (const [key, label] of def){
      const posRe = new RegExp(`(${label})[\\s\\S]*?(<table[\\s\\S]*?</table>|<ul[\\s\\S]*?</ul>)`, 'i');
      const posBlock = block.match(posRe);
      if (!posBlock) continue;
      const tableOrList = posBlock[2];

      // names from links/strong/spans
      const nameTags = tableOrList.match(/<a [^>]*>([^<]+)<\/a>|<strong[^>]*>([^<]+)<\/strong>|<span[^>]*class="player-name"[^>]*>([^<]+)<\/span>/gi) || [];
      const names = [];
      for (const t of nameTags){
        const nm = innerText(t);
        if (nm && !names.includes(nm)) names.push(nm);
        if (names.length >= 4) break;
      }
      // fallback cells
      if (names.length === 0){
        const cellMatches = tableOrList.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
        for (const c of cellMatches){
          const nm = innerText(c);
          if (/^(QB|RB|WR|TE)$/i.test(nm)) continue;
          if (nm && /^[A-Za-z'\.\-\s]+$/.test(nm) && nm.length > 2){
            if (!names.includes(nm)) names.push(nm);
            if (names.length >= 4) break;
          }
        }
      }
      buildPos(groups, key, names);
    }
    // store if any group has entries
    if (Object.values(groups).some(arr => (arr && arr.length))) out[abbr] = groups;
  }

  const teams = Object.keys(out);
  if (!teams.length) return { ok:false, error:'no teams parsed', url, tried:'FantasyPros' };
  return { ok:true, charts: out, source:'FantasyPros' };
}

// ESPN fallback per-team
async function tryESPN(){
  const out = {};
  for (const [abbr, code] of Object.entries(ESPN_CODES)){
    const url = `https://www.espn.com/nfl/team/depth/_/name/${code}`;
    try {
      const r = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0 (DepthChartsBot/1.0)' } });
      if (!r.ok) continue;
      const html = await r.text();
      const body = clean(html);

      // ESPN has sections like <h2>Quarterback</h2> etc. followed by a table/list of names.
      const groups = { RB:[], WR:[], TE:[], QB:[] };

      function grab(label, key){
        const re = new RegExp(`<h2[^>]*>\\s*${label}\\s*</h2>([\\s\\S]*?)(?:<h2|$)`, 'i');
        const m = body.match(re);
        if (!m) return;
        const seg = m[1];
        const links = seg.match(/<a[^>]+href="[^"]*\/player\/(?:[^"]+)"[^>]*>(.*?)<\/a>/gi) || [];
        const names = [];
        for (const l of links){
          const nm = innerText(l);
          if (nm && !names.includes(nm)) names.push(nm);
          if (names.length >= 4) break;
        }
        // fallback list items
        if (names.length === 0){
          const lis = seg.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
          for (const li of lis){
            const nm = innerText(li);
            if (nm && nm.length > 2 && !/depth|injury|practice|roster/i.test(nm)){
              if (!names.includes(nm)) names.push(nm);
              if (names.length >= 4) break;
            }
          }
        }
        buildPos(groups, key, names);
      }

      grab('Quarterback','QB');
      grab('Running Back','RB');
      grab('Wide Receiver','WR');
      grab('Tight End','TE');

      if (Object.values(groups).some(arr => (arr && arr.length))) {
        out[abbr] = groups;
      }
    } catch (_) {}
  }
  const teams = Object.keys(out);
  if (!teams.length) return { ok:false, error:'no teams parsed', tried:'ESPN' };
  return { ok:true, charts: out, source:'ESPN' };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);

    let res = await tryFantasyPros();
    if (!res.ok) {
      res = await tryESPN();
    }

    if (!res.ok) {
      return { statusCode: 502, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'Both FantasyPros and ESPN parsers found 0 teams', details: res }) };
    }

    const store = blobsStoreNFL();
    const key = `depth/${season}/week${week}/depth-charts.json`;
    await store.set(key, JSON.stringify(res.charts, null, 2), { contentType: 'application/json; charset=utf-8' });

    const teams = Object.keys(res.charts);
    const sampleTeam = teams[0];
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, week, source: res.source, saved:key, teams: teams.length, sampleTeam, sample: res.charts[sampleTeam] }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
