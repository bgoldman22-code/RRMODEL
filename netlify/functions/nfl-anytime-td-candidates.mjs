
// netlify/functions/nfl-anytime-td-candidates.mjs
import { normalizeTeam, gameKey } from "./lib/teamMaps.mjs";
import { impliedFromAmerican, probToAmerican, evFromProbAndUS } from "./lib/ev.mjs";
import { tdWeatherMultiplier } from "./lib/weatherNFL.mjs";

async function j(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  const t = await r.text();
  if (!r.ok) return null;
  if (!t || t.trim().startsWith("<")) return null;
  try{ return JSON.parse(t); }catch{ return null; }
}

const POS_PRIOR = { RB: 0.42, WR: 0.43, TE: 0.13, QB: 0.02 };
function guessPositionFromName(name){ return "WR"; }

export default async (req) => {
  try{
    const url = new URL(req.url);
    const date = (url.searchParams.get("date")||"").trim();
    const mode = (url.searchParams.get("mode")||"").toLowerCase();
    const sched = await j(`/.netlify/functions/nfl-schedule?date=${date}${mode==='week' ? '&mode=week' : ''}`);
    const games = Array.isArray(sched?.games) ? sched.games : [];

    // Try to pull props; if none, we still produce a placeholder list from team priors so UI shows something.
    const odds = await j(`/.netlify/functions/nfl-odds?date=${date}`);
    const props = Array.isArray(odds?.props) ? odds.props : [];

    const byGame = new Set(games.map(g => g.key));
    const out = [];

    // If we have props, use them
    for (const p of props){
      const away = p.away, home = p.home;
      if (!away || !home) continue;
      const gk = gameKey(away, home);
      if (!byGame.has(gk)) continue;

      const implied = impliedFromAmerican(p.american);
      const prior = POS_PRIOR["WR"];
      const naive = 1 - Math.exp(-2.5 * prior * 0.25);
      const modelProb = (implied != null) ? (0.6*implied + 0.4*naive) : naive;
      const modelAmerican = probToAmerican(modelProb);
      const EV = (p.american != null) ? evFromProbAndUS(modelProb, p.american) : null;

      out.push({
        Player: p.player,
        Game: `${away}@${home}`,
        modelProb, modelAmerican,
        american: p.american ?? null,
        EV,
        Why: [implied!=null?`market p=${(implied*100).toFixed(1)}%`:null, "blend model"].filter(Boolean).join(" • ")
      });
    }

    // If no props, return 0 rows to avoid misleading output (UI remains usable)
    out.sort((a,b) => (b.EV ?? -1) - (a.EV ?? -1));
    return json(200, { ok:true, date, candidates: out, info: { games: games.length, props: props.length, mode } });
  }catch(e){
    return json(200, { ok:true, candidates: [], info: { error: "exception" } });
  }
}

function json(statusCode, body){
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type":"application/json", "cache-control":"no-store" }
  });
}
