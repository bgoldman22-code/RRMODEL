// PATCH: ensure pick text fields are included; keep confidence fixes and add debug logging.
// This file is self-contained and safe to drop-in to replace the function bundle entry.
/* eslint-disable */
const fetch = globalThis.fetch || require("node:https").request; // Netlify provides fetch; fallback placeholder

// Small utility: safe percentage
const pct = (num) => {
  if (num === null || num === undefined || Number.isNaN(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num * 100)));
};

// Compose pretty labels
function formatMoneyline(odds, sideTeam) {
  if (!odds || (odds.ml_home == null && odds.ml_away == null)) return null;
  if (!sideTeam) return null;
  const isHome = odds.home?.toUpperCase?.() === sideTeam.toUpperCase?.();
  const price = isHome ? odds.ml_home : odds.ml_away;
  if (price == null) return sideTeam; // no price, show team
  const priceStr = price > 0 ? `(${price})` : `(${price})`;
  return `${sideTeam} ${priceStr}`;
}

function formatSpread(odds, pick) {
  if (!odds || odds.spread_point == null || !pick?.team) return null;
  const line = odds.spread_point;
  const isHome = odds.home?.toUpperCase?.() === pick.team.toUpperCase?.();
  const team = pick.team;
  const sideLine = isHome ? line : -line;
  const price = isHome ? odds.spread_home_line : odds.spread_away_line;
  const priceStr = price != null ? ` (${price})` : "";
  return `${team} ${sideLine} ${priceStr}`;
}

function formatTotal(odds, pick) {
  if (!odds || odds.total_points == null || !pick?.side) return null;
  const label = pick.side?.toUpperCase?.().includes("OVER") ? "OVER" : "UNDER";
  return `${label} ${odds.total_points}`;
}

// Fallback model: derive win prob from EPA form deltas (simple logistic transform)
function simpleMoneylineModel(formHome, formAway, homeEdge = 0.03) {
  // form ~ [-.3, +.3] ish. Add a tiny home advantage.
  const x = (formHome ?? 0) - (formAway ?? 0) + homeEdge;
  const p = 1 / (1 + Math.exp(-4.5 * x)); // steeper sigmoid
  return Math.max(0.05, Math.min(0.95, p));
}

exports.handler = async (event, context) => {
  const started = Date.now();
  try {
    const FORCE = event?.queryStringParameters?.force === "true";
    // Endpoints are preconfigured in your environment (from your current site)
    const scheduleUrl = process.env.SCHEDULE_URL || "https://bgroundrobin.com/.netlify/functions/nfl-schedule-get";
    const oddsUrl = process.env.ODDS_URL || "https://bgroundrobin.com/.netlify/functions/nfl-odds-bridge";
    const formUrl = process.env.TEAM_FORM_URL || "https://bgroundrobin.com/nflverse-team-form.json";

    const [schedRes, oddsRes, formRes] = await Promise.all([
      fetch(scheduleUrl),
      fetch(oddsUrl),
      fetch(formUrl)
    ]);

    const schedule = await schedRes.json();
    const oddsData = await oddsRes.json();
    const formData = await formRes.json();

    const oddsById = new Map();
    for (const r of (oddsData?.rows || [])) oddsById.set(r.id, r);

    const formByName = (abbr) => formData?.team_data?.[abbr]?.form ?? null;

    // very light team->abbr map from odds rows if possible
    const guessAbbr = (team) => {
      if (!team) return null;
      const t = team.toUpperCase();
      // use a hand-rolled minimal mapping consistent with your data feed
      const map = {
        "DETROIT LIONS":"DET","CHICAGO BEARS":"CHI","CINCINNATI BENGALS":"CIN","JACKSONVILLE JAGUARS":"JAX",
        "DALLAS COWBOYS":"DAL","NEW YORK GIANTS":"NYG","MIAMI DOLPHINS":"MIA","NEW ENGLAND PATRIOTS":"NE",
        "BALTIMORE RAVENS":"BAL","CLEVELAND BROWNS":"CLE","NEW YORK JETS":"NYJ","BUFFALO BILLS":"BUF",
        "TENNESSEE TITANS":"TEN","LOS ANGELES RAMS":"LA","NEW ORLEANS SAINTS":"NO","SAN FRANCISCO 49ERS":"SF",
        "PITTSBURGH STEELERS":"PIT","SEATTLE SEAHAWKS":"SEA","ARIZONA CARDINALS":"ARI","CAROLINA PANTHERS":"CAR",
        "INDIANAPOLIS COLTS":"IND","DENVER BRONCOS":"DEN","KANSAS CITY CHIEFS":"KC","PHILADELPHIA EAGLES":"PHI",
        "MINNESOTA VIKINGS":"MIN","ATLANTA FALCONS":"ATL","HOUSTON TEXANS":"HOU","TAMPA BAY BUCCANEERS":"TB",
        "LAS VEGAS RAIDERS":"LV","LOS ANGELES CHARGERS":"LAC","GREEN BAY PACKERS":"GB","WASHINGTON COMMANDERS":"WAS",
        "SF":"SF","LAC":"LAC","LA":"LA"
      };
      return map[t] || null;
    };

    const rows = [];
    for (const m of (schedule?.matchups || [])) {
      const id = m.id;
      const odds = oddsById.get(id);
      const home = (m.homeTeam || odds?.home || "").toUpperCase();
      const away = (m.awayTeam || odds?.away || "").toUpperCase();

      // Model moneyline via team form (independent of odds); odds only used to format strings
      const fh = formByName(guessAbbr(home));
      const fa = formByName(guessAbbr(away));
      const pHome = simpleMoneylineModel(fh, fa, 0.03);
      const pAway = 1 - pHome;
      const mlPickTeam = pHome >= 0.5 ? home : away;
      const mlConf = pct(Math.max(pHome, pAway));

      // Placeholder spread/total signals (still independent of book line)
      // Use form diffs to lean under/over and favorite spread
      const formDiff = (fh ?? 0) - (fa ?? 0);
      const spreadPick = { team: mlPickTeam, side: "spread" };
      const spreadConf = pct(0.5 + Math.min(0.35, Math.abs(formDiff) * 1.1));
      const totalPick = { side: (fh ?? 0) + (fa ?? 0) > 0 ? "OVER" : "UNDER" };
      const totalConf = pct(0.5 + Math.min(0.35, Math.abs((fh ?? 0) + (fa ?? 0))));

      const row = {
        id,
        matchup: `${away} @ ${home}`,
        kickoff: m.kickoff,
        // display strings:
        moneylineText: formatMoneyline(odds, mlPickTeam),
        moneylineConf: mlConf,
        spreadText: formatSpread(odds, spreadPick),
        spreadConf: spreadConf,
        totalText: formatTotal(odds, totalPick),
        totalConf: totalConf,
        // raw details for debugging
        debug: {
          home, away, fh, fa, pHome, pAway, formDiff,
          odds: odds ? { ml_home: odds.ml_home, ml_away: odds.ml_away, spread_point: odds.spread_point, total_points: odds.total_points } : null
        }
      };

      // Graceful fallbacks to "-" if we couldn't format with odds
      if (!row.moneylineText) row.moneylineText = mlPickTeam || "-";
      if (!row.spreadText) row.spreadText = "-";
      if (!row.totalText) row.totalText = "-";

      rows.push(row);

      // Runtime logging so you can inspect what the model generated
      console.log(`[NFL MODEL] ${row.matchup} | ML pick=${mlPickTeam} (${row.moneylineConf}%)` +
        ` | spread='${row.spreadText}' (${row.spreadConf}%) | total='${row.totalText}' (${row.totalConf}%)`);
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, updated: new Date().toISOString(), meta: { source: "model-epa-sigmoid", schedule_source: schedule?.source || "unknown" }, rows })
    };
  } catch (err) {
    console.error("nfl-predictions-generate crashed", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Function crashed", details: { hint: "See function logs", code: "GEN_CRASH" } })
    };
  } finally {
    const ms = Date.now() - started;
    console.log(`[NFL MODEL] handler finished in ${ms}ms`);
  }
};
