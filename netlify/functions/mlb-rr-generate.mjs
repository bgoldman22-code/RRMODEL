/**
 * MLB Round Robin V3 - Live Prediction Generator
 *
 * Real MLB StatsAPI pipeline — no mock data.
 * Fetches today's schedule, active rosters, season stats,
 * probable pitchers, park factors, weather, and OddsAPI HR odds
 * then scores every rostered hitter and surfaces:
 *   - Top 10 by Probability
 *   - Top 20 by EV
 *   - RR structure recommendations
 *   - WHY explanations for each pick
 *
 * Called by frontend on-demand; cached 10 min in Netlify Blobs.
 */

import { pitcherHRMultiplier } from './lib/hrPitcherMultiplier.js';
import { parkHRFactorForAbbrev } from './lib/parkFactors.js';
import { weatherHRMultiplier }   from './lib/weatherMultiplier.js';

// Lazy Blobs import — avoids crash when Blobs env isn't configured
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

// ── API endpoints ──────────────────────────────────────────
const MLB_API      = 'https://statsapi.mlb.com/api/v1';
const SCHEDULE_URL = (date) => `${MLB_API}/schedule?sportId=1&date=${encodeURIComponent(date)}&gameType=R,D,L,W,F&hydrate=probablePitcher,venue`;
const TEAMS_URL    = (season) => `${MLB_API}/teams?sportId=1&season=${season}`;
const ROSTER_URL   = (tid) => `${MLB_API}/teams/${tid}/roster?rosterType=active`;
const PEOPLE_URL   = (ids, season) => `${MLB_API}/people?personIds=${ids.join(',')}&hydrate=stats(group=hitting,type=season,season=${season})`;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_URL = 'https://api.the-odds-api.com/v4';

// ── Bayesian prior for early-season HR estimation ──────────
const PRIOR_PA      = 60;
const PRIOR_HR_RATE = 0.04;
const EXP_PA        = 4.1;   // expected PA per game
const CAP_PROB      = 0.40;  // max per-game HR prob

// ── Helpers ────────────────────────────────────────────────
function dateET(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function seasonFromET(d = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(d)) || new Date().getFullYear();
}
function isMLBSeasonActive() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 3 && month <= 10; // March-October
}
async function fetchJSON(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ── Fetch probable pitchers via live feed ──────────────────
async function getProbablePitcherMap(games) {
  const out = new Map(); // teamId → { pitcherId, name, hand }
  for (const g of games) {
    const gamePk = g?.gamePk;
    if (!gamePk) continue;
    try {
      const feed = await fetchJSON(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
      const homeId = g?.teams?.home?.team?.id;
      const awayId = g?.teams?.away?.team?.id;
      const probHome = feed?.gameData?.probablePitchers?.home?.id || g?.teams?.home?.probablePitcher?.id;
      const probAway = feed?.gameData?.probablePitchers?.away?.id || g?.teams?.away?.probablePitcher?.id;
      const homeName = feed?.gameData?.probablePitchers?.home?.fullName || g?.teams?.home?.probablePitcher?.fullName || null;
      const awayName = feed?.gameData?.probablePitchers?.away?.fullName || g?.teams?.away?.probablePitcher?.fullName || null;
      if (homeId && probAway) out.set(homeId, { pitcherId: probAway, name: awayName, hand: null });
      if (awayId && probHome) out.set(awayId, { pitcherId: probHome, name: homeName, hand: null });
    } catch { /* skip single game */ }
  }
  return out;
}

// ── Weather extraction ─────────────────────────────────────
async function extractWeather(game) {
  try {
    const gamePk = game?.gamePk;
    if (!gamePk) return { tempF: null, windOutMph: null, precip: false };
    const feed = await fetchJSON(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    const w = feed?.gameData?.weather || {};
    const tempF = typeof w?.temp === 'number' ? w.temp : null;
    let windOutMph = null;
    if (typeof w?.windSpeed === 'number') {
      const dir = String(w?.windDirection || '').toLowerCase();
      windOutMph = /out.*center|out.*cf/.test(dir) ? w.windSpeed : (/in.*center|in.*cf/.test(dir) ? -w.windSpeed : 0);
    }
    return { tempF, windOutMph, precip: String(w?.condition || '').toLowerCase().includes('rain') };
  } catch { return { tempF: null, windOutMph: null, precip: false }; }
}

// ── EV math ────────────────────────────────────────────────
function americanToDecimal(am) {
  return am > 0 ? am / 100 + 1 : 100 / Math.abs(am) + 1;
}
function calculateEV(probability, americanOdds) {
  return probability * americanToDecimal(americanOdds) - 1;
}
function probToAmerican(p) {
  if (p <= 0 || p >= 1) return 0;
  return p >= 0.5 ? Math.round(-100 * p / (1 - p)) : Math.round(100 * (1 - p) / p);
}

// ── WHY builder ────────────────────────────────────────────
function generateWHY({ probability, ev, parkMult, pitcherName, weatherMult, seasonHR, seasonPA }) {
  const reasons = [];
  if (parkMult >= 1.08) reasons.push(`🏟️ Park boost +${((parkMult - 1) * 100).toFixed(0)}%`);
  if (parkMult <= 0.92) reasons.push(`🏟️ Pitcher park −${((1 - parkMult) * 100).toFixed(0)}%`);
  if (pitcherName) reasons.push(`⚾ vs ${pitcherName}`);
  if (weatherMult > 1.04) reasons.push(`🌡️ Weather +${((weatherMult - 1) * 100).toFixed(0)}%`);
  if (seasonPA > 0 && seasonHR / seasonPA >= 0.06) reasons.push(`💪 ${seasonHR} HR in ${seasonPA} PA`);
  if (probability >= 0.22) reasons.push('🔥 Elite HR rate');
  else if (probability >= 0.18) reasons.push('💪 Strong HR rate');
  if (ev >= 0.15) reasons.push('💰 Excellent value');
  else if (ev >= 0.08) reasons.push('💵 Good value');
  return reasons.join(' • ') || 'Solid baseline stats';
}

// ── Fetch HR odds from TheOddsAPI ──────────────────────────
async function fetchHROdds() {
  if (!ODDS_API_KEY) { console.log('⚠️ No ODDS_API_KEY — odds will be model-only'); return new Map(); }
  try {
    const url = `${ODDS_API_URL}/sports/baseball_mlb/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=player_home_runs&oddsFormat=american`;
    const data = await fetchJSON(url, 12000);
    const byPlayer = new Map(); // normalized name → { odds:[], books:Set }
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.]/g, '').trim();
    for (const game of data || []) {
      for (const bk of game.bookmakers || []) {
        for (const mkt of bk.markets || []) {
          if (mkt.key !== 'player_home_runs') continue;
          for (const o of mkt.outcomes || []) {
            const key = norm(o.description);
            if (!byPlayer.has(key)) byPlayer.set(key, { odds: [], books: new Set() });
            const rec = byPlayer.get(key);
            rec.odds.push(o.price);
            rec.books.add(bk.key);
          }
        }
      }
    }
    // Compute median odds per player
    const out = new Map();
    for (const [key, rec] of byPlayer) {
      const sorted = [...rec.odds].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      out.set(key, { american: median, books: rec.books.size });
    }
    return out;
  } catch (e) { console.error('OddsAPI error:', e.message); return new Map(); }
}

// ── Round Robin recommendations ────────────────────────────
function recommendRR(count) {
  if (count < 3) return [{ legs: 2, structure: 'by 2s', parlays: 1, description: 'Too few candidates' }];
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
  const recs = [];
  if (count >= 4 && count <= 6)  recs.push({ legs: count, structure: `${count}-Pick`, parlays: 1, roi: '+31%', description: 'OPTIMAL — Best ROI/variance balance', recommended: true });
  if (C(count, 3) <= 100)        recs.push({ legs: 3, structure: `${count}-Pick by 3s`, parlays: C(count, 3), roi: '+36%', description: 'High ROI, moderate variance' });
  if (C(count, 2) <= 50)         recs.push({ legs: 2, structure: `${count}-Pick by 2s`, parlays: C(count, 2), roi: '+81%', description: 'Highest ROI, higher variance' });
  return recs.length ? recs : [{ legs: 3, structure: 'by 3s', parlays: C(count, 3), description: 'Standard approach' }];
}

// ── Hot/cold (14-day) lookup ───────────────────────────────
async function getHotColdBulk(ids) {
  const out = new Map();
  if (!ids.length) return out;
  try {
    const now = new Date();
    const end = dateET(now);
    const d = new Date(end + 'T00:00:00');
    d.setDate(d.getDate() - 13);
    const beg = dateET(d);
    const chunks = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    for (const chunk of chunks) {
      const url = `${MLB_API}/people?personIds=${chunk.join(',')}&hydrate=stats(group=hitting,type=byDateRange,startDate=${beg},endDate=${end})`;
      const j = await fetchJSON(url);
      for (const p of j.people || []) {
        let hr14 = 0, pa14 = 0;
        for (const s of p.stats || []) for (const sp of s.splits || []) {
          hr14 += Number(sp?.stat?.homeRuns || 0);
          pa14 += Number(sp?.stat?.plateAppearances || 0);
        }
        out.set(String(p.id), { hr14, pa14 });
      }
    }
  } catch { /* best effort */ }
  return out;
}
function hotColdMultiplier(hr14, pa14, seasonHR, seasonPA) {
  if (pa14 < 20) return 1.0;
  const recent = hr14 / pa14;
  const season = seasonPA > 0 ? seasonHR / seasonPA : 0.04;
  const ratio = season > 0 ? recent / season : 1.0;
  // Clamp to ±15%
  return Math.max(0.85, Math.min(1.15, ratio));
}

// ════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════
export async function handler(event) {
  try {
    const today = dateET();
    const season = seasonFromET();
    const forceRefresh = event.queryStringParameters?.refresh === 'true';

    // ── Cache check (10 min) ───────────────────────────────
    if (!forceRefresh) {
      try {
        const store = await safeGetStore('mlb-rr-predictions');
        const cached = await store?.get('latest', { type: 'json' });
        if (cached && cached.date === today && typeof cached.ts === 'number' && (Date.now() - cached.ts) < 10 * 60 * 1000) {
          console.log('✅ RR cache hit');
          return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, body: JSON.stringify({ ...cached, cached: true }) };
        }
      } catch { /* cache miss */ }
    }

    // ── Offseason guard ────────────────────────────────────
    if (!isMLBSeasonActive()) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true, offseason: true,
          message: 'MLB offseason — check back once the season starts.',
          date: today, topByProb: [], topByEV: [], recommendations: [],
          meta: { season, gamesCount: 0 }
        })
      };
    }

    // ═══ 1) Today's schedule ═══════════════════════════════
    console.log(`⚾ Fetching MLB schedule for ${today}…`);
    const sched = await fetchJSON(SCHEDULE_URL(today));
    const rawGames = (sched?.dates?.[0]?.games) || [];
    // Only scheduled / pre-game
    const games = rawGames.filter(g => ['S', 'P', 'PW'].includes(g?.status?.statusCode));
    if (games.length === 0) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: 'No MLB games today', date: today, topByProb: [], topByEV: [], recommendations: [], meta: { gamesCount: 0 } }) };
    }
    console.log(`  ${games.length} scheduled games`);

    // ═══ 2) Teams abbreviation map ═════════════════════════
    const teamsJ = await fetchJSON(TEAMS_URL(season));
    const abbrevById = new Map();
    for (const t of teamsJ?.teams || []) abbrevById.set(t.id, t.abbreviation || t.teamCode || t.name);

    // ═══ 3) Team ↔ game mapping ════════════════════════════
    const teamGameMap = new Map();
    for (const g of games) {
      const hid = g?.teams?.home?.team?.id, aid = g?.teams?.away?.team?.id;
      if (!hid || !aid) continue;
      teamGameMap.set(hid, { oppId: aid, game: g, side: 'home' });
      teamGameMap.set(aid, { oppId: hid, game: g, side: 'away' });
    }
    const teamIds = [...teamGameMap.keys()];

    // ═══ 4) Active rosters (hitters only) ══════════════════
    const rosterByTeam = new Map();
    await Promise.all(teamIds.map(async tid => {
      try {
        const r = await fetchJSON(ROSTER_URL(tid));
        rosterByTeam.set(tid, (r?.roster || []).filter(x => String(x?.position?.code).toUpperCase() !== 'P'));
      } catch { rosterByTeam.set(tid, []); }
    }));

    // ═══ 5) Season stats ═══════════════════════════════════
    const allPids = [...new Set(teamIds.flatMap(tid => (rosterByTeam.get(tid) || []).map(r => r?.person?.id).filter(Boolean)))];
    const statById = new Map();
    const chunks = [];
    for (let i = 0; i < allPids.length; i += 100) chunks.push(allPids.slice(i, i + 100));
    await Promise.all(chunks.map(async chunk => {
      try {
        const pj = await fetchJSON(PEOPLE_URL(chunk, season));
        for (const p of pj?.people || []) {
          let hr = 0, pa = 0;
          for (const s of p?.stats || []) for (const sp of s?.splits || []) {
            hr += Number(sp?.stat?.homeRuns || 0);
            pa += Number(sp?.stat?.plateAppearances || 0);
          }
          statById.set(p.id, { name: p.fullName || p.firstLastName || 'Player', hr, pa });
        }
      } catch { /* skip chunk */ }
    }));

    // 5b) Early-season fallback: if ZERO players have PA in current season,
    //     re-fetch using prior season so Opening Day still works.
    const anyPA = [...statById.values()].some(s => s.pa > 0);
    if (!anyPA && season > 2020) {
      const fallbackSeason = season - 1;
      console.log(`⚠️ No ${season} stats yet — falling back to ${fallbackSeason}`);
      await Promise.all(chunks.map(async chunk => {
        try {
          const pj = await fetchJSON(PEOPLE_URL(chunk, fallbackSeason));
          for (const p of pj?.people || []) {
            let hr = 0, pa = 0;
            for (const s of p?.stats || []) for (const sp of s?.splits || []) {
              hr += Number(sp?.stat?.homeRuns || 0);
              pa += Number(sp?.stat?.plateAppearances || 0);
            }
            statById.set(p.id, { name: p.fullName || p.firstLastName || 'Player', hr, pa });
          }
        } catch { /* skip chunk */ }
      }));
    }

    // ═══ 6) Pitchers, weather, odds, hot/cold in parallel ═
    let learn = null;
    try { learn = await safeGetStore('mlb-learning'); } catch { /* Blobs not configured — pitcher profiles unavailable */ }
    const [pitcherMap, oddsMap, hotMap] = await Promise.all([
      getProbablePitcherMap(games),
      fetchHROdds(),
      getHotColdBulk(allPids),
    ]);
    // Weather per game (sequential — each hits live feed)
    const weatherByPk = new Map();
    for (const g of games) weatherByPk.set(g.gamePk, await extractWeather(g));

    // ═══ 7) Score every hitter ═════════════════════════════
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.]/g, '').trim();
    const candidates = [];

    for (const tid of teamIds) {
      const meta = teamGameMap.get(tid);
      if (!meta) continue;
      const teamAb = abbrevById.get(tid) || 'TEAM';
      const oppAb  = abbrevById.get(meta.oppId) || 'OPP';
      const homeAb = meta.side === 'home' ? teamAb : oppAb;
      const gameLabel = meta.side === 'home' ? `${oppAb} @ ${teamAb}` : `${teamAb} @ ${oppAb}`;
      const homeStarter = meta.game?.teams?.home?.probablePitcher?.fullName || 'TBD';
      const awayStarter = meta.game?.teams?.away?.probablePitcher?.fullName || 'TBD';
      const starterFacing = meta.side === 'home' ? awayStarter : homeStarter;
      const venue = meta.game?.venue?.name || 'Unknown';

      for (const r of rosterByTeam.get(tid) || []) {
        const pid = r?.person?.id;
        const st  = statById.get(pid);
        if (!st) continue;
        const seasonHR = Number(st.hr || 0);
        const seasonPA = Number(st.pa || 0);
        if (seasonPA <= 0) continue;

        // Bayesian HR rate
        const adjHR = seasonHR + PRIOR_PA * PRIOR_HR_RATE;
        const adjPA = seasonPA + PRIOR_PA;
        const p_pa  = Math.max(0, Math.min(0.15, adjHR / adjPA));

        // Pitcher multiplier
        let pitcherMult = 1.0, pitcherName = null;
        try {
          const info = pitcherMap.get(tid);
          if (info?.pitcherId) {
            const prof = await learn?.get(`profiles/pitcher/${info.pitcherId}.json`, { type: 'json' });
            if (prof?.samples && prof?.hr) pitcherMult = pitcherHRMultiplier({ samples: prof.samples, hr: prof.hr });
            pitcherName = info.name || null;
          }
        } catch { /* 1.0 */ }

        // Park + weather
        const parkMult    = parkHRFactorForAbbrev(homeAb);
        const wx          = weatherByPk.get(meta.game?.gamePk) || {};
        const weatherMult = weatherHRMultiplier(wx);

        // Hot/cold
        const hc = hotMap.get(String(pid)) || { hr14: 0, pa14: 0 };
        const hcMult = hotColdMultiplier(hc.hr14, hc.pa14, seasonHR, seasonPA);

        // Per-game HR probability
        const p_pa_adj = Math.max(0, Math.min(0.15, p_pa * pitcherMult * parkMult * weatherMult * hcMult));
        const p_game   = 1 - Math.pow(1 - p_pa_adj, EXP_PA);
        const probability = Math.min(CAP_PROB, Math.max(0.001, p_game));

        // Odds
        const oddsRec = oddsMap.get(norm(st.name));
        const odds    = oddsRec ? oddsRec.american : probToAmerican(probability);
        const ev      = calculateEV(probability, odds);

        candidates.push({
          player: st.name,
          team: teamAb,
          opponent: oppAb,
          venue,
          probability,
          odds,
          ev,
          why: generateWHY({ probability, ev, parkMult, pitcherName, weatherMult, seasonHR, seasonPA }),
          game: gameLabel,
          starter: starterFacing,
          booksCount: oddsRec?.books || 0,
        });
      }
    }

    // ═══ 8) Sort, filter, recommend ════════════════════════
    const topByProb = [...candidates].sort((a, b) => b.probability - a.probability).slice(0, 10);
    const topByEV   = candidates.filter(c => c.ev > 0.02 && c.probability >= 0.12).sort((a, b) => b.ev - a.ev).slice(0, 20);
    const recommendations = recommendRR(Math.min(topByEV.length, 6));

    // ═══ 9) Response + cache ═══════════════════════════════
    const payload = {
      ok: true, date: today, topByProb, topByEV, recommendations,
      meta: {
        gamesCount: games.length,
        candidatesCount: candidates.length,
        oddsAvailable: oddsMap.size > 0,
        season,
        generatedAt: new Date().toISOString(),
      },
    };
    try {
      const store = await safeGetStore('mlb-rr-predictions');
      if (store) await store.set('latest', JSON.stringify({ ...payload, ts: Date.now() }));
    } catch { /* cache write failure is non-fatal */ }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, body: JSON.stringify(payload) };

  } catch (error) {
    console.error('❌ RR generate error:', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: error.message }) };
  }
}
