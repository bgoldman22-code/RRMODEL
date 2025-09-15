
import { loadFromBlobs } from '../_lib/blobs-helper.mjs';

// sigmoid -> probability from form difference
const sig = (x) => 1/(1+Math.exp(-x));

export const handler = async (event) => {
  const force = (event.queryStringParameters||{}).force;
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  const features = await loadFromBlobs("team_form.json", { storeName });
  if (!features) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, updated: new Date().toISOString(), meta: { source: "no-team-form" }, rows: [] }) };
  }

  // schedule from odds fallback function
  const base = new URL(event.rawUrl || "http://localhost");
  base.pathname = "/.netlify/functions/nfl-schedule-get";
  base.search = "?force=1";
  const schedResp = await fetch(base.toString());
  const sched = await schedResp.json();
  const matchups = sched.matchups || [];

  const rows = [];
  for (const m of matchups) {
    const home = m.homeTeam;
    const away = m.awayTeam;
    const fh = features[home]?.form ?? 0;
    const fa = features[away]?.form ?? 0;
    const formDiff = fh - fa;
    const pHome = sig(formDiff);
    const pAway = 1 - pHome;

    // naive odds mapping if you have odds on schedule payload
    const odds = m.odds || {};
    // pick strings
    const mlPick = pHome >= pAway ? home.toUpperCase() : away.toUpperCase();

    // convert prob edge to confidence percentage
    const moneylineConf = Math.round(100 * Math.max(pHome, pAway));
    const spreadPick = mlPick + " " + (odds.spread_point ?? (pHome >= pAway ? -3.5 : 3.5)) + "  (" + (odds.spread_price ? odds.spread_price : "-110") + ")";
    const totalPick = (odds.total_points ? (features[home]?.ppg + features[away]?.ppg)/2 > (odds.total_points) ? "OVER " : "UNDER " : "UNDER ") + (odds.total_points ?? 44.5);

    const row = {
      id: m.id,
      matchup: `${(away||"").toUpperCase()} @ ${(home||"").toUpperCase()}`,
      kickoff: m.kickoff,
      moneylineText: `${mlPick} ${odds.ml_home && odds.ml_away ? (mlPick===home.toUpperCase()?`(${odds.ml_home})`:`(${odds.ml_away})`) : ""}`.trim(),
      moneylineConf: moneylineConf,
      spreadText: spreadPick,
      spreadConf: Math.min(85, Math.max(50, Math.round(100*Math.abs(pHome-0.5)*2)+50)),
      totalText: totalPick,
      totalConf: Math.min(85, Math.max(50, 60)),
      debug: { home, away, fh, fa, pHome, pAway, formDiff, odds }
    };
    console.log('[PREDICTION]', row);
    rows.push(row);
  }

  return {
    statusCode: 200,
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ ok: true, updated: new Date().toISOString(), meta: { source: "team-form+odds", schedule_source: sched.source }, rows })
  };
};
