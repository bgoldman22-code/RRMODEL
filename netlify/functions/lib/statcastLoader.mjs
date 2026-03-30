/**
 * statcastLoader.mjs
 *
 * Loads all 6 Statcast blobs from rrmodelblobs and builds runtime lookup
 * Maps for use by mlb-rr-generate.mjs.
 *
 * Blending strategy (matches Python pipeline docs):
 *   For each player, we have a current-year (2026) and prior-year (2025) record.
 *   We blend based on PA (batters) or BF (pitchers):
 *     weight_cur = clamp(0, PA_cur / BLEND_PA_THRESHOLD, 1)
 *     weight_pri = 1 - weight_cur
 *
 * Park factors are fetched as-is (static regressed values, no blending needed).
 *
 * All Maps are keyed by MLB player_id (integer).
 * Park factor Map is keyed by FanGraphs team abbreviation (string, uppercase).
 */

const BLEND_PA_THRESHOLD = 200; // PA/BF at which we use 100% current year
const STORE_NAME = 'rrmodelblobs';

// ── Blob loading ──────────────────────────────────────────────────────────────

let _getStore = null;
async function getStore() {
  if (!_getStore) {
    const mod = await import('@netlify/blobs');
    _getStore = mod.getStore;
  }
  return _getStore(STORE_NAME);
}

async function loadBlob(store, key) {
  try {
    const data = await store.get(key, { type: 'json' });
    return data || null;
  } catch (e) {
    console.warn(`[statcastLoader] ⚠ failed to load ${key}: ${e.message}`);
    return null;
  }
}

// ── Blend helpers ─────────────────────────────────────────────────────────────

/**
 * Blend two numeric values (current vs prior) weighted by sample size.
 * @param {number|null} cur   Current-year value
 * @param {number|null} pri   Prior-year value
 * @param {number} wCur       Weight for current year (0–1)
 * @returns {number|null}
 */
function blendVal(cur, pri, wCur) {
  const wPri = 1 - wCur;
  if (cur != null && pri != null) return cur * wCur + pri * wPri;
  if (cur != null) return cur;
  if (pri != null) return pri;
  return null;
}

/**
 * Compute blend weight for current-year data based on PA or BF.
 * Returns a value in [0, 1] where 1 = use 100% current year.
 */
function blendWeight(pa) {
  const n = Number(pa) || 0;
  return Math.min(1.0, n / BLEND_PA_THRESHOLD);
}

// ── Public loader ─────────────────────────────────────────────────────────────

/**
 * Load and blend all Statcast blobs. Returns a StatcastMaps object.
 *
 * @param {number} season   Current season year (e.g. 2026)
 * @returns {Promise<StatcastMaps>}
 */
export async function loadStatcastMaps(season) {
  const prior = season - 1;
  const t0 = Date.now();

  let store;
  try {
    store = await getStore();
  } catch (e) {
    console.warn(`[statcastLoader] Blobs unavailable: ${e.message}`);
    return emptyMaps();
  }

  // Load all blobs in parallel
  const [
    batCur, batPri,
    pitEvCur, pitEvPri,
    arsCur, arsPri,
    fgCur, fgPri,
    parkCur,
  ] = await Promise.all([
    loadBlob(store, `statcast/batters-${season}.json`),
    loadBlob(store, `statcast/batters-${prior}.json`),
    loadBlob(store, `statcast/pitchers-ev-${season}.json`),
    loadBlob(store, `statcast/pitchers-ev-${prior}.json`),
    loadBlob(store, `statcast/arsenal-${season}.json`),
    loadBlob(store, `statcast/arsenal-${prior}.json`),
    loadBlob(store, `statcast/fangraphs-pitching-${season}.json`),
    loadBlob(store, `statcast/fangraphs-pitching-${prior}.json`),
    // Park factors: use current-year key (Python writes same data to both)
    loadBlob(store, `statcast/park-factors-${season}.json`),
  ]);

  const elapsed = Date.now() - t0;
  const loaded = [batCur, batPri, pitEvCur, pitEvPri, arsCur, arsPri, fgCur, fgPri, parkCur]
    .filter(Boolean).length;
  console.log(`[statcastLoader] Loaded ${loaded}/9 blobs in ${elapsed}ms (season=${season})`);

  // ── 1) Batter EV map — keyed by player_id ────────────────────────────────
  // Fields per player: exit_velocity_avg, barrel_batted_rate, hard_hit_percent, brl_pa, pa
  const batterMap = new Map();
  {
    const curById = new Map((batCur?.players || []).map(p => [p.player_id, p]));
    const priById = new Map((batPri?.players || []).map(p => [p.player_id, p]));
    const allIds = new Set([...curById.keys(), ...priById.keys()]);

    for (const id of allIds) {
      const cur = curById.get(id);
      const pri = priById.get(id);
      const wCur = cur ? blendWeight(cur.pa) : 0;

      batterMap.set(id, {
        player_id:          id,
        exit_velocity_avg:  blendVal(cur?.exit_velocity_avg, pri?.exit_velocity_avg, wCur),
        barrel_batted_rate: blendVal(cur?.barrel_batted_rate, pri?.barrel_batted_rate, wCur),
        hard_hit_percent:   blendVal(cur?.hard_hit_percent, pri?.hard_hit_percent, wCur),
        brl_pa:             blendVal(cur?.brl_pa, pri?.brl_pa, wCur),
        pa_cur:             cur?.pa || 0,
        wCur,
      });
    }
  }

  // ── 2) Pitcher EV map — keyed by player_id ───────────────────────────────
  // Fields per pitcher: exit_velocity_avg, barrel_batted_rate, hard_hit_percent, bf
  const pitcherEvMap = new Map();
  {
    const curById = new Map((pitEvCur?.pitchers || []).map(p => [p.player_id, p]));
    const priById = new Map((pitEvPri?.pitchers || []).map(p => [p.player_id, p]));
    const allIds = new Set([...curById.keys(), ...priById.keys()]);

    for (const id of allIds) {
      const cur = curById.get(id);
      const pri = priById.get(id);
      const wCur = cur ? blendWeight(cur.bf) : 0;

      pitcherEvMap.set(id, {
        player_id:          id,
        exit_velocity_avg:  blendVal(cur?.exit_velocity_avg, pri?.exit_velocity_avg, wCur),
        barrel_batted_rate: blendVal(cur?.barrel_batted_rate, pri?.barrel_batted_rate, wCur),
        hard_hit_percent:   blendVal(cur?.hard_hit_percent, pri?.hard_hit_percent, wCur),
        bf_cur:             cur?.bf || 0,
        wCur,
      });
    }
  }

  // ── 3) Arsenal map — keyed by player_id ──────────────────────────────────
  // Fields per pitcher: pitches[] with pitch_type, run_value_per_100, whiff_percent, pitch_usage
  // We compute a single summary: weighted avg run_value_per_100 across all pitches (by usage)
  const arsenalMap = new Map();
  {
    const curById = new Map((arsCur?.pitchers || []).map(p => [p.player_id, p]));
    const priById = new Map((arsPri?.pitchers || []).map(p => [p.player_id, p]));
    const allIds = new Set([...curById.keys(), ...priById.keys()]);

    for (const id of allIds) {
      const cur = curById.get(id);
      const pri = priById.get(id);

      // Summarize each year's pitches into a weighted avg run_value_per_100
      const summarize = (pitcher) => {
        if (!pitcher?.pitches?.length) return null;
        let totalUsage = 0, weightedRV = 0, weightedWhiff = 0;
        for (const p of pitcher.pitches) {
          const u = p.pitch_usage || 0;
          const rv = p.run_value_per_100;
          const wh = p.whiff_percent;
          if (u > 0 && rv != null) { weightedRV += rv * u; weightedWhiff += (wh || 0) * u; totalUsage += u; }
        }
        return totalUsage > 0
          ? { rv100: weightedRV / totalUsage, whiff: weightedWhiff / totalUsage, pitches: pitcher.pitches }
          : null;
      };

      const curSum = summarize(cur);
      const priSum = summarize(pri);
      // Use current-year pitches if available (even small sample), blend RV scores
      const wCur = cur ? 0.4 : 0; // Arsenal: use modest current weight even early (4 games = real pitch mix data)
      const rv100 = blendVal(curSum?.rv100, priSum?.rv100, wCur);
      const whiff = blendVal(curSum?.whiff, priSum?.whiff, wCur);

      arsenalMap.set(id, {
        player_id: id,
        rv100,      // overall weighted run value per 100 pitches (negative = harder to hit HRs)
        whiff,      // overall weighted whiff%
        pitches: cur?.pitches || pri?.pitches || [],
      });
    }
  }

  // ── 4) FanGraphs pitcher map — keyed by player_id (fg_id) ────────────────
  // Fields: xfip, hr_fb_rate, gb_pct, fb_pct, fip, bf
  // FanGraphs uses fg_id (not MLB player_id). We key by fg_id here and
  // let the caller match on pitcher name when ID lookup fails.
  const fgByFgId = new Map();
  const fgByName = new Map(); // normalized name → record (fallback)
  {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
    const curList = fgCur?.pitchers || [];
    const priList = fgPri?.pitchers || [];
    const curById = new Map(curList.filter(p => p.fg_id).map(p => [p.fg_id, p]));
    const priById = new Map(priList.filter(p => p.fg_id).map(p => [p.fg_id, p]));
    const allIds = new Set([...curById.keys(), ...priById.keys()]);

    for (const id of allIds) {
      const cur = curById.get(id);
      const pri = priById.get(id);
      const wCur = cur ? blendWeight(cur.bf) : 0;
      const rec = {
        fg_id:       id,
        player_name: cur?.player_name || pri?.player_name || '',
        xfip:        blendVal(cur?.xfip, pri?.xfip, wCur),
        hr_fb_rate:  blendVal(cur?.hr_fb_rate, pri?.hr_fb_rate, wCur),
        gb_pct:      blendVal(cur?.gb_pct, pri?.gb_pct, wCur),
        fb_pct:      blendVal(cur?.fb_pct, pri?.fb_pct, wCur),
        fip:         blendVal(cur?.fip, pri?.fip, wCur),
        bf_cur:      cur?.bf || 0,
        wCur,
      };
      fgByFgId.set(id, rec);
      fgByName.set(norm(rec.player_name), rec);
    }
  }

  // ── 5) Park factor map — keyed by team abbreviation (uppercase) ───────────
  // Fields: hr_index_R, hr_index_L, hr_index_all (100 = neutral, >100 = hitter-friendly)
  const parkMap = new Map();
  {
    for (const venue of parkCur?.venues || []) {
      const key = String(venue.team || '').toUpperCase();
      if (key) {
        parkMap.set(key, {
          team:        key,
          hr_index_R:  venue.hr_index_R,
          hr_index_L:  venue.hr_index_L,
          hr_index_all: venue.hr_index_all,
        });
      }
    }
  }

  console.log(
    `[statcastLoader] Maps built — batters:${batterMap.size} pitcherEv:${pitcherEvMap.size} ` +
    `arsenal:${arsenalMap.size} fg:${fgByFgId.size} parks:${parkMap.size}`
  );

  return { batterMap, pitcherEvMap, arsenalMap, fgByFgId, fgByName, parkMap };
}

// ── Empty maps (Blobs unavailable fallback) ───────────────────────────────────
function emptyMaps() {
  return {
    batterMap:    new Map(),
    pitcherEvMap: new Map(),
    arsenalMap:   new Map(),
    fgByFgId:     new Map(),
    fgByName:     new Map(),
    parkMap:      new Map(),
  };
}

// ── Scoring helpers (exported for use in mlb-rr-generate.mjs) ────────────────

/**
 * Park HR factor from blob data.
 * Returns a multiplier (1.00 = neutral) derived from hr_index_all.
 * Falls back to the static parkFactors.js table if not found in blobs.
 *
 * @param {Map}    parkMap       From loadStatcastMaps()
 * @param {string} homeAbbrev    Home team abbreviation (e.g. "NYY")
 * @param {string} batterHand    'R', 'L', or null/unknown
 * @param {Function} staticFallback  parkHRFactorForAbbrev from lib/parkFactors.js
 * @returns {number}
 */
export function parkFactorFromBlob(parkMap, homeAbbrev, batterHand, staticFallback) {
  const key = String(homeAbbrev || '').toUpperCase();
  const rec = parkMap.get(key);
  if (!rec) return staticFallback ? staticFallback(key) : 1.0;

  // Use handedness-specific index when available, otherwise all-handed
  let idx;
  if (batterHand === 'R' && rec.hr_index_R != null) idx = rec.hr_index_R;
  else if (batterHand === 'L' && rec.hr_index_L != null) idx = rec.hr_index_L;
  else idx = rec.hr_index_all;

  return (idx != null) ? idx / 100 : (staticFallback ? staticFallback(key) : 1.0);
}

/**
 * Batter Statcast multiplier.
 * Combines barrel%, EV, and hard-hit% into a HR-rate adjustment.
 * Returns a multiplier centered on 1.0.
 *
 * Methodology:
 *   barrel% z-score vs league mean (4.5%) / sd (3.0%) → z_barrel
 *   hard_hit% z-score vs league mean (36%) / sd (8%) → z_hh
 *   mult = exp(0.12 * z_barrel + 0.05 * z_hh), clamped [0.80, 1.35]
 *
 * @param {Map}    batterMap   From loadStatcastMaps()
 * @param {number} mlbId      MLB player_id
 * @returns {number}  Multiplier (1.0 if no data)
 */
export function batterStatcastMult(batterMap, mlbId) {
  const rec = batterMap.get(Number(mlbId));
  if (!rec) return 1.0;

  const barrel = rec.barrel_batted_rate;
  const hh     = rec.hard_hit_percent;
  if (barrel == null && hh == null) return 1.0;

  const BARREL_MEAN = 4.5, BARREL_SD = 3.0;
  const HH_MEAN = 36.0, HH_SD = 8.0;

  const zBarrel = barrel != null ? (barrel - BARREL_MEAN) / BARREL_SD : 0;
  const zHH     = hh     != null ? (hh     - HH_MEAN)     / HH_SD     : 0;

  const mult = Math.exp(0.12 * zBarrel + 0.05 * zHH);
  return Math.max(0.80, Math.min(1.35, mult));
}

/**
 * Pitcher Statcast + Arsenal + FanGraphs multiplier.
 * Harder-contact pitchers allowed → higher HR risk for batters facing them.
 * Easier-contact pitchers → lower HR risk.
 *
 * Components:
 *   1. pitcherEv: barrel% allowed z-score → exp(0.10 * z)
 *   2. arsenal:   weighted avg run_value_per_100 (positive = hittable) → exp(0.03 * rv100)
 *   3. fangraphs: HR/FB rate z-score → exp(0.08 * z)
 *
 * Each component is optional; missing data → neutral (1.0).
 * Final mult clamped [0.75, 1.40].
 *
 * @param {Map}    pitcherEvMap  From loadStatcastMaps()
 * @param {Map}    arsenalMap    From loadStatcastMaps()
 * @param {Map}    fgByName      From loadStatcastMaps()
 * @param {number} mlbPitcherId  MLB player_id of the opposing pitcher
 * @param {string} pitcherName   Full name (for FanGraphs name-fallback lookup)
 * @returns {number}  Multiplier (1.0 = league-average pitcher)
 */
export function pitcherStatcastMult(pitcherEvMap, arsenalMap, fgByName, mlbPitcherId, pitcherName) {
  // League baselines for pitchers (barrel% allowed, HR/FB rate)
  const BARREL_ALLOWED_MEAN = 7.0, BARREL_ALLOWED_SD = 3.0;
  const HR_FB_MEAN = 0.105, HR_FB_SD = 0.030;

  let log = 0; // sum of log-multiplier components

  // 1) Pitcher EV / barrel allowed
  const evRec = pitcherEvMap.get(Number(mlbPitcherId));
  if (evRec?.barrel_batted_rate != null) {
    const z = (evRec.barrel_batted_rate - BARREL_ALLOWED_MEAN) / BARREL_ALLOWED_SD;
    log += 0.10 * z;
  }

  // 2) Arsenal run value per 100 — positive RV = hittable pitch mix
  const arsRec = arsenalMap.get(Number(mlbPitcherId));
  if (arsRec?.rv100 != null) {
    log += 0.03 * arsRec.rv100;
  }

  // 3) FanGraphs HR/FB rate
  const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const fgRec = fgByName.get(normName(pitcherName));
  if (fgRec?.hr_fb_rate != null) {
    const z = (fgRec.hr_fb_rate - HR_FB_MEAN) / HR_FB_SD;
    log += 0.08 * z;
  }

  const mult = Math.exp(log);
  return Math.max(0.75, Math.min(1.40, mult));
}
