/**
 * netlify/functions/nfl-predictions-generate/index.cjs
 * - No dependency on "createClient"
 * - Uses _lib/blobs-helper.mjs: openStore()
 * - Robust, structured logging (LOG_LEVEL=debug for verbose)
 */

const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const lvl = levels[LOG_LEVEL] ?? 20;

function log(level, msg, meta) {
  const val = levels[level] ?? 20;
  if (val < lvl) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...(meta ? { meta } : {}) };
  if (val >= 40) console.error(JSON.stringify(entry));
  else if (val >= 30) console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

const ENDPOINTS = {
  scheduleUrl: process.env.SCHEDULE_URL,
  oddsUrl: process.env.ODDS_URL,
  teamFormUrl: process.env.TEAM_FORM_URL,
};

const DEFAULTS = {
  scheduleUrl: null, // if not set, we'll fallback to building schedule from odds
  oddsUrl: null,
  teamFormUrl: null,
};

// ---- HTTP helpers ---------------------------------------------------------
async function getJSON(url, label) {
  if (!url) return { ok: false, error: "no-url" };
  try {
    const t0 = Date.now();
    const res = await fetch(url, { method: "GET", headers: { "accept": "application/json" } });
    const ms = Date.now() - t0;
    let json = null; try { json = await res.json(); } catch (_) {}
    log("info", `fetch ${label}`, { url, status: res.status, ms });
    if (!res.ok) return { ok: false, status: res.status, json };
    return { ok: true, status: res.status, json };
  } catch (err) {
    log("warn", `fetch error ${label}`, { url, error: String(err) });
    return { ok: false, error: String(err) };
  }
}

// ---- Math / model helpers -------------------------------------------------
function decToProb(dec) { return dec / (dec + 100); }        // for negative ML (e.g. -130 → 130/(130+100))
function plusToProb(plus) { return 100 / (plus + 100); }     // for positive ML (e.g. +150 → 100/(150+100))
function mlToProb(ml) {
  if (ml == null) return null;
  return ml < 0 ? decToProb(-ml) : plusToProb(ml);
}
function clamp(x, a=0.01, b=0.99){ return Math.max(a, Math.min(b, x)); }

const TEAM_MAP = {
  "SAN FRANCISCO 49ERS":"SF","NEW ORLEANS SAINTS":"NO","LOS ANGELES RAMS":"LA","LOS ANGELES CHARGERS":"LAC",
  "GREEN BAY PACKERS":"GB","KANSAS CITY CHIEFS":"KC","NEW YORK JETS":"NYJ","NEW YORK GIANTS":"NYG",
  "TAMPA BAY BUCCANEERS":"TB","WASHINGTON COMMANDERS":"WAS","NEW ENGLAND PATRIOTS":"NE",
  "LAS VEGAS RAIDERS":"LV","JACKSONVILLE JAGUARS":"JAX","ARIZONA CARDINALS":"ARI","MINNESOTA VIKINGS":"MIN",
  "SEATTLE SEAHAWKS":"SEA","INDIANAPOLIS COLTS":"IND","TENNESSEE TITANS":"TEN","CHICAGO BEARS":"CHI",
  "DETROIT LIONS":"DET","BALTIMORE RAVENS":"BAL","BUFFALO BILLS":"BUF","MIAMI DOLPHINS":"MIA",
  "DALLAS COWBOYS":"DAL","PITTSBURGH STEELERS":"PIT","CLEVELAND BROWNS":"CLE","ATLANTA FALCONS":"ATL",
  "HOUSTON TEXANS":"HOU","CINCINNATI BENGALS":"CIN","CAROLINA PANTHERS":"CAR","PHILADELPHIA EAGLES":"PHI"
};
function abbr(name) { if (!name) return null; const key = name.toUpperCase(); return TEAM_MAP[key] || key.replace(/[^A-Z]/g,"").slice(0,3); }

function formSignal(form, home, away) {
  if (!form || !form.team_data) return 0;
  const h = form.team_data[abbr(home)]?.form ?? 0;
  const a = form.team_data[abbr(away)]?.form ?? 0;
  return h - a; // >0 leans home
}

function buildRowFromOdds(match, odds, form) {
  const home = match.homeTeam;
  const away = match.awayTeam;

  // Moneyline probs from odds with vig-normalization
  const pHomeOdds = mlToProb(odds?.ml_home);
  const pAwayOdds = mlToProb(odds?.ml_away);
  let pHome = null, pAway = null;
  if (pHomeOdds != null && pAwayOdds != null) {
    const vig = pHomeOdds + pAwayOdds;
    pHome = pHomeOdds / vig; pAway = pAwayOdds / vig;
  } else if (pHomeOdds != null) { pHome = pHomeOdds; pAway = 1 - pHome; }
  else if (pAwayOdds != null) { pAway = pAwayOdds; pHome = 1 - pAway; }

  // Model lean from team form
  const delta = formSignal(form, home, away); // roughly [-.3, .3]
  const modelLean = 0.5 + clamp(delta * 0.4, -0.2, 0.2); // tilt

  // Blend: heavier on model (independent of odds), odds as guidance
  const blendedHome = clamp( (modelLean)*0.7 + (pHome ?? 0.5)*0.3 );
  const blendedAway = 1 - blendedHome;

  const moneylinePick = blendedHome >= blendedAway ? home : away;
  const moneylineConf = Math.max(blendedHome, blendedAway);

  // Spread stance
  let spreadPick = null;
  if (odds?.spread_point != null) {
    const sp = odds.spread_point;
    const homeFav = sp < 0;
    if ((moneylinePick === home && homeFav) || (moneylinePick === away && !homeFav)) {
      spreadPick = `${moneylinePick.toUpperCase()} ${homeFav ? sp : "+"+Math.abs(sp)}`;
    } else {
      spreadPick = `${(moneylinePick===home?away:home).toUpperCase()} ${homeFav ? "+"+Math.abs(sp) : sp}`;
    }
  }

  // Totals stance
  let ouPick = null;
  if (odds?.total_points != null) {
    const total = odds.total_points;
    const edge = Math.abs(blendedHome - 0.5);
    if (total >= 46 && edge > 0.08) ouPick = "OVER " + total;
    else if (total <= 43 && edge > 0.08) ouPick = "UNDER " + total;
    else ouPick = (edge >= 0.12 ? "OVER " : "UNDER ") + total;
  }

  return {
    id: match.id,
    matchup: `${away} @ ${home}`.toUpperCase(),
    kickoff: match.kickoff,
    homeTeam: home.toUpperCase(),
    awayTeam: away.toUpperCase(),
    odds,
    model_choice: { market: "moneyline", side: moneylinePick === home ? "home" : "away" },
    displayMarket: "moneyline",
    displayPick: moneylinePick.toUpperCase(),
    displayPrice: odds?.[moneylinePick === home ? "ml_home" : "ml_away"] ?? null,
    displayLine: null,
    confidence: Number(moneylineConf.toFixed(4)),
    picks: {
      moneyline: { team: moneylinePick.toUpperCase(), confidence: Number(moneylineConf.toFixed(4)) },
      spread: spreadPick,
      overUnder: ouPick
    }
  };
}

function toScheduleFromOdds(oddsRows = []) {
  const seen = new Map();
  const list = [];
  for (const o of oddsRows) {
    const id = o.id || `${o.away}-${o.home}-${o.commence_time}`;
    if (seen.has(id)) continue;
    seen.set(id, true);
    list.push({
      id,
      homeTeam: String(o.home || "").toUpperCase(),
      awayTeam: String(o.away || "").toUpperCase(),
      kickoff: o.commence_time,
    });
  }
  return list;
}

// ---- Handler --------------------------------------------------------------
exports.handler = async (event) => {
  const tStart = Date.now();
  const force = (event?.queryStringParameters?.force === "true");
  const endpoints = { ...DEFAULTS, ...ENDPOINTS };

  log("info", "start nfl-predictions-generate", {
    force,
    endpoints: {
      scheduleUrl: endpoints.scheduleUrl ? "set" : null,
      oddsUrl: endpoints.oddsUrl ? "set" : null,
      teamFormUrl: endpoints.teamFormUrl ? "set" : null
    }
  });

  let scheduleRes = { ok: false }, oddsRes = { ok: false }, formRes = { ok: false };
  if (endpoints.oddsUrl) oddsRes = await getJSON(endpoints.oddsUrl, "odds");
  if (endpoints.teamFormUrl) formRes = await getJSON(endpoints.teamFormUrl, "teamForm");
  if (endpoints.scheduleUrl) scheduleRes = await getJSON(endpoints.scheduleUrl, "schedule");

  // Build schedule
  let schedule = [];
  if (scheduleRes.ok && scheduleRes.json?.ok && Array.isArray(scheduleRes.json.matchups)) {
    schedule = scheduleRes.json.matchups.map(m => ({
      id: m.id,
      homeTeam: String(m.homeTeam || "").toUpperCase(),
      awayTeam: String(m.awayTeam || "").toUpperCase(),
      kickoff: m.kickoff,
    }));
    log("info", "using schedule endpoint", { count: schedule.length });
  } else if (oddsRes.ok && Array.isArray(oddsRes.json?.rows)) {
    schedule = toScheduleFromOdds(oddsRes.json.rows);
    log("warn", "schedule fallback via odds", { count: schedule.length });
  } else {
    log("error", "no schedule available", { scheduleOk: scheduleRes.ok, oddsOk: oddsRes.ok });
  }

  // Index odds by id
  const oddsById = new Map();
  if (oddsRes.ok && Array.isArray(oddsRes.json?.rows)) {
    for (const r of oddsRes.json.rows) oddsById.set(r.id, r);
    log("info", "odds loaded", { count: oddsById.size });
  }

  // Build rows
  let rows = [];
  try {
    rows = schedule.map(m => buildRowFromOdds(m, oddsById.get(m.id), formRes.json)).filter(Boolean);
  } catch (err) {
    log("error", "rows build error", { error: String(err) });
    rows = [];
  }

  rows.sort((a,b) => (new Date(a.kickoff) - new Date(b.kickoff)));

  // Logging: sample row + split
  log("info", "rows built", { count: rows.length });
  if (rows.length) {
    log("debug", "sample row", { first: rows[0] });
    const homePct = rows.filter(r => r.model_choice?.side === "home").length / rows.length;
    log("info", "home/away split", { home_pct: Number((homePct*100).toFixed(1)) });
  }

  const response = {
    ok: true,
    updated: new Date().toISOString(),
    meta: {
      endpoints,
      source: (scheduleRes.ok && scheduleRes.json?.ok) ? "schedule" : "odds-fallback",
    },
    rows,
  };

  const ms = Date.now() - tStart;
  log("info", "done nfl-predictions-generate", { ms, rows: rows.length });

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(response),
  };
};
