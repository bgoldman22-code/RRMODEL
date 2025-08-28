// netlify/functions/nfl-anytime-td-candidates.mjs
// Always computes for the coming NFL week; ignores UI week selector.

import { loadStaticData, loadSchedule, loadRosters, loadOddsSnapshot } from "./lib/loadNFL.mjs";
import { computeRzProb, computeExpProb, blendAndCalibrate, toAmerican, logit } from "./lib/mathNFL.mjs";
import { getStore } from "@netlify/blobs";

async function getWeatherSafe(game) {
  try {
    const mod = await import("./lib/weatherNFL.mjs");
    if (typeof mod.getWeather === "function") {
      const w = await mod.getWeather({ date: game?.date, homeTeam: game?.home, awayTeam: game?.away });
      return { wind_factor: Number(w?.wind_factor ?? 1.0), precipitation_factor: Number(w?.precipitation_factor ?? 1.0) };
    }
  } catch {}
  return { wind_factor: 1.0, precipitation_factor: 1.0 };
}

function store() { try { return getStore({ name: process.env.NFL_TD_BLOBS || process.env.BLOBS_STORE_NFL || "nfl-td" }); } catch { return null; } }
function normName(s) { return (s || "").toLowerCase().replace(/[^\w]/g, ""); }

export async function handler(event) {
  const qs = event?.queryStringParameters || {};
  const debug = qs.debug === "1" || qs.debug === "true";
  const refresh = qs.refresh === "1" || qs.refresh === "true";
  const date = qs.date || null; // optional; backend chooses coming week if null
  const bookmaker = (qs.book || process.env.ODDSAPI_BOOKMAKER_NFL || "fanduel").toLowerCase();
  const oddsless = qs.odds === "0" || qs.mode === "oddsless";

  const blob = store();
  const cacheKey = `nfl-td:candidates:${date || "auto"}:coming-week:${oddsless ? "oddsless" : bookmaker}`;

  if (!refresh && blob) {
    try {
      const cached = await blob.get(cacheKey, { type: "json" });
      const fresh = cached && cached.updatedAt && (Date.now() - Date.parse(cached.updatedAt) < 60*60*1000);
      if (fresh && cached.data) {
        return { statusCode: 200, body: JSON.stringify({ ok: true, season: cached.meta?.season, week: cached.meta?.week, games: cached.meta?.games, candidates: cached.data, info: { ...(cached.meta || {}), cached: true } }) };
      }
    } catch {}
  }

  try {
    const staticData = await loadStaticData();
    const sched = await loadSchedule({ date, mode: "week" });
    const season = sched?.season ?? 2025;
    const week = sched?.week ?? 1;
    const games = Array.isArray(sched?.games) ? sched.games : [];

    const rosterObj = await loadRosters({ season, week });
    const rosters = rosterObj?.rosters || {};

    const offers = oddsless ? [] : (await loadOddsSnapshot({ date: date || new Date().toISOString().slice(0,10), bookmaker })) || [];
    const offersByName = new Map(offers.map(o => [normName(o.selection), o]));

    const candidates = [];
    let props = 0;

    for (const game of games) {
      const home = game.home, away = game.away;
      const weather = await getWeatherSafe(game);
      for (const team of [home, away]) {
        const teamRoster = rosters?.[team] || {};
        const opp = team === home ? away : home;
        for (const pos of ["QB","RB","WR","TE"]) {
          const list = Array.isArray(teamRoster[pos]) ? teamRoster[pos] : [];
          for (let i=0;i<list.length;i++) {
            const entry = list[i];
            const name = typeof entry === "string" ? entry : (entry?.name || String(entry));
            const depth = i + 1;
            const ctx = {
              player: { name, pos, depth },
              team: { abbrev: team },
              opponent: { abbrev: opp },
              game: { date: game.date, home, away },
              teamTendencies: { [team]: staticData.teamTendencies?.[team] },
              pbpAggregates: { [team]: staticData.pbpAggregates?.[team] },
              opponentDefense: { [opp]: staticData.opponentDefense?.[opp] },
              playerExplosive: staticData.playerExplosive,
              playerMetricsSmall: staticData.playerMetrics,
              qbTendenciesSmall: staticData.qbTendencies,
              roles: staticData.roles,
              defenseProfilesSmall: staticData.defenseProfiles
            };
            const rz = computeRzProb(ctx);
            const exp = computeExpProb(ctx, weather);
            const prob = blendAndCalibrate(logit(rz), logit(exp), 0, staticData.teamTendencies?.[team]?.weights, staticData.calibration);
            const modelAmerican = toAmerican(prob);
            const c = { Player: name, Game: `${away} @ ${home}`, modelProb: prob, rzPath: rz, expPath: exp, Why: "Balanced RZ & EXP potential.", modelAmerican, american: "", actualOdds: null, EV: null };
            const hit = offersByName.get(normName(name));
            if (hit) { c.american = hit.american || ""; c.actualOdds = hit.decimal || null; if (c.actualOdds) c.EV = (prob * c.actualOdds) - 1; }
            candidates.push(c); props++;
          }
        }
      }
    }

    candidates.sort((a,b) => ((b.EV ?? -1e9) - (a.EV ?? -1e9)) || (b.modelProb - a.modelProb));
    const info = { date: date || "auto", mode: "coming-week", bookmaker, props, usingOddsApi: !oddsless && offers.length>0, cached: false, updatedAt: new Date().toISOString(), season, week, games: games.length };

    if (blob) { try { await blob.set(cacheKey, JSON.stringify({ data: candidates, meta: info, updatedAt: new Date().toISOString() }), { contentType: "application/json" }); } catch {} }
    return { statusCode: 200, body: JSON.stringify({ ok: true, season, week, games: games.length, candidates, info }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e?.message || e) }) };
  }
}
