// netlify/functions/generate-parlays.js
// ESM function that builds parlays from payload { odds[], model{}, config{} }
// Adds strict conflict filtering and supports cross-sport combos.

export async function handler(event){
  try{
    const body = JSON.parse(event.body || "{}");
    const odds = Array.isArray(body.odds) ? body.odds : [];
    const model = body.model || {};
    const cfg = Object.assign({ maxLegs: 3, targetCount: 5, minEdge: 0.00, minLegProb: 0.40, allowCrossSport: true }, body.config||{});

    if (!odds.length) return json(400, { ok:false, error: "no odds" });

    // enrich legs
    const legs = odds.map(l => {
      const american = Number(l.american);
      const p_book = impliedProb(american);
      const p_true = clamp01(Number(model[l.id] ?? p_book));
      return {
        ...l,
        outcome: l.outcome || l.name || l.description || l.selection || null,
        american, p_book, p_true,
        dec: american > 0 ? 1 + (american/100) : 1 + (100/Math.abs(american)),
      };
    });

    // filter low-prob legs
    const pool = legs.filter(l => l.p_true >= cfg.minLegProb);
    // sort by edge desc to bias selection
    pool.sort((a,b) => (b.p_true-b.p_book) - (a.p_true-a.p_book));

    // build combos
    const results = [];
    const maxCombos = 6000;
    let scanned = 0;
    outer:
    for (let i=0; i<pool.length; i++){
      for (let j=i+1; j<pool.length; j++){
        for (let k=j+1; k<pool.length; k++){
          const combo3 = [pool[i], pool[j], pool[k]];
          scanned++;
          if (passesConflictRules(combo3)){
            const scored = scoreCombo(combo3);
            results.push(scored);
          }
          if (results.length >= cfg.targetCount || scanned > maxCombos) break outer;
        }
      }
    }
    // if we still don't have enough, try 2-leg
    if (results.length < cfg.targetCount){
      for (let i=0; i<pool.length; i++){
        for (let j=i+1; j<pool.length; j++){
          const combo2 = [pool[i], pool[j]];
          if (passesConflictRules(combo2)){
            results.push(scoreCombo(combo2));
          }
          if (results.length >= cfg.targetCount) break;
        }
        if (results.length >= cfg.targetCount) break;
      }
    }

    // rank by EV * P*
    results.sort((a,b)=>(b.EV*b.pStar) - (a.EV*a.pStar));
    const top = results.slice(0, cfg.targetCount).map(s => ({
      sportMix: Array.from(new Set(s.combo.map(l=>l.sport).filter(Boolean))),
      legs: s.combo.map(l => ({ id:l.id, american:l.american, dec:l.dec, p_true:l.p_true, p_book:l.p_book, edge:(l.p_true-l.p_book), gameId:l.gameId, player:l.player, team:l.team, market:l.market, sport:l.sport, outcome:l.outcome })),
      decPrice: s.decPrice, pStar: s.pStar, EV: s.EV, avgR: s.avgR,
      units: { flat_units: 0.75, kelly_lite_units: 0.25 },
      why: s.combo.map(l => reasonLine(l))
    }));

    return json(200, { ok:true, parlays: top, scanned });
  }catch(e){
    return json(500, { ok:false, error: String(e.message||e) });
  }
}

// helpers
function json(code, obj){ return { statusCode: code, headers:{"content-type":"application/json"}, body: JSON.stringify(obj) }; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function impliedProb(a){ const dec = a > 0 ? 1 + (a/100) : 1 + (100/Math.abs(a)); return 1/dec; }
function scoreCombo(legs){
  const pInd = legs.reduce((a,b)=> a*b.p_true, 1);
  const corr = avgCorr(legs);
  const pStar = clamp01(pInd * (1 - 0.5 * corr));
  const decPrice = legs.reduce((a,b)=> a*b.dec, 1);
  const EV = pStar * (100*(decPrice-1)) - (1 - pStar) * 100;
  return { combo: legs, pStar, decPrice, EV, avgR: corr };
}
function avgCorr(legs){
  if (legs.length<2) return 0.10;
  let s=0,c=0;
  for (let i=0;i<legs.length;i++){
    for (let j=i+1;j<legs.length;j++){
      s += pairCorr(legs[i], legs[j]); c++;
    }
  }
  return c? s/c : 0.10;
}
function pairCorr(a,b){
  if (a.gameId && b.gameId && a.gameId===b.gameId) return 0.25;
  if (a.player && b.player && a.player===b.player) return 0.9;
  if (a.sport && b.sport && a.sport !== b.sport) return 0.05;
  return 0.10;
}
function reasonLine(l){
  const edgePct = Math.round((l.p_true - l.p_book)*100);
  const parts = [];
  parts.push(`Model ${Math.round(l.p_true*100)}% vs book ${Math.round(l.p_book*100)}% (${edgePct >= 0 ? "+" : ""}${edgePct}% edge).`);
  if (l.sport) parts.push(l.sport);
  if (l.market) parts.push(l.market);
  if (l.outcome) parts.push(l.outcome);
  if (l.player) parts.push(l.player);
  if (l.team && !l.player) parts.push(l.team);
  return parts.join(" ");
}

// conflicts
function passesConflictRules(legs){
  const seen = {};
  const players = new Set();
  for (const l of legs){
    if (l.player){ if (players.has(l.player)) return false; players.add(l.player); }
    const key = `${l.gameId||'na'}:${(l.market||'').toLowerCase()}`;
    const side = (l.outcome||'').toLowerCase() || (l.team||'').toLowerCase();
    if (!seen[key]) { seen[key] = new Set(); }
    // Totals: block O/U together
    if (key.endsWith(":totals")){
      if (seen[key].has("over") && side.includes("under")) return false;
      if (seen[key].has("under") && side.includes("over")) return false;
      seen[key].add(side.includes("over") ? "over" : (side.includes("under") ? "under" : side));
      continue;
    }
    // ML conflicts
    if (key.endsWith(":h2h")){
      if (seen[key].size && !seen[key].has(side)) return false;
      seen[key].add(side);
      continue;
    }
    // Spread conflicts
    if (key.endsWith(":spreads")){
      if (seen[key].size && !seen[key].has(side)) return false;
      seen[key].add(side);
      continue;
    }
  }
  return true;
}
