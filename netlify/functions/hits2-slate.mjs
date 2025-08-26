// netlify/functions/hits2-slate.mjs
// Build 2+ hits slate from odds + StatsAPI; compute model probability and EV.
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const americanToDecimal = (a) => { if(a==null) return null; const n=Number(a); if(!isFinite(n)) return null; return n>0?1+n/100:1+100/Math.abs(n); };
function binomAtLeast2(ab, p){ const q=1-p; return clamp(1 - (Math.pow(q,ab) + ab*p*Math.pow(q,ab-1)), 0, 1); }

function absoluteFunctionUrl(event, path) {
  const h = event?.headers || {};
  const proto = h['x-forwarded-proto'] || h['x-forwarded-protocol'] || 'https';
  const host = h['x-forwarded-host'] || h['host'];
  if (host) return `${proto}://${host}${path}`;
  // fallback for local or unit tests
  return path;
}

async function fetchJson(url, headers={}) {
  const r = await fetch(url, { headers: { "User-Agent":"hits2/2.1", ...headers }, cache:"no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}
async function getOdds(event, date) {
  const url = absoluteFunctionUrl(event, `/.netlify/functions/odds-hits2?date=${date}`);
  return await fetchJson(url);
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
  const best = exact || rows[0];
  const id = Number(best?.player_id || 0) || null;
  return id;
}

async function getBatterStats(ids) {
  if (!ids.length) return {};
  const hydrate = encodeURIComponent("stats(type=season,group=hitting),stats(type=lastXGames,group=hitting,gameLog=false,gamesPlayed=15)");
  const people = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=${hydrate}`, { cache:"no-store" }).then(r=>r.json()).catch(()=>({ people:[] }));
  const out = {};
  for (const p of (people.people||[])) {
    const season = (p.stats||[]).find(s=>s.type?.displayName==="season" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
    const last15 = (p.stats||[]).find(s=>s.type?.displayName==="lastXGames" && s.group?.displayName==="hitting")?.splits?.[0]?.stat || {};
    const avg = Number(season.avg ?? season.avgString ?? 0) || 0;
    const l15 = Number(last15.avg ?? last15.avgString ?? 0) || avg;
    const pa = Number(season.plateAppearances || 0);
    out[p.fullName?.toLowerCase()] = { id: p.id, fullName: p.fullName, seasonAVG: avg, last15AVG: l15, seasonPA: pa };
  }
  return out;
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
      if (nameToId.has(o.player)) continue;
      const id = await lookupMLBId(o.player);
      if (id) nameToId.set(o.player, id);
    }
    const ids = Array.from(nameToId.values());
    const stats = await getBatterStats(ids);

    const rows = [];
    for (const o of offers) {
      const st = stats[o.player.toLowerCase()];
      if (!st) continue;
      const pAB = Math.max(0.15, Math.min(0.45, 0.6*(st.seasonAVG||0.24) + 0.4*(st.last15AVG||st.seasonAVG||0.24)));
      const expAB = Math.round(clamp(3.9 + Math.min(0.5, (st.seasonPA || 0) / 700), 3.5, 5.0));
      const prob = binomAtLeast2(expAB, pAB);
      const modelOdds = prob>0 ? Math.round(prob>=0.5 ? -100/(1/prob - 1) : (1/prob - 1)*100) : null;
      const dec = o.decimal || americanToDecimal(o.american);
      const ev = dec ? prob*(dec-1)-(1-prob) : null;
      const why = `season AVG ${(st.seasonAVG||0).toFixed(3)} • L15 ${(st.last15AVG||0).toFixed(3)} • expAB ${expAB}`;
      rows.push({ player: o.player, team: "", game: o.game || "", modelProb: prob, modelOdds, realOdds: o.american ?? null, ev, why });
    }

    rows.sort((a,b)=> (b.ev??-1) - (a.ev??-1));
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, date, count: rows.length, players: rows }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, error:String(err), count:0, players:[] }) };
  }
};
