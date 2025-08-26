// netlify/functions/hrr-slate.mjs
export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `http://localhost`);
    const date = (url.searchParams.get('date') || '').trim() || new Date().toISOString().slice(0,10);

    // Pull odds from internal odds endpoint
    const oddsUrl = new URL('/.netlify/functions/odds-hrr', 'http://localhost');
    oddsUrl.searchParams.set('date', date);

    const res = await fetch(oddsUrl.pathname + '?' + oddsUrl.searchParams.toString(), { method: 'GET' });
    if (!res.ok) {
      throw new Error(`odds-hrr HTTP ${res.status}`);
    }
    const data = await res.json();

    const offers = Array.isArray(data.offers) ? data.offers : [];
    const playersMap = new Map();

    const pushOffer = (o) => {
      if (!o) return;
      const market = o.market || o.key || '';
      const player = o.player || (o.description || '').trim();
      const game = o.game || o.event || '';
      const bookmaker = o.bookmaker || o.book || (o.bookmakers && o.bookmakers[0] && o.bookmakers[0].title) || '';
      const point = Number(o.point ?? o.line ?? o.handicap ?? NaN);
      const name = (o.name || '').toLowerCase();
      const priceDec = Number(o.decimal || o.price || o.oddsDecimal || NaN);
      const priceAm = o.american || o.oddsAmerican || null;

      // Only Over 1.5 (aka 2+) for HRR
      const isOver = name.includes('over');
      const isRightPoint = Math.abs(point - 1.5) < 1e-9;

      const isHRR = (market || '').includes('hits_runs_rbis');
      if (!isHRR) return;

      if (!player || !isOver || !isRightPoint || !isFinite(priceDec) || priceDec <= 1) return;

      const key = `${player}__${game}`;
      const existing = playersMap.get(key);
      if (!existing || priceDec > existing.priceDec) {
        playersMap.set(key, { player, game, bookmaker: String(bookmaker || '').toLowerCase(), priceDec, priceAm, point, market });
      }
    };

    // Flatten shapes
    for (const g of offers) {
      if (!g) continue;

      if (Array.isArray(g.outcomes)) {
        for (const o of g.outcomes) pushOffer({ ...o, market: g.market, game: g.game, bookmaker: g.bookmaker });
      }

      if (Array.isArray(g.markets)) {
        for (const m of g.markets) {
          if (Array.isArray(m.outcomes)) {
            for (const o of m.outcomes) pushOffer({ ...o, market: m.key || m.market, game: g.game, bookmaker: g.bookmaker });
          }
        }
      }

      if (Array.isArray(g.bookmakers)) {
        for (const b of g.bookmakers) {
          if (Array.isArray(b.markets)) {
            for (const m of b.markets) {
              if (Array.isArray(m.outcomes)) {
                for (const o of m.outcomes) pushOffer({ ...o, market: m.key || m.market, game: g.game, bookmaker: b.title || b.key });
              }
            }
          }
        }
      }
    }

    const players = [];
    for (const { player, game, bookmaker, priceDec, priceAm, point } of playersMap.values()) {
      const implied = 1 / priceDec;
      players.push({
        player,
        team: '',
        game,
        modelProb: implied,
        modelOdds: (1/implied - 1) > 0 ? `+${Math.round((1/implied - 1)*100)}` : `${Math.round((1/implied - 1)*100)}`,
        realOdds: priceAm || `~${priceDec.toFixed(2)}d`,
        ev: (implied * (priceDec - 1) - (1 - implied)).toFixed(3),
        why: `HRR Over 1.5 (2+) • ${bookmaker}`
      });
    }

    const body = {
      ok: true,
      market: 'batter_hits_runs_rbis',
      date,
      meta: { provider: data.provider || 'theoddsapi', usingOddsApi: !!data.usingOddsApi },
      count: players.length,
      players
    };

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify(body)
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: false, error: String(err), count: 0, players: [] })
    };
  }
};