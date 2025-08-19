// netlify/functions/generate-parlays.js
// Multi-sport parlay builder (sureshot bias).
// Accepts optional filters: { sportIn:[], marketIn:[], minDecPrice?, maxDecPrice? }
exports.handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { odds = [], model = {}, config = {} } = body;

    const cfg = {
      maxLegs: config.maxLegs ?? 3,
      targetCount: config.targetCount ?? 5,
      minEdge: config.minEdge ?? 0.02,
      minLegProb: config.minLegProb ?? 0.60,
      maxPairCorr: config.maxPairCorr ?? 0.35,
      boostPct: config.boostPct ?? 0.0,
      sportIn: Array.isArray(config.sportIn) ? config.sportIn : null,
      marketIn: Array.isArray(config.marketIn) ? config.marketIn : null,
      minDecPrice: config.minDecPrice ?? 1.0,
      maxDecPrice: config.maxDecPrice ?? 1000.0,
    };

    const americanToDecimal = (odds) =>
      odds > 0 ? 1 + (odds / 100) : 1 + (100 / Math.abs(odds));
    const impliedProb = (odds) => 1 / americanToDecimal(odds);

    // Optional sport/market filter
    function passFilter(o){
      if (cfg.sportIn && o.sport && !cfg.sportIn.includes(o.sport)) return false;
      if (cfg.marketIn && o.market && !cfg.marketIn.some(m => String(o.market).toLowerCase().includes(m.toLowerCase()))) return false;
      return true;
    }

    // Group for de-vig
    const byGroup = {};
    for (const o of odds) {
      if (!passFilter(o)) continue;
      const g = o.groupKey || `${o.gameId || 'na'}:${o.market || 'Generic'}`;
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(o);
    }
    const devigMap = {};
    for (const g in byGroup) {
      const arr = byGroup[g];
      const probs = arr.map((o) => impliedProb(o.american));
      const sum = probs.reduce((a, b) => a + b, 0);
      const scale = sum > 0 ? (1 / sum) : 1;
      arr.forEach((o, i) => { devigMap[o.id] = probs[i] * scale; });
    }

    // Build candidates
    const candidates = odds
      .filter(passFilter)
      .map((o) => {
        const p_true = model[o.id];
        if (p_true == null) return null;
        const p_book = devigMap[o.id] ?? impliedProb(o.american);
        const edge = p_true - p_book;
        return {
          id: o.id,
          american: o.american,
          dec: americanToDecimal(o.american),
          p_true, p_book, edge,
          sgpOk: o.sgpOk !== false,
          gameId: o.gameId,
          player: o.player || null,
          market: o.market || "",
          sport: o.sport || o.league || null,
          team: o.team || o.teamName || null,
        };
      })
      .filter(Boolean)
      .filter((x) => x.p_true >= cfg.minLegProb && x.edge >= cfg.minEdge)
      .filter((x) => x.dec >= cfg.minDecPrice && x.dec <= cfg.maxDecPrice);

    const pairCorr = (a, b) => {
      // Same game → moderate correlation
      if (a.gameId && b.gameId && a.gameId === b.gameId) return 0.25;
      // Same player → block
      if (a.player && b.player && a.player === b.player) return 0.9;
      // Cross-sport assumed low corr
      if (a.sport && b.sport && a.sport !== b.sport) return 0.05;
      // Totals with related side in same game → small corr
      const mk = (x)=> String(x.market||'').toLowerCase();
      if (a.gameId && b.gameId && a.gameId === b.gameId) {
        if ((mk(a).includes('total') && (mk(b).includes('under')||mk(b).includes('over'))) ||
            (mk(b).includes('total') && (mk(a).includes('under')||mk(a).includes('over')))) {
          return 0.20;
        }
      }
      return 0.10;
    };

    function* combos(arr, r, start = 0, prev = []) {
      if (prev.length === r) { yield prev; return; }
      for (let i = start; i < arr.length; i++) {
        yield* combos(arr, r, i + 1, prev.concat(arr[i]));
      }
    }

    const parlayList = [];
    for (let r = 2; r <= cfg.maxLegs; r++) {
      for (const legs of combos(candidates, r)) {
        if (legs.some((l) => !l.sgpOk)) continue;
        const players = legs.map((l) => l.player).filter(Boolean);
        if (new Set(players).size !== players.length) continue;

        let ok = true, avgR = 0, pairs = 0;
        for (let i = 0; i < legs.length; i++) {
          for (let j = i + 1; j < legs.length; j++) {
            const r_ij = pairCorr(legs[i], legs[j]);
            avgR += r_ij; pairs++;
            if (Math.abs(r_ij) > cfg.maxPairCorr) ok = false;
          }
        }
        if (!ok) continue;
        avgR = pairs ? avgR / pairs : 0.1;

        const pStarIndep = legs.reduce((acc, l) => acc * l.p_true, 1);
        const pStar = Math.max(0, Math.min(1, pStarIndep * (1 - 0.5 * avgR)));
        const decPrice = legs.reduce((acc, l) => acc * l.dec, 1);
        if (decPrice < cfg.minDecPrice || decPrice > cfg.maxDecPrice) continue;

        const stake = 100;
        const profit = stake * (decPrice - 1);
        const boostedProfit = profit * (1 + cfg.boostPct);
        const EV = pStar * boostedProfit - (1 - pStar) * stake;

        parlayList.push({
          sportMix: Array.from(new Set(legs.map(l=>l.sport).filter(Boolean))),
          legs: legs.map((l) => ({
            id: l.id, american: l.american, dec: l.dec,
            p_true: l.p_true, p_book: l.p_book, edge: l.edge,
            gameId: l.gameId, player: l.player, market: l.market, sport: l.sport
          })),
          decPrice, pStar, EV, avgR
        });
      }
    }

    parlayList.sort((a, b) =>
      (b.EV * Math.sqrt(Math.max(b.pStar, 1e-6))) -
      (a.EV * Math.sqrt(Math.max(a.pStar, 1e-6)))
    );

    const takeN = Math.min(cfg.targetCount, Math.max(3, cfg.targetCount));
    const top = parlayList.slice(0, takeN).map((p) => ({
      ...p,
      units: recommendUnits(p.pStar, p.EV, p.decPrice),
      why: p.legs.map((l) =>
        `Model ${Math.round(l.p_true*100)}% vs book ${Math.round(l.p_book*100)}% (edge +${Math.round((l.edge)*100)}%). ${l.sport ? l.sport + ' • ' : ''}${l.market}${l.player ? " • " + l.player : ""}.`
      )
    }));

    return { statusCode: 200, body: JSON.stringify({ parlays: top }) };

    function recommendUnits(pStar, EV, decPrice) {
      let u = 0.75;
      if (pStar >= 0.55 && EV > 0) u = 1.0;
      if (pStar < 0.50 && pStar >= 0.40) u = 0.5;

      const b = decPrice - 1;
      const p = pStar, q = 1 - p;
      const f = (b*p - q) / (b || 1e-9);
      const kellyLite = Math.max(0.25, Math.min(0.5, 0.25 * Math.max(0, f)));

      return {
        flat_units: +u.toFixed(2),
        kelly_lite_units: +kellyLite.toFixed(2),
        note: "Choose one system and stick to it. Default: flat staking."
      };
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
