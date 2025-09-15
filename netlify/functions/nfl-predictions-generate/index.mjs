import { loadFromBlobs } from "../_lib/blobs-helper.mjs";
import { fetchGamesCsv } from "../_lib/nflverse.mjs";
import { buildTeamForm, winProb } from "../_lib/features.mjs";
import { percent, formatMarket } from "../_lib/util.mjs";

function hostBase(event){
  const h = event.headers?.host || "";
  const proto = h.includes("localhost") ? "http" : "https";
  return `${proto}://${h}`;
}

async function getSchedule(event){
  const base = hostBase(event);
  try{
    const res = await fetch(`${base}/.netlify/functions/nfl-schedule-get?force=1`);
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    return j.matchups || [];
  }catch{
    return [];
  }
}

export async function handler(event){
  try{
    let features = await loadFromBlobs("team_form.json");
    let metaSource = "blobs";
    if (!features){
      // fallback: compute ephemeral
      const now = new Date();
      const seasons = [ now.getUTCFullYear() ];
      const rows = await fetchGamesCsv({ seasons });
      const form = buildTeamForm(rows);
      features = Object.fromEntries(form.entries());
      metaSource = "ephemeral";
    }

    const schedule = await getSchedule(event);

    const rows = schedule.map(g => {
      const home = g.homeTeam;
      const away = g.awayTeam;
      const fh = Number(features[home] ?? 0);
      const fa = Number(features[away] ?? 0);
      const pHome = winProb(fh, fa);
      const pAway = 1 - pHome;

      const moneylinePick = pHome >= pAway ? home : away;
      const moneylineProb = Math.max(pHome, pAway);
      const moneylineConf = percent(moneylineProb);

      const moneylineText = formatMarket({ team: moneylinePick, price: (moneylinePick===home ? -150 : 130), kind: 'ml' });

      return {
        id: g.id,
        matchup: `${away.toUpperCase()} @ ${home.toUpperCase()}`,
        kickoff: g.kickoff,
        moneylineText,
        moneylineConf,
        spreadText: "–",
        spreadConf: 0,
        totalText: "–",
        totalConf: 0,
        debug: { home, away, fh, fa, pHome, pAway }
      };
    });

    const body = { ok:true, updated:new Date().toISOString(), meta:{ source: metaSource, schedule_source:"odds" }, rows };
    console.log("[PREDS]", JSON.stringify({ rows: rows.length, source: metaSource }));
    return { statusCode: 200, body: JSON.stringify(body) };
  }catch(err){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:"Function crashed", details:{ hint:"See function logs", code:"GEN_CRASH", message:String(err) } }) };
  }
}

export default { handler };
