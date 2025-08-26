// netlify/functions/hrr-slate.mjs
// Build MLB Over 1.5 Hits+Runs+RBIs slate from odds + StatsAPI + game context; compute model probability and EV.
// Approach: Poisson for total events with lambda = E[hits] + E[runs] + E[rbi]. Adjust with SP strength, bullpen fatigue, H/A.
// Output: player | game | modelProb | modelOdds | realOdds | EV | Why

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const americanToDecimal = (a) => { if(a==null) return null; const n=Number(a); if(!isFinite(n)) return null; return n>0?1+n/100:1+100/Math.abs(n); };
const decFromAm = americanToDecimal;
const expm1 = Math.expm1 || ((z)=>Math.exp(z)-1);

// Poisson P(X>=2) = 1 - (e^-λ * (1 + λ))
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
  const r = await fetch(url, { headers: { "User-Agent":"hrr/1.0", ...headers }, cache:"no-store" });
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
      // Also map by teams for convenience
      const keyA = `${g.away?.name||""}@${g.home?.name||""}`.toLowerCase();
      map.set(keyA, g);
    }
    return map;
  } catch { return new Map(); }
}

// MLB People: season + last15 for batters
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
      id: p.id, fullName: p.fullName,
      seasonRates, last15Rates,
      seasonPA: sPA, last15PA: lPA
    };
  }
  return out;
}

// Resolve MLBAM id by name
async function lookupMLBId(name) {
  const part = encodeURIComponent(name.split(" ").slice(-1)[0]);
  const url = `https://lookup-service-prod.mlb.com/json/named.search_player_all.bam?sport_code=%27mlb%27&active_sw=%27Y%27&name_part=%27${part}%25%27`;
  const json = await fetchJson(url).catch(()=>null);
  if (!json) return null;
  const row = json?.search_player_all?.queryResults?.row;
  const rows = Array.isArray(row) ? row : (row? [row] : []);
  const lower = name.toLowerCase();
  const exact = rows.find(r => (r?.name_display_first_last||"").toLowerCase() === lower);
  const best = exact || rows[0];
  const id = Number(best?.player_id || 0) || null;
  return id;
}

// Opposing SP helper (from mlb-game-context)
function extractOpponentInfo(gameCtx, gameStr, playerTeamGuess) {
  // gameStr like "Away@Home"
  const g = gameCtx.get((gameStr||"").toLowerCase()) || null;
  if (!g) return { oppName:null, oppHand:null, bullpenIP3d:0 };
  const opp = (playerTeamGuess && g.home?.name && g.away?.name)
    ? (playerTeamGuess.toLowerCase() === (g.home.name||"").toLowerCase() ? g.away : g.home)
    : g.away; // default
  const sp = opp?.starter || {};
  return { oppName: sp.name || null, oppHand: sp.hand || null, bullpenIP3d: Number(opp?.bullpenLast3dIP||0) || 0 };
}

// Model
function blend(a, b, w=0.4){ return (1-w)*a + w*b; }

export const handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);

    // 1) Odds
    const odds = await getOdds(event, date);
    const offers = (odds?.offers || []);
    if (!offers.length) {
      return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, reason:"no_offers", date, count:0, players:[] }) };
    }

    // 2) MLB ids
    const nameToId = new Map();
    for (const o of offers) {
      const n = o.player;
      if (nameToId.has(n)) continue;
      const id = await lookupMLBId(n);
      if (id) nameToId.set(n, id);
    }
    const ids = Array.from(nameToId.values());
    const stats = await getBatterStats(ids);

    // 3) Game context (opposing SP, bullpen fatigue)
    const gameCtx = await getGameContext(event, date);

    const rows = [];
    for (const o of offers) {
      const key = o.player.toLowerCase();
      const st = stats[key];
      if (!st) continue;

      // Rates (season/last15 blend)
      const rS = st.seasonRates, rL = st.last15Rates;
      const h_pa = blend(rS.h_per_pa, rL.h_per_pa, 0.4);
      const r_pa = blend(rS.r_per_pa, rL.r_per_pa, 0.4);
      const rbi_pa = blend(rS.rbi_per_pa, rL.rbi_per_pa, 0.4);
      const ab_pa = blend(rS.ab_per_pa, rL.ab_per_pa, 0.3);

      // Expected PA: baseline 4.3 with tiny adjustment via season PA (playing time proxy)
      let expPA = clamp(3.6 + Math.min(0.7, (st.seasonPA||0)/650 * 0.7), 3.2, 5.2);

      // Opponent adjustment
      const { oppName, oppHand, bullpenIP3d } = extractOpponentInfo(gameCtx, o.game, o.team);
      let adj = 1.0;
      if (bullpenIP3d && bullpenIP3d > 9) adj += 0.04;         // tired pen -> small bump
      if (oppHand === "L" || oppHand === "R") adj += 0.0;       // placeholder; could use splits

      // Home vs away (approx)
      if (o.game && o.game.includes("@")) {
        const [away, home] = o.game.split("@");
        // crude home boost
        // if player's team known, we could detect; absent that, tiny neutral +0
      }

      // Expected components
      const expHits = expPA * h_pa;
      const expRuns = expPA * r_pa;
      const expRBI  = expPA * rbi_pa;
      const lambda = adj * (expHits + expRuns + expRBI);

      const prob = poissonAtLeast2(lambda);
      const modelOdds = prob>0 ? Math.round(prob>=0.5 ? -100/(1/prob - 1) : (1/prob - 1)*100) : null;
      const dec = o.decimal || decFromAm(o.american);
      const ev = dec ? prob*(dec-1)-(1-prob) : null;

      const why = [
        `rates h:${h_pa.toFixed(3)} r:${r_pa.toFixed(3)} rbi:${rbi_pa.toFixed(3)} per PA`,
        `expPA ${expPA.toFixed(1)}`,
        oppName ? `oppSP ${oppName}${oppHand?("/"+oppHand):""}` : null,
        bullpenIP3d ? `pen3d ${bullpenIP3d.toFixed(1)} IP` : null,
      ].filter(Boolean).join(" • ");

      rows.push({ player: o.player, team: o.team||"", game: o.game||"", line: o.point, modelProb: prob, modelOdds, realOdds: o.american ?? null, ev, why });
    }

    rows.sort((a,b)=> (b.ev??-1) - (a.ev??-1));
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, market:"batter_hits_runs_rbis", date, count: rows.length, players: rows }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, error:String(err), count:0, players:[] }) };
  }
};
