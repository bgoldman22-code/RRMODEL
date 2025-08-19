
// netlify/functions/nfl-anytime-td-candidates.mjs
import { normalizeTeam, gameKey } from "./lib/teamMaps.mjs";
import { impliedFromAmerican, probToAmerican, evFromProbAndUS } from "./lib/ev.mjs";

function nextThursdayISO() {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun..6=Sat (UTC)
  const daysUntilThu = (4 - dow + 7) % 7; // Thu = 4
  const cand = new Date(now);
  cand.setUTCDate(now.getUTCDate() + daysUntilThu);
  const y = cand.getUTCFullYear();
  const m = String(cand.getUTCMonth()+1).padStart(2,'0');
  const d = String(cand.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

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
    const mode = (url.searchParams.get("mode")||"").toLowerCase();
    const date = (url.searchParams.get("date")||"").trim() || nextThursdayISO();

    const sched = await j(`/.netlify/functions/nfl-schedule?date=${date}${mode==='week' ? '&mode=week' : ''}`);
    const games = Array.isArray(sched?.games) ? sched.games : [];

    // Odds are optional; if unavailable, candidates may be empty but we never throw.
    const odds = await j(`/.netlify/functions/nfl-odds?date=${date}`);
    const props = Array.isArray(odds?.props) ? odds.props : [];

    const byGame = new Set(games.map(g => g.key));
    const out = [];

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

    out.sort((a,b) => (b.EV ?? -1) - (a.EV ?? -1));
    return new Response(JSON.stringify({ ok:true, date, candidates: out, info: { games: games.length, props: props.length, mode } }), {
      headers: { 'content-type':'application/json', 'cache-control':'no-store' }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:true, candidates: [], info: { error: "exception" } }), {
      headers: { 'content-type':'application/json', 'cache-control':'no-store' },
      status: 200
    });
  }
}
