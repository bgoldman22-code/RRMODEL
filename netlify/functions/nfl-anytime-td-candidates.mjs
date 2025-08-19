// netlify/functions/nfl-anytime-td-candidates.mjs
import { gameKey } from "./lib/teamMaps.mjs";
import { impliedFromAmerican, probToAmerican, evFromProbAndUS } from "./lib/ev.mjs";

async function j(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  const t = await r.text();
  if (!r.ok) return null;
  if (!t || t.trim().startsWith("<")) return null;
  try{ return JSON.parse(t); }catch{ return null; }
}

// crude priors (calibrate later)
const POS_PRIOR = { RB:0.42, WR:0.43, TE:0.13, QB:0.02 };
function guessPos(name){
  // until depth charts: assume WR
  return "WR";
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const date = (url.searchParams.get("date")||"").trim();
    const mode = (url.searchParams.get("mode")||"week"); // default week

    const sched = await j(`/.netlify/functions/nfl-schedule?date=${date}${mode==='week'?'&mode=week':''}`);
    const games = Array.isArray(sched?.games) ? sched.games : [];
    const validKeys = new Set(games.map(g => gameKey(g.away, g.home)));

    const odds = await j(`/.netlify/functions/nfl-odds?date=${date}`);
    const props = Array.isArray(odds?.props) ? odds.props : [];

    const out = [];
    for (const p of props){
      const gk = gameKey(p.away, p.home);
      if (!validKeys.has(gk)) continue; // only include players in our week window

      const implied = impliedFromAmerican(p.american);
      const prior = POS_PRIOR[guessPos(p.player)] || 0.35;
      const naive = 1 - Math.exp(-2.5 * prior * 0.25);
      const modelProb = (implied != null) ? (0.6*implied + 0.4*naive) : naive;
      const modelAmerican = probToAmerican(modelProb);
      const EV = (p.american != null) ? evFromProbAndUS(modelProb, p.american) : null;

      out.push({
        Player: p.player,
        Game: `${p.away}@${p.home}`,
        modelProb, modelAmerican,
        american: p.american ?? null,
        EV,
        Why: [
          implied != null ? `market p=${(implied*100).toFixed(1)}%` : null,
          `pos prior=${Math.round(prior*100)}%`,
          `blend model`,
          p.book ? `book=${p.book}` : null
        ].filter(Boolean).join(" • ")
      });
    }

    out.sort((a,b) => (b.EV ?? -1) - (a.EV ?? -1));

    return new Response(JSON.stringify({ ok:true, candidates: out, info:{ games: games.length, props: props.length, mode } }), {
      headers: { "content-type":"application/json", "cache-control":"no-store" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:true, candidates: [], info:{ error:"exception" } }), {
      headers: { "content-type":"application/json", "cache-control":"no-store" }
    });
  }
}
