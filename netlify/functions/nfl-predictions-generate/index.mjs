import { loadFromBlobs } from "../_lib/blobs-helper.mjs";

const SCHEDULE_URL = null; // if not set, use odds fallback function
const ODDS_SCHEDULE_FN = "/.netlify/functions/nfl-schedule-get";

async function getSchedule() {
  // Try local function to avoid CORS
  const base = process.env.URL || "";
  const url = base + ODDS_SCHEDULE_FN + "?force=1";
  const r = await fetch(url);
  if (!r.ok) throw new Error("schedule_get_failed " + r.status);
  const j = await r.json();
  return j.matchups || [];
}

function pickText(name, value, price) {
  if (value == null) return "–";
  return `${name} ${value} ${price ? '(' + price + ')' : ''}`.trim();
}

export const handler = async (event) => {
  try {
    const qp = event.queryStringParameters || {};
    const force = qp.force ? true : false;

    const form = await loadFromBlobs("team_form.json");
    if (!form) {
      return { statusCode:200, body: JSON.stringify({ ok:true, updated:new Date().toISOString(), meta:{ source:"no-team-form" }, rows:[] }) };
    }

    const sched = await getSchedule();
    const rows = sched.map(m => {
      const home = m.homeTeam, away = m.awayTeam;
      const fh = form[home]?.net ?? 0, fa = form[away]?.net ?? 0;
      const edge = (fa - fh); // positive -> away favored
      const pAway = 1/(1+Math.exp(-edge)); // sigmoid on net diff
      const pHome = 1 - pAway;
      const mlPick = pHome > pAway ? home : away;
      const mlConf = Math.round(Math.max(pHome, pAway)*100);

      // cheap spread/total placeholders until model upgraded
      const spreadPick = (pAway > 0.52) ? `${away} 1.5` : `${home} -1.5`;
      const spreadConf = Math.round(Math.abs(0.5 - Math.max(pHome,pAway))*200 + 50);
      const totalPick = (Math.max(form[home]?.off||0, form[away]?.off||0) > 22) ? "OVER 43.5" : "UNDER 43.5";
      const totalConf = 60;

      return {
        id: m.id,
        matchup: `${m.awayTeam} @ ${m.homeTeam}`,
        kickoff: m.kickoff,
        moneylineText: `${mlPick}`,
        moneylineConf: mlConf,
        spreadText: spreadPick,
        spreadConf,
        totalText: totalPick,
        totalConf
      };
    });

    return { statusCode:200, body: JSON.stringify({ ok:true, updated:new Date().toISOString(), meta:{ source:"model-epa-sigmoid" }, rows }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
