/**
 * NFL Predictions Generator
 * - tolerant to missing schedule
 * - builds from odds-only when needed
 * - logs internal state at debug level
 */
const logger = require('../_lib/logger.cjs');

const fetchJson = async (url) => {
  const res = await fetch(url);
  const ct = res.headers.get('content-type') || '';
  const txt = await res.text();
  try {
    const json = ct.includes('application/json') ? JSON.parse(txt) : JSON.parse(txt);
    return { ok: res.ok, status: res.status, json, url };
  } catch {
    return { ok: false, status: res.status, json: null, url, text: txt };
  }
};

function impliedProbFromMoneyline(ml) {
  if (ml == null) return null;
  return ml < 0 ? (-ml) / ((-ml) + 100) : 100 / (ml + 100);
}
function confidenceFromPrices({ ml_home, ml_away }) {
  const pH = impliedProbFromMoneyline(ml_home);
  const pA = impliedProbFromMoneyline(ml_away);
  if (pH == null && pA == null) return { side: null, conf: null };
  if (pH != null && (pA == null || pH >= pA)) return { side: "home", conf: pH };
  if (pA != null) return { side: "away", conf: pA };
  return { side: null, conf: null };
}

function buildFromOddsOnly(oddsRows = [], teamForm) {
  const rows = [];
  for (const o of oddsRows) {
    if (!o?.home || !o?.away) continue;
    let side = null, conf = null;
    const byPrice = confidenceFromPrices({ ml_home: o.ml_home, ml_away: o.ml_away });
    side = byPrice.side; conf = byPrice.conf;

    const displayPick = (side === "home" ? o.home : o.away) || null;
    const displayPrice = side === "home" ? o.ml_home ?? null : o.ml_away ?? null;

    rows.push({
      id: o.id,
      matchup: `${String(o.away).toUpperCase()} @ ${String(o.home).toUpperCase()}`,
      kickoff: o.commence_time ?? null,
      homeTeam: String(o.home).toUpperCase(),
      awayTeam: String(o.away).toUpperCase(),
      odds: o,
      model_choice: { market: "moneyline", side },
      displayMarket: "moneyline",
      displayPick,
      displayPrice: displayPrice == null ? null : String(displayPrice),
      displayLine: null,
      confidence: conf == null ? null : Number(conf),
      pick: {
        type: "moneyline",
        team: displayPick,
        confidence: conf == null ? null : Number(conf),
        pickLabel: `moneyline: ${displayPick}`,
      },
    });
  }
  return rows;
}

// Optionally join schedule if available (simple mapper; keep robust)
function buildByJoiningSchedule(matchups = [], oddsRows = []) {
  const byId = new Map((oddsRows || []).map(o => [o.id, o]));
  const rows = [];
  for (const m of matchups) {
    const o = byId.get(m.id);
    if (!o) continue;
    const byPrice = confidenceFromPrices({ ml_home: o.ml_home, ml_away: o.ml_away });
    const side = byPrice.side;
    const displayPick = (side === "home" ? o.home : o.away) || null;
    const displayPrice = side === "home" ? o.ml_home ?? null : o.ml_away ?? null;

    rows.push({
      id: m.id,
      matchup: `${String(m.awayTeam).toUpperCase()} @ ${String(m.homeTeam).toUpperCase()}`,
      kickoff: m.kickoff ?? o.commence_time ?? null,
      homeTeam: String(m.homeTeam).toUpperCase(),
      awayTeam: String(m.awayTeam).toUpperCase(),
      odds: o,
      model_choice: { market: "moneyline", side },
      displayMarket: "moneyline",
      displayPick,
      displayPrice: displayPrice == null ? null : String(displayPrice),
      displayLine: null,
      confidence: byPrice.conf == null ? null : Number(byPrice.conf),
      pick: {
        type: "moneyline",
        team: displayPick,
        confidence: byPrice.conf == null ? null : Number(byPrice.conf),
        pickLabel: `moneyline: ${displayPick}`,
      },
    });
  }
  return rows;
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    status: init.status || 200
  });
}

exports.handler = async (event) => {
  const url = new URL(event.rawUrl || `http://x.local${event.path}${event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters).toString() : ''}`);
  const qp = Object.fromEntries(url.searchParams.entries());
  if (qp.log) process.env.LOG_LEVEL = qp.log;

  const scheduleUrl = process.env.SCHEDULE_URL || 'https://bgroundrobin.com/.netlify/functions/nfl-schedule-get';
  const oddsUrl = process.env.ODDS_URL || 'https://bgroundrobin.com/.netlify/functions/nfl-odds-bridge';
  const teamFormUrl = process.env.TEAM_FORM_URL || 'https://bgroundrobin.com/nflverse-team-form.json';

  logger.info("fetching endpoints", { scheduleUrl, oddsUrl, teamFormUrl });

  const [schedule, odds, teamForm] = await Promise.all([
    fetchJson(scheduleUrl).catch(e => ({ ok:false, error:String(e) })),
    fetchJson(oddsUrl).catch(e => ({ ok:false, error:String(e) })),
    fetchJson(teamFormUrl).catch(e => ({ ok:false, error:String(e) })),
  ]);

  logger.debug("fetched", { schedule_ok: schedule.ok, odds_ok: odds.ok, team_ok: teamForm.ok });

  const scheduleRows = schedule?.json?.matchups ?? [];
  const oddsRows = odds?.json?.rows ?? [];

  let rows = [];
  const prefer = (qp.source || '').toLowerCase(); // 'odds' to force
  if (prefer === 'odds') {
    rows = buildFromOddsOnly(oddsRows, teamForm?.json);
  } else if (Array.isArray(scheduleRows) && scheduleRows.length) {
    rows = buildByJoiningSchedule(scheduleRows, oddsRows);
  } else if (Array.isArray(oddsRows) && oddsRows.length) {
    rows = buildFromOddsOnly(oddsRows, teamForm?.json);
  } else {
    rows = [];
  }

  // limit
  if (qp.limit) {
    const n = Math.max(0, parseInt(qp.limit, 10) || 0);
    if (n > 0) rows = rows.slice(0, n);
  }

  logger.debug("rows built", { count: rows.length, source: (prefer==='odds'?'odds':(scheduleRows?.length?'schedule':'odds-fallback')) });
  if (rows[0]) {
    const { matchup, displayPick, confidence } = rows[0];
    logger.debug("sample row", { matchup, displayPick, confidence });
  }

  return json({
    ok: true,
    updated: new Date().toISOString(),
    meta: {
      endpoints: { scheduleUrl, oddsUrl, teamFormUrl },
      source: (prefer==='odds'?'odds':(scheduleRows?.length?'schedule':'odds-fallback'))
    },
    rows
  });
};
