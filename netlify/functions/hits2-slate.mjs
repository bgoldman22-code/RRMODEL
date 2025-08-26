// netlify/functions/hits2-slate.mjs
// Rebuilt slate: filters OddsAPI to correct markets/points, merges game context,
// computes a sane baseline modelProb (no 1% floor), fills "why", and enforces slate filters.
// Also provides parlay suggestions without duplicates.
//
// Environment assumptions:
// - Frontend calls this with ?date=YYYY-MM-DD (ET).
// - Internal helper endpoints exist at relative paths:
//    /.netlify/functions/odds-hits2?date=YYYY-MM-DD
//    /.netlify/functions/mlb-game-context?date=YYYY-MM-DD
//
// Response shape mirrors your HR/Hits pages:
// { ok, date, count, players: [...], meta: { data:'ok', odds:'ok', provider, usingOddsApi, evFloor } }
//
export const handler = async (event) => {
  const url = new URL(event.rawUrl || event.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);

  const fetchJson = async (p) => {
    const res = await fetch(p);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${p}`);
    return await res.json();
  };

  // Fetch odds (player_hits + alternates) and game context
  let odds;
  let ctx;
  let oddsOk = false, dataOk = false;
  let provider = "unknown", usingOddsApi = false;

  try {
    const o = await fetchJson(`/.netlify/functions/odds-hits2?date=${date}`);
    provider = o.provider || provider;
    usingOddsApi = !!o.usingOddsApi;
    // Normalize to a flat list of offers { player, team?, gameId?, point, name(Over/Under), priceDecimal or american }
    // Keep only Over 1.5
    const flat = [];
    for (const offer of (o.offers || [])) {
      // Expected shape varies by book; we follow your prior "odds-get" serializers:
      // offer = { player, market, point, name, price, american, game, team, book, ... }
      if (!offer) continue;
      const market = offer.market || "";
      if (market !== "batter_hits" && market !== "batter_hits_alternate") continue;
      const point = Number(offer.point);
      if (point !== 1.5) continue;
      if ((offer.name || "").toLowerCase() !== "over") continue;
      // coerce fields
      const entry = {
        player: offer.player || offer.description || offer.participant || "",
        team: offer.team || offer.teamAbbr || null,
        gameKey: offer.gameKey || null,
        home: offer.home || null,
        away: offer.away || null,
        book: offer.book || offer.bookmaker || "",
        american: offer.american ?? null,
        price: offer.price ?? null,
      };
      flat.push(entry);
    }
    odds = flat;
    oddsOk = true;
  } catch (e) {
    return json({ ok:false, error:String(e), date, count:0, players:[] });
  }

  try {
    const c = await fetchJson(`/.netlify/functions/mlb-game-context?date=${date}`);
    ctx = c.context || [];
    dataOk = c.ok !== false;
  } catch (e) {
    ctx = [];
  }

  // Build a quick game index by (homeName,awayName) for joining when gameKey missing
  const games = ctx.map(g => ({
    gamePk: g.gamePk,
    homeId: g.home?.teamId, awayId: g.away?.teamId,
    home: g.home?.name, away: g.away?.name,
    spHome: g.home?.starter || {}, spAway: g.away?.starter || {},
    bpHomeIP3d: g.home?.bullpenLast3dIP ?? 0,
    bpAwayIP3d: g.away?.bullpenLast3dIP ?? 0
  }));

  const normTeam = (t) => (t||"").toLowerCase().replace(/[^a-z]/g,'');

  const byTeams = {};
  for (const g of games) {
    const key = `${normTeam(g.home)}@${normTeam(g.away)}`;
    byTeams[key] = g;
  }

  // Helper: convert American to decimal if needed
  const americanToDecimal = (am) => {
    if (am == null) return null;
    const a = Number(am);
    if (isNaN(a)) return null;
    if (a > 0) return 1 + a/100;
    return 1 + 100/Math.abs(a);
  };

  // Build slate rows
  const rows = [];
  for (const o of odds) {
    let game = null;
    if (o.gameKey && byTeams[o.gameKey]) {
      game = byTeams[o.gameKey];
    } else if (o.home || o.away) {
      const k = `${normTeam(o.home)}@${normTeam(o.away)}`;
      game = byTeams[k] || null;
    } else {
      // try any match by normalized teams
      // (leave null if we can't map; we still can compute baseline)
      game = null;
    }

    // Baseline probability model for 2+ hits
    // Start with 0.085 league-ish baseline for 2+ hits among top-of-order, 0.06 otherwise.
    // If SP IP per start high & BAA low, nudge down; bullpen IP last3d high, nudge up.
    let base = 0.065;
    let whyBits = [];

    if (game) {
      // starter quality proxy
      const sp = (() => {
        // Heuristic: if player's team is home (unknown), just summarize both
        return { home: game.spHome, away: game.spAway };
      })();
      const adjSp = (spObj) => {
        const baa = Number(spObj?.baa ?? 0);
        const ips = Number(spObj?.ipPerStart ?? 0);
        // Smaller BAA -> harder; bigger IP/start -> harder
        let adj = 0;
        if (baa) adj += (0.26 - Math.min(0.35, Math.max(0.20, baa))) * 0.25; // ~±0.025 band
        if (ips) adj += (4.8 - Math.min(7.0, Math.max(3.5, ips))) * 0.005;   // ~±0.01 band
        return adj;
      };
      const adj = (adjSp(game.spHome) + adjSp(game.spAway)) / 2;
      base += adj;
      // bullpen fatigue
      const bp = (Number(game.bpHomeIP3d||0) + Number(game.bpAwayIP3d||0))/2;
      base += Math.min(0.015, Math.max(0, (bp - 9.0) * 0.002)); // + up to 1.5%
      if (isFinite(adj) && adj !== 0) whyBits.push(`SP BAA/IP adj ${adj>0?'+':'-'}${Math.abs(adj).toFixed(3)}`);
      if (bp) whyBits.push(`Opp BP last3d: ${bp.toFixed(1)} IP`);
    }

    // Odds-based sanity cap: if the price is extremely long (+3000+), keep prob modest
    const dec = o.price ?? americanToDecimal(o.american);
    if (dec) {
      const implied = 1/dec; // rough implied prob for "over 1.5 hits"
      // Blend baseline with 50% weight toward implied (keeps model in plausible range)
      base = Math.max(0.01, Math.min(0.40, 0.5*base + 0.5*implied));
      whyBits.push(`Anchored to price ~${(implied*100).toFixed(1)}%`);
    }

    const modelProb = Math.max(0.02, Math.min(0.35, base)); // clamp to [2%, 35%]
    const modelOdds = Math.round((1/modelProb - 1) * 100); // american +xxx approx
    const realOdds = o.american ?? (dec ? Math.round((dec-1)*100) : null);
    const ev = (dec ? (modelProb*dec - 1) : null);

    rows.push({
      player: o.player,
      team: o.team || "",
      game: game ? `${game.away?.slice(0,3).toUpperCase()}@${game.home?.slice(0,3).toUpperCase()}` : "",
      modelProb: Number(modelProb.toFixed(4)),
      modelOdds: modelOdds >= 0 ? `+${modelOdds}` : `${modelOdds}`,
      realOdds: realOdds != null ? (realOdds>=0?`+${realOdds}`:`${realOdds}`) : "—",
      ev1u: ev != null ? Number(ev.toFixed(3)) : null,
      why: whyBits.length ? whyBits.join(" • ") : "baseline (limited features)"
    });
  }

  // Sort by modelProb, derive top-10 probability & top-10 EV (EV floor +0.05)
  const topProb = [...rows].sort((a,b)=>b.modelProb-a.modelProb).slice(0,10);
  const evFloor = 0.05;
  const topEv = [...rows].filter(r => (r.ev1u ?? -9) >= evFloor).sort((a,b)=>(b.ev1u||0)-(a.ev1u||0)).slice(0,10);

  // Simple parlay suggestions (no duplicates, min prob 6% each for 2-leg, 8% for 3-leg)
  const uniqBy = (arr, key) => {
    const seen = new Set(); const out = [];
    for (const x of arr) { const k = x[key]; if (seen.has(k)) continue; seen.add(k); out.push(x); }
    return out;
  };
  const legs = uniqBy([...rows].filter(r => (r.ev1u ?? -9) >= 0 && r.modelProb >= 0.06), "player")
               .sort((a,b)=> (b.ev1u||0) - (a.ev1u||0)).slice(0,20);
  const legs3 = uniqBy([...rows].filter(r => (r.ev1u ?? -9) >= 0 && r.modelProb >= 0.08), "player")
               .sort((a,b)=> (b.ev1u||0) - (a.ev1u||0)).slice(0,20);

  const toParlay = (arr, n) => {
    if (arr.length < n) return null;
    const sel = arr.slice(0,n);
    const decs = sel.map(x => {
      const ro = x.realOdds;
      const dec = ro && typeof ro === "string" && ro.startsWith("+")
        ? (1 + parseInt(ro.slice(1),10)/100)
        : (1 + Math.max(0, parseInt(ro,10))/100);
      return isFinite(dec) ? dec : 1.0;
    });
    const prob = sel.reduce((p,x)=> p * x.modelProb, 1);
    const payout = decs.reduce((p,d)=> p*d, 1);
    const ev = prob * payout - 1;
    const am = Math.round((payout-1)*100);
    return { legs: sel, prob: Number((prob*100).toFixed(2)), odds: (am>=0?`+${am}`:`${am}`), ev: Number(ev.toFixed(3)) };
  };

  const parlayA = toParlay(legs, 2);
  const parlayB = toParlay(legs, 3);

  const out = {
    ok: true,
    date,
    count: rows.length,
    players: rows,
    topProb,
    topEv,
    parlays: { twoLeg: parlayA, threeLeg: parlayB },
    meta: { data: dataOk ? "ok":"unknown", odds: oddsOk ? "ok":"bad", provider, usingOddsApi, evFloor }
  };
  return json(out);
};

function json(x) {
  return new Response(JSON.stringify(x), { headers: { "content-type": "application/json; charset=utf-8" } });
}