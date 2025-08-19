
// netlify/functions/nfl-anytime-td-candidates.mjs
// Produces Anytime TD candidates with model probabilities and EV when odds available.
// Minimal, robust, additive-only (won't break other parts).

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

function estTeamTDsFromTotal(totalPoints){
  const tp = Number(totalPoints);
  if (!Number.isFinite(tp) || tp <= 0) return 2.5; // neutral
  return tp / 7.0;
}

// Simple positional prior shares for TD distribution (can calibrate later)
const POS_PRIOR = { RB: 0.42, WR: 0.43, TE: 0.13, QB: 0.02 };

function guessPositionFromName(name){
  // Placeholder until depth charts are wired: default WR.
  return "WR";
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const date = (url.searchParams.get("date")||"").trim();

    // Inputs
    const sched = await j(`/.netlify/functions/nfl-schedule?date=${date}`);
    const games = Array.isArray(sched?.games) ? sched.games : [];

    // Optional odds (player anytime TD)
    const odds = await j(`/.netlify/functions/nfl-odds?date=${date}`);
    const props = Array.isArray(odds?.props) ? odds.props : [];

    // Index odds by player+game key (we'll accept any team mapping and infer from book when absent)
    const out = [];
    for (const p of props){
      const away = p.away, home = p.home;
      if (!away || !home) continue;
      const gk = gameKey(away, home);
      // derive player team and opponent for model sanity:
      const playerTeam = p.team || null;
      const opponent = playerTeam
        ? (playerTeam === away ? home : (playerTeam === home ? away : null))
        : null;

      // Base model probability: start from implied, nudge by priors & (future) weather
      const implied = impliedFromAmerican(p.american);
      const pos = guessPositionFromName(p.player);
      const prior = POS_PRIOR[pos] || 0.35;
      // If implied exists, blend; else use naive prior against 2.5 TDs baseline
      const teamTDs = 2.5;
      const naive = 1 - Math.exp(-teamTDs * prior * 0.25); // rough conversion to "anytime" for main skill player
      const modelProb = (implied != null) ? (0.6*implied + 0.4*naive) : naive;

      const modelAmerican = probToAmerican(modelProb);
      const EV = (p.american != null) ? evFromProbAndUS(modelProb, p.american) : null;

      const gameStr = `${away}@${home}`;
      const why = [
        implied != null ? `market p=${(implied*100).toFixed(1)}%` : null,
        `pos prior=${Math.round(prior*100)}% share`,
        opponent ? `vs ${opponent} (opponent)` : null,
        `blend model`
      ].filter(Boolean).join(" • ");

      out.push({
        Player: p.player,
        Game: gameStr,
        modelProb,
        modelAmerican,
        american: p.american ?? null,
        EV,
        Why: why
      });
    }

    // Sort by EV desc as primary output
    out.sort((a,b) => (b.EV ?? -1) - (a.EV ?? -1));

    return json(200, { ok:true, date, candidates: out, info: { games: games.length, props: props.length } });
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
