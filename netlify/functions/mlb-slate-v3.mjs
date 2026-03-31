/**
 * mlb-slate-v3.mjs — Netlify Function
 * =====================================
 * Route: /api/mlb-slate-v3   (wired in netlify.toml)
 *
 * Pipeline:
 *   1. Read statcast/meta.json → check freshness (warn if >26h)
 *   2. Read statcast/features-{today}.json → pre-built per-player feature vectors
 *   3. POST feature matrix to mlb-score-v3.py → get XGBoost calibrated probs
 *   4. Fetch live odds from TheOddsAPI (batter_home_runs Over 0.5)
 *   5. Compute EV = p_model × decimal_odds − 1
 *   6. Filter EV ≥ 25%
 *   7. Build RR combinations (top5×2, top5×3) with FanDuel SGP rule
 *   8. Compute Kelly fraction + recommended units (quarter Kelly, cap 2u, floor 0.25u)
 *   9. Return enriched response matching agreed schema
 *
 * Falls back to V2 (mlb-rr-generate) if features blob is missing.
 *
 * Secrets required:
 *   ODDS_API_KEY
 *   (NETLIFY_BLOBS_TOKEN / NETLIFY_SITE_ID — set automatically on Netlify)
 */

// ── Blobs helper ─────────────────────────────────────────────────────────────
let _getStore = null;
async function safeGetStore(name) {
  try {
    if (!_getStore) {
      const mod = await import('@netlify/blobs');
      _getStore = mod.getStore;
    }
    return _getStore(name);
  } catch { return null; }
}

const STORE = 'rrmodelblobs';

async function readBlob(key) {
  try {
    const store = await safeGetStore(STORE);
    if (!store) return null;
    return await store.get(key, { type: 'json' });
  } catch { return null; }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const EV_THRESHOLD      = 0.25;   // 25% minimum EV to qualify
const HIGH_CONV_PROB    = 0.30;   // ≥30% model prob → high conviction
const HIGH_CONV_COUNT   = 5;      // ≥5 players at HIGH_CONV_PROB → x3 day
const TOP_N             = 5;      // RR pool size
const QUARTER_KELLY_F   = 0.25;   // fraction of full Kelly
const MAX_UNITS         = 2.0;
const MIN_UNITS         = 0.25;
// Gate 1 rolling-cap (backtest: +1.2% ROI lift, 38.5% of days affected)
const CAP_WINDOW_DAYS   = 7;      // rolling calendar window
const CAP_MAX_APPEARS   = 4;      // max top-5 appearances per player in window
const ODDS_API_KEY      = process.env.ODDS_API_KEY;
const ODDS_API_BASE     = 'https://api.the-odds-api.com/v4';
const FUNCTION_BASE_URL = process.env.URL || 'http://localhost:8888';  // Netlify sets URL in prod

// ── Utility ───────────────────────────────────────────────────────────────────
function dateET(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function americanToDecimal(am) {
  const n = Number(am);
  return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
}

function kellyUnits(pModel, decimalOdds) {
  // Full Kelly = (p * (d-1) - (1-p)) / (d-1)
  const d = decimalOdds;
  const full = (pModel * (d - 1) - (1 - pModel)) / (d - 1);
  const quarter = full * QUARTER_KELLY_F;
  return Math.min(MAX_UNITS, Math.max(MIN_UNITS, Math.round(quarter * 4) / 4)); // round to 0.25u
}

function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.]/g, '').trim();
}

// ── C(n,k) combinations ───────────────────────────────────────────────────────
function* combinations(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

// ── Gate 1 rolling cap: read/write appearance log from Blobs ─────────────────
// Blob key: statcast/rr-appearance-log.json
// Schema: { [player_id]: [dateString, ...] }  (last 14 days kept)
async function applyRollingCap(qualifyingPicks, today) {
  let log = {};
  try {
    const raw = await readBlob('statcast/rr-appearance-log.json');
    if (raw && typeof raw === 'object') log = raw;
  } catch { /* fresh start */ }

  const todayMs = new Date(today).getTime();
  const windowMs = CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // Identify capped players: appeared ≥ CAP_MAX_APPEARS times in window
  const cappedIds = new Set();
  for (const [pid, dates] of Object.entries(log)) {
    const recent = dates.filter(d => {
      const diffMs = todayMs - new Date(d).getTime();
      return diffMs > 0 && diffMs <= windowMs;   // strictly before today, within window
    });
    if (recent.length >= CAP_MAX_APPEARS) cappedIds.add(pid);
  }

  // Filter qualifying picks
  const uncapped = qualifyingPicks.filter(p => !cappedIds.has(String(p.player_id)));
  const cappedOut = qualifyingPicks.filter(p => cappedIds.has(String(p.player_id)));

  // Record today's top-5 appearances (whoever is in the final RR pool)
  const top5ForLog = uncapped.slice(0, TOP_N);
  for (const p of top5ForLog) {
    const pid = String(p.player_id);
    if (!log[pid]) log[pid] = [];
    if (!log[pid].includes(today)) log[pid].push(today);
  }

  // Prune log entries older than 14 days to keep blob small
  const pruneMs = 14 * 24 * 60 * 60 * 1000;
  for (const pid of Object.keys(log)) {
    log[pid] = log[pid].filter(d => todayMs - new Date(d).getTime() <= pruneMs);
    if (!log[pid].length) delete log[pid];
  }

  // Write updated log back
  try {
    const store = await safeGetStore(STORE);
    if (store) await store.set('statcast/rr-appearance-log.json', JSON.stringify(log));
  } catch { /* non-fatal */ }

  return {
    filtered: uncapped,
    capped_out: cappedOut.map(p => ({ player: p.player, player_id: p.player_id })),
    cap_applied: cappedOut.length > 0,
  };
}

// ── RR combination builder (with FanDuel SGP rule) ────────────────────────────
function buildRRCombos(picks, legs) {
  const top5 = picks.slice(0, TOP_N);
  const all  = [...combinations(top5, legs)];
  const valid = [];
  let excluded = 0;
  for (const combo of all) {
    const gamePks = combo.map(p => p.gamePk);
    // FanDuel SGP rule: no two players from the same game in same combo
    if (new Set(gamePks).size === gamePks.length) {
      valid.push(combo);
    } else {
      excluded++;
    }
  }
  return { combos: valid, excluded };
}

function formatCombo(combo, legs) {
  const decOdds = combo.map(p => americanToDecimal(p.americanOdds));
  const comboDecOdds = decOdds.reduce((a, b) => a * b, 1);
  const comboAmerican = comboDecOdds >= 2
    ? Math.round((comboDecOdds - 1) * 100)
    : Math.round(-100 / (comboDecOdds - 1));
  const impliedProb = combo.map(p => p.impliedProb).reduce((a, b) => a * b, 1);
  const modelProb   = combo.map(p => p.modelProb).reduce((a, b) => a * b, 1);
  const ev          = modelProb * comboDecOdds - 1;
  const stake       = legs === 2 ? 0.5 : 0.33;  // per spec: 0.5u per 2-leg combo
  return {
    players:       combo.map(p => ({ player: p.player, team: p.team, game: p.game, modelProb: p.modelProb, americanOdds: p.americanOdds })),
    comboOdds:     comboAmerican,
    comboDecOdds:  Math.round(comboDecOdds * 100) / 100,
    combinedModelProb: Math.round(modelProb * 10000) / 10000,
    combinedImpliedProb: Math.round(impliedProb * 10000) / 10000,
    ev:            Math.round(ev * 10000) / 10000,
    recommendedStake: stake,
    legs,
  };
}

// ── Fetch live HR odds from TheOddsAPI ────────────────────────────────────────
async function fetchLiveOdds() {
  if (!ODDS_API_KEY) {
    console.log('⚠️  No ODDS_API_KEY — no live odds');
    return { byPlayer: new Map(), source: 'none' };
  }
  const byPlayer = new Map();
  try {
    const eventsUrl = `${ODDS_API_BASE}/sports/baseball_mlb/events?apiKey=${ODDS_API_KEY}`;
    const r = await fetch(eventsUrl, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`OddsAPI events HTTP ${r.status}`);
    const events = await r.json();
    if (!Array.isArray(events) || !events.length) return { byPlayer, source: 'none' };

    const batchSize = 5;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async (ev) => {
        const url = `${ODDS_API_BASE}/sports/baseball_mlb/events/${ev.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=batter_home_runs&oddsFormat=american`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return;
        const game = await resp.json();
        for (const bk of game.bookmakers || []) {
          for (const mkt of bk.markets || []) {
            if (mkt.key !== 'batter_home_runs') continue;
            for (const o of mkt.outcomes || []) {
              if (o.name !== 'Over' || o.point !== 0.5) continue;
              const key = norm(o.description);
              if (!key) continue;
              if (!byPlayer.has(key)) byPlayer.set(key, { odds: [], books: new Set() });
              byPlayer.get(key).odds.push(o.price);
              byPlayer.get(key).books.add(bk.key);
            }
          }
        }
      }));
    }

    // Median across books per player
    const out = new Map();
    for (const [key, rec] of byPlayer) {
      const sorted = [...rec.odds].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      out.set(key, { american: median, books: rec.books.size });
    }
    console.log(`📊 OddsAPI: ${out.size} players with live odds`);
    return { byPlayer: out, source: 'live' };
  } catch (e) {
    console.error('OddsAPI fetch error:', e.message);
    return { byPlayer: new Map(), source: 'error' };
  }
}

// ── Call Python inference function ────────────────────────────────────────────
async function scoreFeatures(featureRows) {
  // featureRows: array of 9-element arrays in strict schema order
  try {
    const resp = await fetch(`${FUNCTION_BASE_URL}/.netlify/functions/mlb-score-v3`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ features: featureRows }),
      signal:  AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`mlb-score-v3 HTTP ${resp.status}`);
    const j = await resp.json();
    return j.probs || [];
  } catch (e) {
    console.error('mlb-score-v3 call failed:', e.message);
    return [];
  }
}

// ── Grade badge helper ─────────────────────────────────────────────────────────
function gradeBadge(edgePct) {
  if (edgePct >= 15) return 'A+';
  if (edgePct >= 12) return 'A';
  if (edgePct >= 9)  return 'B+';
  if (edgePct >= 7)  return 'B';
  return 'C';
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function handler(event) {
  try {
    const today = dateET();
    const forceRefresh = event.queryStringParameters?.refresh === 'true';

    // ── Cache check (5 min) ────────────────────────────────────────────────
    const cacheKey = `mlb-v3-slate-${today}`;
    if (!forceRefresh) {
      const cached = await readBlob(`cache/${cacheKey}.json`);
      if (cached && (Date.now() - (cached._ts || 0)) < 5 * 60 * 1000) {
        return ok({ ...cached, cached: true });
      }
    }

    // ── 1. Meta freshness check ────────────────────────────────────────────
    const meta = await readBlob('statcast/meta.json');
    let dataFreshness = { generated_at: null, stale: true, stale_hours: null };
    let featuresMissing = false;

    if (meta?.run_at) {
      const ageMs = Date.now() - new Date(meta.run_at).getTime();
      const ageHr = ageMs / (1000 * 60 * 60);
      dataFreshness = {
        generated_at: meta.run_at,
        stale: ageHr > 26,
        stale_hours: Math.round(ageHr * 10) / 10,
      };
    }

    // ── 2. Load today's feature vectors ───────────────────────────────────
    const featBlob = await readBlob(`statcast/features-${today}.json`);
    if (!featBlob || !featBlob.features?.length) {
      featuresMissing = true;
      console.warn(`⚠️ No feature vectors for ${today} — V3 returning fallback notice`);
      return ok({
        date: today, model: 'xgb_v1',
        data_freshness: { ...dataFreshness, features_missing: true },
        fallback: true,
        fallback_message: 'Feature vectors not yet built for today. Data pipeline runs at 7 AM ET.',
        candidates: [], qualifying_picks: [],
        rr: { x2_combos: [], x3_combos: [], high_conviction_day: false, sgp_rule_applied: true, combos_excluded_by_sgp: 0 },
        straight_bets: [],
        meta: { candidates_total: 0, qualifying_count: 0, odds_source: 'none' },
      });
    }

    const allFeatures = featBlob.features;  // sorted by model_prob desc from build script

    // ── 3. XGBoost inference ───────────────────────────────────────────────
    // Build 11-feature rows in strict schema order (must match feature_schema.json v2)
    const SCHEMA_ORDER = [
      'hr_rate_bayes', 'barrel_pct', 'hard_hit_pct', 'pitcher_barrel',
      'pitcher_rv100', 'pitcher_hrfb', 'park_hr_factor', 'temp_adj', 'wind_adj',
      'pull_park_score', 'pitcher_zone_pct',
    ];
    const featureRows = allFeatures.map(f => SCHEMA_ORDER.map(k => f[k] ?? null));
    const probs = await scoreFeatures(featureRows);

    // If inference failed, use model_prob from build script (already inferred)
    const useBuiltInProbs = probs.length !== allFeatures.length;
    if (useBuiltInProbs) {
      console.warn('⚠️ Inference call failed — using pre-built model_prob from feature blob');
    }

    // Attach final model_prob
    const players = allFeatures.map((f, i) => ({
      ...f,
      model_prob: useBuiltInProbs ? (f.model_prob || 0) : probs[i],
    }));

    // ── 4. Live odds ───────────────────────────────────────────────────────
    const { byPlayer: oddsMap, source: oddsSource } = await fetchLiveOdds();

    // ── 5. EV computation + enrichment ────────────────────────────────────
    const candidates = players.map(f => {
      const oddsRec     = oddsMap.get(norm(f.player_name));
      const americanOdds = oddsRec ? oddsRec.american : null;
      const decimalOdds  = americanOdds ? americanToDecimal(americanOdds) : null;
      const impliedProb  = decimalOdds ? 1 / decimalOdds : null;
      const ev           = (decimalOdds && f.model_prob)
        ? f.model_prob * decimalOdds - 1
        : null;
      const edgePct      = ev !== null ? ev * 100 : null;
      const kelly        = (decimalOdds && f.model_prob)
        ? kellyUnits(f.model_prob, decimalOdds) : null;

      return {
        player:          f.player_name,
        player_id:       f.player_id,
        team:            f.team_abbrev,
        opp_pitcher:     f.opp_pitcher_name || 'TBD',
        game:            f.is_home
          ? `${f.opp_abbrev} @ ${f.team_abbrev}`
          : `${f.team_abbrev} @ ${f.opp_abbrev}`,
        gamePk:          f.game_pk,
        venue:           f.venue,
        is_dome:         f.is_dome,
        modelProb:       Math.round(f.model_prob * 10000) / 10000,
        americanOdds,
        decimalOdds:     decimalOdds ? Math.round(decimalOdds * 100) / 100 : null,
        impliedProb:     impliedProb ? Math.round(impliedProb * 10000) / 10000 : null,
        ev,
        edge_pct:        edgePct ? Math.round(edgePct * 10) / 10 : null,
        grade:           edgePct !== null ? gradeBadge(edgePct) : null,
        kelly_fraction:  kelly,
        recommended_units: kelly,
        books_count:     oddsRec?.books || 0,
        odds_source:     oddsRec ? 'live' : 'model_only',
        // Feature transparency (for model panel)
        features: {
          hr_rate_bayes:  f.hr_rate_bayes,
          barrel_pct:     f.barrel_pct,
          hard_hit_pct:   f.hard_hit_pct,
          pitcher_barrel: f.pitcher_barrel,
          pitcher_rv100:  f.pitcher_rv100,
          pitcher_hrfb:   f.pitcher_hrfb,
          park_hr_factor: f.park_hr_factor,
          temp_adj:       f.temp_adj,
          wind_adj:       f.wind_adj,
        },
        season_hr: f.season_hr,
        season_pa: f.season_pa,
      };
    });

    // ── 6. Qualifying picks (EV ≥ 25%, must have live odds) ──────────────
    const qualifyingPicks = candidates
      .filter(c => c.ev !== null && c.ev >= EV_THRESHOLD && c.americanOdds !== null)
      .sort((a, b) => b.ev - a.ev);

    // ── 6b. Gate 1 rolling cap (max 4 appearances per player in 7 days) ──
    // Backtest result: +1.2% cumROI lift, 38.5% of days affected
    // Capped players appear in response for transparency but excluded from RR pool
    const { filtered: capFiltered, capped_out: cappedOut, cap_applied } =
      await applyRollingCap(qualifyingPicks, today);

    // ── 7. RR combination builder ─────────────────────────────────────────
    // Sort by EV for RR pool selection — use cap-filtered list
    const rrPool = [...capFiltered].sort((a, b) => b.ev - a.ev);

    const { combos: x2raw, excluded: ex2 } = buildRRCombos(rrPool, 2);
    const { combos: x3raw, excluded: ex3 } = buildRRCombos(rrPool, 3);

    const x2Combos = x2raw.map(c => formatCombo(c, 2));
    const x3Combos = x3raw.map(c => formatCombo(c, 3));

    // High conviction: ≥5 players at model_prob ≥ 30%
    const highConvCount = qualifyingPicks.filter(p => p.modelProb >= HIGH_CONV_PROB).length;
    const highConvictionDay = highConvCount >= HIGH_CONV_COUNT;

    // ── 8. Straight bets (separate layer) ─────────────────────────────────
    const straightBets = qualifyingPicks.map(p => ({
      player:            p.player,
      team:              p.team,
      game:              p.game,
      opp_pitcher:       p.opp_pitcher,
      model_prob:        p.modelProb,
      american_odds:     p.americanOdds,
      ev:                p.ev,
      edge_pct:          p.edge_pct,
      grade:             p.grade,
      recommended_units: p.recommended_units,
      kelly_fraction:    p.kelly_fraction,
      features:          p.features,
      season_hr:         p.season_hr,
      season_pa:         p.season_pa,
    }));

    // ── 9. Build response ──────────────────────────────────────────────────
    const response = {
      date: today,
      model: 'xgb_v1',
      data_freshness: {
        ...dataFreshness,
        features_date: featBlob.date,
        features_generated_at: featBlob.generated_at,
        features_missing: false,
      },
      candidates: candidates.slice(0, 50),      // top 50 by model_prob for display
      qualifying_picks: qualifyingPicks,
      rr: {
        x2_combos:            x2Combos,
        x3_combos:            x3Combos,
        high_conviction_day:  highConvictionDay,
        high_conviction_count: highConvCount,
        high_conviction_threshold: HIGH_CONV_PROB,
        sgp_rule_applied:     true,
        combos_excluded_by_sgp: ex2 + ex3,
        rolling_cap_applied:  cap_applied,
        rolling_cap_excluded: cappedOut,
        rolling_cap_note: cap_applied
          ? `${cappedOut.length} player(s) excluded: ≥${CAP_MAX_APPEARS} top-5 appearances in last ${CAP_WINDOW_DAYS} days.`
          : null,
        rr_structure_note: highConvictionDay
          ? `Strong slate — ${highConvCount} players above 30%. x3 RR recommended today.`
          : 'Standard slate — x2 RR is primary structure.',
      },
      straight_bets: straightBets,
      meta: {
        candidates_total:  candidates.length,
        qualifying_count:  qualifyingPicks.length,
        rr_pool_count:     capFiltered.length,
        cap_excluded_count: cappedOut.length,
        odds_source:       oddsSource,
        ev_threshold:      EV_THRESHOLD,
        top_n:             TOP_N,
        inference_mode:    useBuiltInProbs ? 'pre_built' : 'live',
        games_today:       featBlob.games_count,
      },
    };

    // Cache
    try {
      const store = await safeGetStore(STORE);
      if (store) await store.set(`cache/${cacheKey}.json`, JSON.stringify({ ...response, _ts: Date.now() }));
    } catch { /* non-fatal */ }

    return ok(response);

  } catch (err) {
    console.error('mlb-slate-v3 error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
}

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
    body: JSON.stringify(body),
  };
}
