// netlify/functions/hrr-slate.mjs
// MLB Over 1.5 Hits+Runs+RBIs model with matchup & park context (fixed duplicate fetchJson).
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const americanToDecimal = (a) => { if(a==null) return null; const n=Number(a); if(!isFinite(n)) return null; return n>0?1+n/100:1+100/Math.abs(n); };
const decFromAm = americanToDecimal;

function poissonAtLeast2(lambda){
  const L = Math.max(0, lambda);
  const e = Math.exp(-L);
  return clamp(1 - e*(1+L), 0, 1);
}

function absoluteFunctionUrl(event, path) {
  const h = event?.headers || {};
  const proto = h['x-forwarded-proto'] || h['x-forwarded-protocol'] || 'https';
  const host = h['x-forwarded-host'] || h['host'];
  if (host) return `${proto}://${host}${path}`;
  return path;
}

async function fetchJson(url, headers={}) {
  const r = await fetch(url, { headers: { "User-Agent":"hrr/1.2", ...headers }, cache:"no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}

async function getOdds(event, date) {
  const url = absoluteFunctionUrl(event, `/.netlify/functions/odds-hrr?date=${date}`);
  return await fetchJson(url);
}

async function getGameContext(event, date) {
  try {
    const url = absoluteFunctionUrl(event, `/.netlify/functions/mlb-game-context?date=${date}`);
    const ctx = await fetchJson(url);
    const map = new Map();
    for (const g of (ctx?.context||[])) {
      map.set(g.gamePk, g);
      const keyTeams = `${g.away?.name||""}@${g.home?.name||""}`.toLowerCase();
      map.set(keyTeams, g);
    }
    return map;
  } catch { return new Map(); }
}

// Park factor map
const PARK_FACTOR = {
  "Colorado Rockies": 1.08, "Cincinnati Reds": 1.05, "Texas Rangers": 1.04, "Boston Red Sox": 1.04,
  "Atlanta Braves": 1.03, "New York Yankees": 1.03, "Los Angeles Dodgers": 1.02, "Chicago White Sox": 1.02,
  "Arizona Diamondbacks": 1.02, "Chicago Cubs": 1.02, "Philadelphia Phillies": 1.02, "Kansas City Royals": 1.02,
  "San Diego Padres": 0.98, "Seattle Mariners": 0.98, "Tampa Bay Rays": 0.98, "Miami Marlins": 0.97,
  "Detroit Tigers": 0.97, "Cleveland Guardians": 0.97,
};

async function getBatterStats(ids) {
  if (!ids.length) return {};
  const hydrate = encodeURIComponent("stats(type=season,group=hitting),stats(type=lastXGames,group=hitting,gameLog=false,gamesPlayed=15)");
  const people = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=${hydrate}`, { cache:"no-store" }).then(r=>r.json()).catch(()=>({ people:[] }));
  const out = {};
  for (const p of (people.people||[])) {
    const season = (p.stats||[]).find(s=>s.type?.displayName==="season" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
    const last15 = (p.stats||[]).find(s=>s.type?.displayName==="lastXGames" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
    const sPA = Number(season.plateAppearances || 0);
    const sAB = Number(season.atBats || 0);
    const sH = Number(season.hits || 0);
    const sR = Number(season.runs || 0);
    const sRBI = Number(season.rbi || 0);
    const lPA = Number(last15.plateAppearances || 0);
    const lAB = Number(last15.atBats || 0);
    const lH = Number(last15.hits || 0);
    const lR = Number(last15.runs || 0);
    const lRBI = Number(last15.rbi || 0);
    const batHand = p?.batSide?.code || p?.batSide?.description || null;
    const seasonRates = {
      h_per_pa: sPA>0 ? sH/sPA : 0.11,
      r_per_pa: sPA>0 ? sR/sPA : 0.12,
      rbi_per_pa: sPA>0 ? sRBI/sPA : 0.12,
      ab_per_pa: sPA>0 ? sAB/sPA : 0.86,
    };
    const last15Rates = {
      h_per_pa: lPA>0 ? lH/lPA : seasonRates.h_per_pa,
      r_per_pa: lPA>0 ? lR/lPA : seasonRates.r_per_pa,
      rbi_per_pa: lPA>0 ? lRBI/lPA : seasonRates.rbi_per_pa,
      ab_per_pa: lPA>0 ? lAB/lPA : seasonRates.ab_per_pa,
    };
    out[p.fullName?.toLowerCase()] = {
      id: p.id, fullName: p.fullName, batHand,
      seasonRates, last15Rates, seasonPA: sPA, last15PA: lPA
    };
  }
  return out;
}

async function lookupMLBId(name) {
  const part = encodeURIComponent(name.split(" ").slice(-1)[0]);
  const url = `https://lookup-service-prod.mlb.com/json/named.search_player_all.bam?sport_code=%27mlb%27&active_sw=%27Y%27&name_part=%27${part}%25%27`;
  const json = await fetchJson(url).catch(()=>null);
  if (!json) return null;
  const row = json?.search_player_all?.queryResults?.row;
  const rows = Array.isArray(row) ? row : (row? [row] : []);
  const lower = name.toLowerCase();
  const exact = rows.find(r => (r?.name_display_first_last||"").toLowerCase() === lower);
  const best = exact || rows.find(r => (r?.name_display_first_last||"").toLowerCase().includes(lower)) || rows[0];
  const id = Number(best?.player_id || 0) || null;
  return id;
}

function extractOpponentInfo(gameCtx, gameStr, playerTeamGuess) {
  const g = gameCtx.get((gameStr||"").toLowerCase()) || null;
  if (!g) return { oppName:null, oppHand:null, bullpenIP3d:0, homeTeam:null };
  const homeTeam = g.home?.name || null;
  const opp = (playerTeamGuess && g.home?.name && g.away?.name)
    ? (playerTeamGuess.toLowerCase() === (g.home.name||"").toLowerCase() ? g.away : g.home)
    : g.away;
  const sp = opp?.starter || {};
  return { oppName: sp.name || null, oppHand: sp.hand || null, bullpenIP3d: Number(opp?.bullpenLast3dIP||0) || 0, homeTeam };
}

function handednessAdj(batHand, oppHand){
  if (!batHand || !oppHand) return 1.0;
  const b = batHand[0].toUpperCase();
  const p = oppHand[0].toUpperCase();
  if (b === 'S') return 1.02;
  if (b === 'R' && p === 'L') return 1.03;
  if (b === 'L' && p === 'R') return 1.03;
  if (b === 'R' && p === 'R') return 0.99;
  if (b === 'L' && p === 'L') return 0.99;
  return 1.0;
}

export const handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const odds = await getOdds(event, date);
    const offers = (odds?.offers || []);
    if (!offers.length) {
      return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, reason:"no_offers", date, count:0, players:[] }) };
    }

    const nameToId = new Map();
    for (const o of offers) {
      const n = o.player;
      if (nameToId.has(n)) continue;
      const id = await lookupMLBId(n);
      if (id) nameToId.set(n, id);
    }
    const ids = Array.from(nameToId.values());
    const stats = await getBatterStats(ids);
    const gameCtx = await getGameContext(event, date);

    const rows = [];
    for (const o of offers) {
      const key = o.player.toLowerCase();
      const st = stats[key];
      if (!st) continue;
      const { oppName, oppHand, bullpenIP3d, homeTeam } = extractOpponentInfo(gameCtx, o.game, o.team);

      const rS = st.seasonRates, rL = st.last15Rates;
      let h_pa = 0.6*rS.h_per_pa + 0.4*rL.h_per_pa;
      let r_pa = 0.6*rS.r_per_pa + 0.4*rL.r_per_pa;
      let rbi_pa = 0.6*rS.rbi_per_pa + 0.4*rL.rbi_per_pa;
      const hMult = handednessAdj(st.batHand, oppHand);
      h_pa *= hMult; r_pa *= hMult; rbi_pa *= hMult;
      let expPA = clamp(3.6 + Math.min(0.7, (st.seasonPA||0)/650 * 0.7), 3.2, 5.2);

      let adj = 1.0;
      if (bullpenIP3d && bullpenIP3d > 9) adj += 0.04;
      const pf = homeTeam ? (PARK_FACTOR[homeTeam] || 1.00) : 1.00;
      adj *= pf;

      const expHits = expPA * h_pa;
      const expRuns = expPA * r_pa;
      const expRBI  = expPA * rbi_pa;
      const lambda = adj * (expHits + expRuns + expRBI);

      const L = Math.max(0, lambda);
      const e = Math.exp(-L);
      const prob = clamp(1 - e*(1+L), 0, 1);
      const modelOdds = prob>0 ? Math.round(prob>=0.5 ? -100/(1/prob - 1) : (1/prob - 1)*100) : null;
      const dec = o.decimal || decFromAm(o.american);
      const ev = dec ? prob*(dec-1)-(1-prob) : null;

      const why = [
        `rates/PA h:${h_pa.toFixed(3)} r:${r_pa.toFixed(3)} rbi:${rbi_pa.toFixed(3)}`,
        `expPA ${expPA.toFixed(1)}`,
        st.batHand ? `bats ${st.batHand}` : null,
        oppName ? `oppSP ${oppName}${oppHand?("/"+oppHand):""}` : null,
        bullpenIP3d ? `pen3d ${bullpenIP3d.toFixed(1)} IP` : null,
        pf!==1 ? `park x${pf.toFixed(2)}` : null,
      ].filter(Boolean).join(" • ");

      rows.push({ player: o.player, team: o.team||"", game: o.game||"", line: o.point, modelProb: prob, modelOdds, realOdds: o.american ?? null, ev, why });
    }

    rows.sort((a,b)=> (b.ev??-1) - (a.ev??-1));
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, market:"batter_hits_runs_rbis", date, count: rows.length, players: rows }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, error:String(err), count:0, players:[] }) };
  }
};
