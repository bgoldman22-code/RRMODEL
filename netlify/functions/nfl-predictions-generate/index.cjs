
// Robust, fail-safe handler for NFL predictions.
// - Never throws uncaught exceptions
// - Always returns valid JSON with statusCode 200 or 500
// - Provides debug logs and a health probe
// - Uses odds fallback if model rows aren't present

const { ok, fail } = require('../_lib/http.cjs');
const log = require('../_lib/logger.cjs');

// Node 18+ on Netlify has global fetch; make sure it exists
const doFetch = (typeof fetch === 'function') ? fetch : (...args) => import('node-fetch').then(({default: f}) => f(...args));

function qs(event) {
  try {
    const u = new URL(event.rawUrl || `https://dummy${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    return Object.fromEntries(u.searchParams.entries());
  } catch {
    return {};
  }
}

function pct(x) {
  if (typeof x !== 'number' || !isFinite(x)) return null;
  if (x <= 1) return Math.round(x * 100) / 100;
  return Math.round(x) / 100;
}

function normalizeMoneylineToProb(ml) {
  if (ml == null || !isFinite(ml)) return null;
  if (ml < 0) return (-ml) / ((-ml) + 100);
  return 100 / (ml + 100);
}

function pickFromOdds(row) {
  // moneyline
  const mlHome = row.ml_home;
  const mlAway = row.ml_away;
  let moneyline = null;
  if (mlHome != null && mlAway != null) {
    const pHome = normalizeMoneylineToProb(mlHome);
    const pAway = normalizeMoneylineToProb(mlAway);
    if (pHome != null && pAway != null) {
      if (pHome >= pAway) {
        moneyline = { team: row.home, price: mlHome, confidence: pHome };
      } else {
        moneyline = { team: row.away, price: mlAway, confidence: pAway };
      }
    }
  }

  // spread
  let spread = null;
  if (row.spread_point != null) {
    // negative means home favored
    const side = row.spread_point <= 0 ? -1 : 1; // -1 home, 1 away
    const price = side === -1 ? row.spread_home_line : row.spread_away_line;
    spread = {
      side,
      line: row.spread_point,
      price: price ?? null,
      confidence: null, // model should fill; left null in fallback
    };
  }

  // total
  let total = null;
  if (row.total_points != null) {
    // if prices exist pick cheaper (closer to even) as naive fallback
    let side = 'over';
    if (row.over_price != null && row.under_price != null) {
      side = Math.abs(row.over_price) <= Math.abs(row.under_price) ? 'over' : 'under';
    }
    total = {
      side,
      total: row.total_points,
      price: side === 'over' ? (row.over_price ?? null) : (row.under_price ?? null),
      confidence: null, // model should fill; left null in fallback
    };
  }

  return { moneyline, spread, total };
}

async function safeJSON(url, label, timeoutMs = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { signal: ctl.signal });
    const status = res.status;
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    return { ok: res.ok, status, url, json };
  } catch (err) {
    log.warn(`fetch failed: ${label}`, { url, err: String(err) });
    return { ok: false, status: 0, url, json: null, error: String(err) };
  } finally {
    clearTimeout(t);
  }
}

exports.handler = async (event, context) => {
  const start = Date.now();
  try {
    const params = qs(event);
    const DEBUG = (params.log === 'debug');
    if (DEBUG) process.env.LOG_LEVEL = 'debug';

    if (params.health === '1' || params.health === 'true') {
      return ok({ updated: new Date().toISOString(), meta: { health: 'ok' } });
    }

    const ENV = {
      SCHEDULE_URL: process.env.SCHEDULE_URL || 'https://bgroundrobin.com/.netlify/functions/nfl-schedule-get',
      ODDS_URL:     process.env.ODDS_URL     || 'https://bgroundrobin.com/.netlify/functions/nfl-odds-bridge',
      TEAMFORM_URL: process.env.TEAMFORM_URL || 'https://bgroundrobin.com/nflverse-team-form.json',
    };

    log.info('nfl-predictions-generate:start', { params, ENV: { ...ENV, TEAMFORM_URL: !!ENV.TEAMFORM_URL ? 'set' : 'unset' } });

    // Pull schedule & odds in parallel (best-effort)
    const [sched, odds] = await Promise.all([
      safeJSON(ENV.SCHEDULE_URL, 'schedule'),
      safeJSON(ENV.ODDS_URL, 'odds')
    ]);

    let rows = [];
    let source = 'model';

    // If there was a model layer in your build that cached rows into blobs, you can read it here.
    // For now, we build a fallback from odds if model fails to produce rows.
    const oddsRows = Array.isArray(odds?.json?.rows) ? odds.json.rows : [];

    if (oddsRows.length > 0) {
      source = 'odds-fallback';
      rows = oddsRows.map((r) => {
        const derived = pickFromOdds(r);
        return {
          id: r.id || `${r.home}-${r.away}-${r.commence_time}`,
          matchup: `${(r.away || '').toUpperCase()} @ ${(r.home || '').toUpperCase()}`.trim(),
          kickoff: r.commence_time || null,
          homeTeam: (r.home || '').toUpperCase(),
          awayTeam: (r.away || '').toUpperCase(),
          moneyline: derived.moneyline,
          spread: derived.spread,
          total: derived.total,
          // Legacy display fields (keep for FE compatibility)
          displayMarket: derived.moneyline ? 'moneyline' : (derived.spread ? 'spread' : (derived.total ? 'total' : null)),
          displayPick: derived.moneyline ? (derived.moneyline.team || null) : null,
          displayPrice: derived.moneyline ? String(derived.moneyline.price ?? '') : null,
          displayLine: derived.spread ? String(derived.spread.line ?? '') : (derived.total ? String(derived.total.total ?? '') : null),
          confidence: derived.moneyline?.confidence ?? null,
          odds: r
        };
      });
    }

    const payload = {
      ok: true,
      updated: new Date().toISOString(),
      meta: {
        endpoints: { scheduleUrl: ENV.SCHEDULE_URL, oddsUrl: ENV.ODDS_URL, teamFormUrl: ENV.TEAMFORM_URL },
        source,
        schedule_status: { ok: !!sched?.ok, status: sched?.status ?? null },
        odds_status: { ok: !!odds?.ok, status: odds?.status ?? null },
        count: rows.length,
      },
      rows,
    };

    if (DEBUG) {
      log.debug('nfl-predictions-generate:result', {
        count: rows.length,
        sample: rows[0] ? {
          id: rows[0].id,
          matchup: rows[0].matchup,
          moneyline: rows[0].moneyline,
          spread: rows[0].spread,
          total: rows[0].total,
        } : null
      });
    }

    return ok(payload);
  } catch (err) {
    log.error('nfl-predictions-generate:crash', { err: String(err), stack: (err && err.stack) ? String(err.stack) : null });
    return fail(500, 'Function crashed', { code: 'GEN_CRASH' });
  } finally {
    const ms = Date.now() - start;
    log.info('nfl-predictions-generate:end', { ms });
  }
};
