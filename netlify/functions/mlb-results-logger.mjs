// netlify/functions/mlb-results-logger.mjs
// Scheduled: 11 PM ET nightly (04:00 UTC) — "0 4 * * *"
// Fetches HR outcomes for the past 7 days, matches against qualifying picks,
// writes picks-log/mlb_hr_v3/{date}.json and updates statcast/live-calibration.json

import { getStore } from "@netlify/blobs";

const STORE    = "rrmodelblobs";
const MLB_API  = "https://statsapi.mlb.com/api/v1";
const LOOKBACK = 7; // days to backfill

// ─── Blob store helper (mirrors _blobs.mjs auth fallback pattern) ─────────────
function getRRStore() {
  try {
    return getStore({ name: STORE });
  } catch (err) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
    if (!siteID || !token) throw err;
    return getStore({ name: STORE, siteID, token });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** American odds → implied prob */
function impliedProb(odds) {
  if (!odds) return null;
  return odds < 0 ? (-odds) / (-odds + 100) : 100 / (odds + 100);
}

// ─── Fetch schedule for a single date ─────────────────────────────────────────
async function fetchSchedule(date) {
  try {
    const url = `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=game,linescore`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.dates?.[0]?.games || []).filter(g => g.status?.abstractGameState === "Final");
  } catch {
    return [];
  }
}

// ─── Fetch HR scorers for a completed game ────────────────────────────────────
async function fetchGameHRs(gamePk) {
  try {
    const url = `${MLB_API}/game/${gamePk}/playByPlay`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return new Set();
    const json = await res.json();
    const hrScorers = new Set();
    for (const play of json.allPlays || []) {
      if (play.result?.eventType === "home_run") {
        const batterId = play.matchup?.batter?.id;
        if (batterId) hrScorers.add(batterId);
      }
    }
    return hrScorers;
  } catch {
    return new Set();
  }
}

// ─── Load features blob for a date ────────────────────────────────────────────
async function loadFeatures(store, date) {
  try {
    const raw = await store.get(`statcast/features-${date}.json`, { type: "text" });
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Load existing picks log for a date (to avoid double-writing) ──────────────
async function loadPicksLog(store, date) {
  try {
    const raw = await store.get(`picks-log/mlb_hr_v3/${date}.json`, { type: "text" });
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Process a single date ────────────────────────────────────────────────────
async function processDate(store, date) {
  // Skip if already logged
  const existing = await loadPicksLog(store, date);
  if (existing?.finalized) {
    return { date, skipped: true, picks: existing.picks?.length ?? 0 };
  }

  // Load feature blob for that date
  const features = await loadFeatures(store, date);
  if (!features || !features.features?.length) {
    return { date, skipped: false, error: "no_features", picks: 0 };
  }

  // Only log players that cleared EV ≥ 25% (qualifying_picks are in features blob)
  // features.features contains ALL candidates; filter those with ev_pct >= 0.25
  const candidates = features.features.filter(p =>
    p.ev != null ? p.ev >= 0.25 : (p.ev_pct != null ? p.ev_pct >= 0.25 : false)
  );

  if (candidates.length === 0) {
    // Write a finalized empty log so we don't retry tomorrow
    await store.setJSON(`picks-log/mlb_hr_v3/${date}.json`, {
      date, season: features.season,
      logged_at: new Date().toISOString(),
      finalized: true,
      picks: [],
      games_checked: 0,
    });
    return { date, skipped: false, picks: 0 };
  }

  // Fetch schedule for that date
  const games = await fetchSchedule(date);
  if (games.length === 0) {
    return { date, skipped: false, error: "no_completed_games", picks: candidates.length };
  }

  // Build gamePk → HR set map
  const gamePkSet = [...new Set(candidates.map(p => p.game_pk).filter(Boolean))];
  const hrMap = {};
  await Promise.all(gamePkSet.map(async pk => {
    hrMap[pk] = await fetchGameHRs(pk);
  }));

  // Build picks log entries
  const picks = candidates.map(p => {
    const hrs = hrMap[p.game_pk] || new Set();
    const did_hr = hrs.has(p.player_id);
    return {
      player_id:    p.player_id,
      player_name:  p.player_name,
      team_abbrev:  p.team_abbrev,
      game_pk:      p.game_pk,
      date,
      season:       features.season,
      p_model:      p.model_prob ?? null,
      american_odds: p.american_odds ?? null,
      implied_prob: p.american_odds != null ? impliedProb(p.american_odds) : null,
      ev:           p.ev ?? p.ev_pct ?? null,
      grade:        p.grade ?? null,
      kelly_units:  p.kelly_units ?? null,
      did_hr,
    };
  });

  const logEntry = {
    date,
    season: features.season,
    logged_at: new Date().toISOString(),
    finalized: true,
    picks,
    games_checked: gamePkSet.length,
    hr_count: picks.filter(p => p.did_hr).length,
  };

  await store.setJSON(`picks-log/mlb_hr_v3/${date}.json`, logEntry);
  return { date, skipped: false, picks: picks.length, hr_count: logEntry.hr_count };
}

// ─── Rolling calibration update ───────────────────────────────────────────────
async function updateCalibration(store) {
  // Collect all logs from last 30 days
  const cutoff = dateStr(daysAgo(30));
  const allPicks = [];

  for (let i = 0; i <= 30; i++) {
    const date = dateStr(daysAgo(i));
    if (date < cutoff) break;
    try {
      const raw = await store.get(`picks-log/mlb_hr_v3/${date}.json`, { type: "text" });
      if (!raw) continue;
      const log = JSON.parse(raw);
      if (log.finalized && log.picks?.length) {
        allPicks.push(...log.picks);
      }
    } catch {
      continue;
    }
  }

  if (allPicks.length === 0) return { picks_count: 0 };

  // Calibration: group by decile of model_prob
  const withBoth = allPicks.filter(p => p.p_model != null && p.did_hr != null);
  const N = withBoth.length;
  const actualHR = withBoth.filter(p => p.did_hr).length;
  const avgModelProb = withBoth.reduce((s, p) => s + p.p_model, 0) / N;
  const actualRate = actualHR / N;

  // Brier score
  const brier = withBoth.reduce((s, p) => s + Math.pow(p.p_model - (p.did_hr ? 1 : 0), 2), 0) / N;

  // ROI (for picks with odds)
  const withOdds = withBoth.filter(p => p.american_odds != null);
  let totalStake = 0, totalReturn = 0;
  for (const p of withOdds) {
    const stake = p.kelly_units || 0.5;
    totalStake += stake;
    if (p.did_hr) {
      const dec = p.american_odds > 0
        ? 1 + p.american_odds / 100
        : 1 + 100 / Math.abs(p.american_odds);
      totalReturn += stake * dec;
    }
  }
  const roi = totalStake > 0 ? (totalReturn - totalStake) / totalStake : null;

  const calibration = {
    updated_at: new Date().toISOString(),
    window_days: 30,
    picks_total: N,
    actual_hr_rate: actualRate,
    avg_model_prob: avgModelProb,
    brier_score: brier,
    roi: roi,
    roi_picks: withOdds.length,
  };

  await store.setJSON("statcast/live-calibration.json", calibration);
  return calibration;
}

// ─── Scheduled handler ────────────────────────────────────────────────────────
export default async function handler(req) {
  const startTime = Date.now();
  const results = [];

  let store;
  try {
    store = getRRStore();
  } catch (err) {
    console.error("[mlb-results-logger] Failed to get blob store:", err.message);
    return new Response(JSON.stringify({ error: "store_init_failed", message: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[mlb-results-logger] Starting nightly run — processing last ${LOOKBACK} days`);

  for (let i = 1; i <= LOOKBACK; i++) {
    const date = dateStr(daysAgo(i));
    try {
      const result = await processDate(store, date);
      results.push(result);
      console.log(`[mlb-results-logger] ${date}: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error(`[mlb-results-logger] Error processing ${date}:`, err.message);
      results.push({ date, error: err.message });
    }
  }

  // Update rolling calibration
  let calibration = {};
  try {
    calibration = await updateCalibration(store);
    console.log("[mlb-results-logger] Calibration updated:", JSON.stringify(calibration));
  } catch (err) {
    console.error("[mlb-results-logger] Calibration update failed:", err.message);
    calibration = { error: err.message };
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[mlb-results-logger] Done in ${elapsed}s`);

  return new Response(JSON.stringify({
    ran_at: new Date().toISOString(),
    elapsed_s: parseFloat(elapsed),
    dates_processed: results,
    calibration,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
