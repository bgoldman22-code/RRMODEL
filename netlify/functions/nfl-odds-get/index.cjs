// netlify/functions/nfl-odds-get/index.cjs
// Proxy + normalizer for The Odds API
// Env: ODDS_API_KEY (required)

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.config = { schedule: null };

const API_BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl";

function amToImplied(american) {
  const a = Number(american);
  if (!a || isNaN(a)) return null;
  return a > 0 ? 100 / (a + 100) : (-a) / (-a + 100);
}

function normalizeGame(ev) {
  const out = {
    id: ev.id,
    commence_time: ev.commence_time,
    home_team: ev.home_team,
    away_team: ev.away_team,
    bookmakers: []
  };
  (ev.bookmakers||[]).forEach(bk => {
    const entry = { key: bk.key, title: bk.title, markets: {} };
    (bk.markets||[]).forEach(m => {
      if (["h2h","spreads","totals"].includes(m.key)) {
        entry.markets[m.key] = m.outcomes || [];
      }
    });
    out.bookmakers.push(entry);
  });

  // Build consensus
  const collect = (key) => {
    const rows = [];
    (out.bookmakers||[]).forEach(bk => {
      const m = bk.markets[key];
      if (!m) return;
      m.forEach(o => {
        rows.push({
          book: bk.title,
          key,
          name: o.name,
          price: o.price,
          point: o.point ?? null
        });
      });
    });
    return rows;
  };

  const ml = collect("h2h");
  const homeRows = ml.filter(r => r.name === ev.home_team);
  const awayRows = ml.filter(r => r.name === ev.away_team);
  const best = (rows, desc=true) => rows.slice().sort((a,b)=>desc ? (b.price - a.price) : (Math.abs(a.price)-Math.abs(b.price)))[0] || null;

  const avgImplied = (rows) => {
    const vals = rows.map(r => amToImplied(r.price)).filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((a,b)=>a+b,0) / vals.length;
  };

  const sp = collect("spreads");
  const cluster = (rows, keyFn) => {
    const map = new Map();
    rows.forEach(r => {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    const arr = Array.from(map.entries()).map(([k,rows])=>({k,rows}));
    arr.sort((a,b)=>b.rows.length - a.rows.length);
    return arr[0] || null;
  };
  const spTop = cluster(sp, r => `${r.name}@@${r.point}`);

  const tot = collect("totals");
  const totTop = cluster(tot, r => `${r.name}@@${r.point}`);

  out.consensus = {
    h2h: {
      home_best: best(homeRows, true),
      away_best: best(awayRows, true),
      home_implied_avg: avgImplied(homeRows),
      away_implied_avg: avgImplied(awayRows)
    },
    spreads: spTop ? {
      team: spTop.rows[0].name,
      line: Number(spTop.rows[0].point),
      best_price: best(spTop.rows, false)?.price ?? null
    } : null,
    totals: totTop ? {
      side: totTop.rows[0].name, // Over or Under
      line: Number(totTop.rows[0].point),
      best_price: best(totTop.rows, false)?.price ?? null
    } : null
  };

  return out;
}

exports.handler = async (event) => {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return { statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:"Missing env ODDS_API_KEY" }) };
    }
    const regions = event.queryStringParameters?.regions || "us";
    const markets = event.queryStringParameters?.markets || "h2h,spreads,totals";
    const resp = await fetch(`${API_BASE}/odds/?regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(markets)}&oddsFormat=american&apiKey=${apiKey}`);
    if (!resp.ok) {
      const txt = await resp.text();
      return { statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, upstream:resp.status, body:txt }) };
    }
    const data = await resp.json();
    const games = (data||[]).map(normalizeGame);
    return { statusCode: 200, headers: {'content-type':'application/json','cache-control':'no-store'}, body: JSON.stringify({ ok:true, count: games.length, games }) };
  } catch (err) {
    return { statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
};
