// netlify/functions/nfl-predictions-get/index.cjs
// Simple rule-based picks + parlay suggestions sourced from nfl-odds-get.
// This is intentionally transparent and reproducible (no hidden ML).
// Env: none (reads from sibling function).

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

function pctToStr(p) {
  if (p == null) return null;
  return (p*100).toFixed(1) + "%";
}

function choosePick(g) {
  const c = g.consensus || {};
  const picks = [];
  if (c.h2h?.home_implied_avg != null && c.h2h?.away_implied_avg != null) {
    const fav = c.h2h.home_implied_avg > c.h2h.away_implied_avg ? g.home_team : g.away_team;
    const favPct = Math.max(c.h2h.home_implied_avg, c.h2h.away_implied_avg);
    picks.push({ type: "moneyline", team: fav, confidence: favPct });
  }
  if (c.spreads) {
    const conf = 0.55 - 0.02 * Math.min(7, Math.abs(c.spreads.line || 0)); // smaller spread -> slightly higher confidence
    picks.push({ type: "spread", team: c.spreads.team, line: c.spreads.line, confidence: Math.max(0.5, conf) });
  }
  if (c.totals) {
    const conf = 0.54;
    picks.push({ type: "total", side: c.totals.side, line: c.totals.line, confidence: conf });
  }
  // choose highest confidence
  picks.sort((a,b)=> (b.confidence||0) - (a.confidence||0));
  return picks[0] || null;
}

function toRow(g) {
  const pick = choosePick(g);
  return {
    id: g.id,
    kickoff: g.commence_time,
    matchup: `${g.away_team} @ ${g.home_team}`,
    ml_home_best: g.consensus?.h2h?.home_best?.price ?? null,
    ml_away_best: g.consensus?.h2h?.away_best?.price ?? null,
    ml_home_imp: g.consensus?.h2h?.home_implied_avg ?? null,
    ml_away_imp: g.consensus?.h2h?.away_implied_avg ?? null,
    spread_team: g.consensus?.spreads?.team ?? null,
    spread_line: g.consensus?.spreads?.line ?? null,
    total_side: g.consensus?.totals?.side ?? null,
    total_line: g.consensus?.totals?.line ?? null,
    pick
  };
}

function buildParlay(rows) {
  const cand = rows.filter(r => r.pick && r.pick.confidence >= 0.55);
  cand.sort((a,b)=> (b.pick.confidence||0) - (a.pick.confidence||0));
  const legs = cand.slice(0, 5); // up to 5
  return {
    legs: legs.map(r => ({
      gameId: r.id,
      matchup: r.matchup,
      leg: r.pick.type === "moneyline"
        ? `${r.pick.team} ML`
        : r.pick.type === "spread"
          ? `${r.pick.team} ${r.pick.line>0?'+':''}${r.pick.line}`
          : `${r.pick.side} ${r.pick.line}`,
      confidence: r.pick.confidence
    }))
  };
}

exports.handler = async () => {
  try {
    const resp = await fetch(`${process.env.URL || ""}/.netlify/functions/nfl-odds-get`);
    const data = await resp.json();
    if (!data?.ok) {
      return { statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:"odds fetch failed", data }) };
    }
    const rows = data.games.map(toRow);
    const parlay = buildParlay(rows);
    return { statusCode: 200, headers: {'content-type':'application/json', 'cache-control':'no-store'}, body: JSON.stringify({ ok:true, updated: new Date().toISOString(), rows, parlay }) };
  } catch (err) {
    return { statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
};
