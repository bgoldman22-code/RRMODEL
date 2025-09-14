// netlify/functions/nfl-predictions-generate/index.cjs
// CJS file that dynamically imports ESM helpers
const { URLSearchParams } = require("url");

async function importHelpers() {
  const fe = await import("../_lib/feature-engineering.mjs");
  const blobs = await import("../_lib/blobs-helper.mjs");
  return { fe, blobs };
}

function trPct(x){
  if (x == null) return null;
  const pct = Math.round(x*100);
  return Math.max(0, Math.min(100, pct));
}

// compose display strings
function formatMoneyline(team, price) {
  if (price == null) return team;
  return `${team} (${price})`;
}
function formatSpread(team, point, price) {
  if (point == null) return "–";
  const sign = point > 0 ? "+" : "";
  const priceStr = price != null ? ` (${price})` : "";
  return `${team} ${sign}${point}${priceStr}`;
}

exports.handler = async (event) => {
  const { fe, blobs } = await importHelpers();
  const qs = new URLSearchParams(event.rawQuery || event.rawQueryString || "");
  const force = !!qs.get("force");

  const logs = [];

  // Load team_form from blobs if available
  let features = null;
  try {
    const store = await blobs.openStore(process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "rrmodel");
    features = await blobs.getJSONSafe(store, "team_form.json");
    logs.push({ level:"info", msg:"features_loaded", rows: features ? Object.keys(features).length : 0 });
  } catch (e) {
    logs.push({ level:"warn", msg:"features_missing", error: String(e) });
  }

  // Load schedule w/ odds (your existing schedule source). Expect an upstream util to provide it.
  // For resilience, accept payload passthrough via body for local tests.
  let schedule = null;
  try {
    // existing upstream should have set precomputed schedule JSON in blobs as well
    const store = await blobs.openStore(process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "rrmodel");
    schedule = await blobs.getJSONSafe(store, "schedule.json");
    if (!schedule || !Array.isArray(schedule)) throw new Error("no_schedule_in_blobs");
    logs.push({ level:"info", msg:"schedule_loaded", games: schedule.length });
  } catch (e) {
    logs.push({ level:"warn", msg:"schedule_fallback", error: String(e) });
    try {
      schedule = JSON.parse(event.body || "[]");
    } catch {}
  }

  if (!schedule || !schedule.length) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:false, error:"no_schedule", logs })
    };
  }

  // Build picks
  const rows = [];
  for (const g of schedule) {
    const {
      id, matchup, kickoff, homeTeam, awayTeam, odds = {}
    } = g;

    // Lines (only for mapping sides / thresholds, not for confidence)
    const ml_home = odds.ml_home ?? null;
    const ml_away = odds.ml_away ?? null;
    const spread_point = odds.spread_point ?? null;
    const total_points = odds.total_points ?? null;
    const over_price = odds.over_price ?? null;
    const under_price = odds.under_price ?? null;

    let moneylinePick = null, moneylineConf = null;
    let spreadPick = null, spreadConf = null;
    let totalPick = null, totalConf = null;

    if (features) {
      // Use latest features for each team within that season. Season guess from kickoff year.
      const season = new Date(kickoff).getUTCFullYear();
      const fh = fe.latestTeamWeek(features, season, homeTeam) || {};
      const fa = fe.latestTeamWeek(features, season, awayTeam) || {};

      const scored = fe.scoreMatchup(fh, fa, { spread: spread_point, total: total_points });

      // Moneyline: choose side by model p_home vs 0.5
      const p_home = scored.p_home ?? 0.5;
      const sideTeam = p_home >= 0.5 ? homeTeam : awayTeam;
      const sidePrice = p_home >= 0.5 ? ml_home : ml_away;
      moneylinePick = formatMoneyline(sideTeam, sidePrice);
      moneylineConf = trPct(Math.abs(p_home - 0.5)*2*0.85 + 0.5*0.0); // stretch around 50–85%

      // Spread: pick favorite if p_home > 0.5, else dog + points (if spread exists)
      if (spread_point != null) {
        const takeHome = p_home >= 0.5;
        const spreadTeam = takeHome ? homeTeam : awayTeam;
        const spreadPoint = takeHome ? spread_point : -spread_point;
        const spreadPrice = takeHome ? odds.spread_home_line : odds.spread_away_line;
        spreadPick = formatSpread(spreadTeam, spreadPoint, spreadPrice);
        spreadConf = trPct(0.5 + Math.min(0.35, Math.abs(p_home - 0.5)*1.6));
      }

      // Total: use p_over
      if (total_points != null && scored.p_over != null) {
        const isOver = scored.p_over >= 0.5;
        totalPick = isOver ? `OVER ${total_points}` : `UNDER ${total_points}`;
        totalConf = trPct(0.5 + Math.min(0.35, Math.abs(scored.p_over - 0.5)*1.7));
      }
    } else {
      // Fallback: neutral 50s
      moneylinePick = formatMoneyline(homeTeam, ml_home);
      moneylineConf = 50;
      if (spread_point != null) {
        spreadPick = formatSpread(homeTeam, spread_point, odds.spread_home_line);
        spreadConf = 50;
      }
      if (total_points != null) {
        totalPick = `OVER ${total_points}`;
        totalConf = 50;
      }
    }

    rows.push({
      id, matchup, kickoff,
      moneylineText: moneylinePick, moneylineConf: (moneylineConf ?? 50)/100,
      spreadText: spreadPick, spreadConf: (spreadConf ?? 50)/100,
      totalText: totalPick, totalConf: (totalConf ?? 50)/100,
    });
  }

  // Log a small sample for runtime visibility
  const sample = rows.slice(0, 5).map(r => ({
    matchup: r.matchup, ML: r.moneylineText, MLc: r.moneylineConf,
    SP: r.spreadText, SPc: r.spreadConf, TOT: r.totalText, TOTc: r.totalConf
  }));
  logs.push({ level:"info", msg:"sample_rows", sample });

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok:true, rows, logs, meta: { source: "model-epa-lite" }, updated: new Date().toISOString() })
  };
};
