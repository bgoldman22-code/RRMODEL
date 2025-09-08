'use strict';
// Scrape FantasyPros depth charts and save to BLOBS_STORE_NFL
// URL: https://www.fantasypros.com/nfl/depth-charts.php
// Saves: depth/{season}/week{week}/depth-charts.json
//
// Requires no API keys. Uses a lightweight HTML parsing approach without extra deps.
//
// Notes:
// - We infer shares from depth order (RB: 0.60/0.30/0.10, WR: RZ 0.22/0.18 + deep_threat 0.35/0.30, TE: RZ 0.18, QB: rush_td_rate 0.05).
// - If parsing fails for a team/position, we just skip that entry rather than failing the whole job.
//
// Query:
//   season=2025    (default 2025)
//   week=1         (default 1)
//   url=...        (optional override of the FantasyPros page)
//
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

function clean(html) {
  return String(html || '')
    .replace(/\r/g,'')
    .replace(/>\s+</g,'><')
    .replace(/\s{2,}/g,' ')
    .trim();
}

// crude innerText extractor for a tag like <a ...>Name</a>
function innerText(tagHtml){
  if (!tagHtml) return '';
  // remove tags
  const noTags = String(tagHtml).replace(/<[^>]*>/g, '');
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

// Very lightweight HTML parse tailored to FantasyPros' depth charts layout.
// Strategy:
//  - Split by team panels (look for h3 with team name and a following table list)
//  - For each team, look for lists/rows under QB/RB/WR/TE headings and extract first 3 names for each
function parseFantasyPros(html){
  const out = {};
  const body = clean(html);

  // Find team blocks via headings with known team names
  for (const [teamFull, abbr] of Object.entries(TEAM_MAP)){
    const h3re = new RegExp(`<h3[^>]*>\\s*${teamFull}[^<]*</h3>([\\s\\S]*?)(?:<h3|$)`, 'i');
    const blockMatch = body.match(h3re);
    if (!blockMatch) continue;
    const block = blockMatch[1];

    // For each position, capture names appearing near that label
    const teamCharts = { RB:[], WR:[], TE:[], QB:[] };
    const POS = [
      { key:'QB', label: '(QB|Quarterbacks?)' },
      { key:'RB', label: '(RB|Running\\s*Backs?)' },
      { key:'WR', label: '(WR|Wide\\s*Receivers?)' },
      { key:'TE', label: '(TE|Tight\\s*Ends?)' },
    ];

    for (const pos of POS){
      const posRe = new RegExp(`(${pos.label})[\\s\\S]*?(<table[\\s\\S]*?</table>|<ul[\\s\\S]*?</ul>)`, 'i');
      const posBlock = block.match(posRe);
      if (!posBlock) continue;
      const tableOrList = posBlock[2];

      // extract up to 4 linked names or strong tags inside that block
      const nameTags = tableOrList.match(/<a [^>]*>([^<]+)<\/a>|<strong[^>]*>([^<]+)<\/strong>|<span[^>]*class="player-name"[^>]*>([^<]+)<\/span>/gi) || [];
      const names = [];
      for (const t of nameTags){
        const nm = innerText(t);
        if (nm && !names.includes(nm)) names.push(nm);
        if (names.length >= 4) break;
      }

      // fallback: plain text cells
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

      // build pos array (up to 3-deep)
      let depth=0;
      for (const nm of names.slice(0,3)){
        depth += 1;
        const role = `${pos.key}${depth}`;
        teamCharts[pos.key].push({ name:nm, role, ...defaultShares(pos.key, depth) });
      }
    }

    out[abbr] = teamCharts;
  }

  return out;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);
    const url = qs.url || 'https://www.fantasypros.com/nfl/depth-charts.php';

    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Netlify Functions DepthChartsBot)' } });
    if (!r.ok) {
      return { statusCode: r.status, body: JSON.stringify({ ok:false, error:`Fetch failed ${r.status}`, url }) };
    }
    const html = await r.text();
    const charts = parseFantasyPros(html);

    const teams = Object.keys(charts);
    if (!teams.length) {
      return { statusCode: 502, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'Parser found 0 teams. Site layout may have changed.', urlSample: url }) };
    }

    const store = blobsStoreNFL();
    const key = `depth/${season}/week${week}/depth-charts.json`;
    await store.set(key, JSON.stringify(charts, null, 2), { contentType: 'application/json; charset=utf-8' });

    return {
      statusCode: 200,
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ ok:true, season, week, saved: key, teams: teams.length, sampleTeam: teams[0], sample: charts[teams[0]] })
    };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
