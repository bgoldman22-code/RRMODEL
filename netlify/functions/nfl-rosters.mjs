// netlify/functions/nfl-rosters.mjs
import { fetchJSON, jsonResponse, getInt } from "./_lib/http.mjs";

const SD_BASE = process.env.SPORTSDATA_API_BASE || "https://api.sportsdata.io/v3/nfl/scores/json";
const SD_KEY = process.env.SPORTSDATA_API_KEY || process.env.FANTASYDATA_API_KEY || process.env.SPORTS_DATA_KEY;

async function getSchedule({ season, week, origin }) {
  const u = `${origin}/.netlify/functions/nfl-bootstrap?season=${season}&week=${week}&debug=0`;
  try {
    const j = await fetchJSON(u, { timeoutMs: 12000 });
    if (j?.schedule?.games?.length) return j.schedule.games;
  } catch {}
  return [];
}

export default async function handler(req) {
  const url = new URL(req.url);
  const qs = url.searchParams;
  const debug = qs.get("debug") === "1";
  const season = getInt(qs, "season", 2025);
  const week = getInt(qs, "week", 1);
  const origin = process.env.URL || `${url.protocol}//${url.host}`;

  try {
    const schedule = await getSchedule({ season, week, origin });

    let used = "placeholder";
    let rosters = {};

    if (SD_KEY) {
      try {
        const dc = await fetchJSON(`${SD_BASE}/DepthCharts`, {
          headers: { "Ocp-Apim-Subscription-Key": SD_KEY },
          timeoutMs: 15000
        });

        const teamSet = new Set();
        for (const g of schedule) {
          if (g.home?.abbrev) teamSet.add(g.home.abbrev);
          if (g.away?.abbrev) teamSet.add(g.away.abbrev);
        }

        for (const item of dc || []) {
          const team = item.Team || item.TeamKey || item.TeamID || item.TeamName;
          const teamAbbr = (typeof team === "string" ? team : item.Team)?.toUpperCase?.() || null;
          if (!teamAbbr || (teamSet.size && !teamSet.has(teamAbbr))) continue;

          const positions = item.DepthChartPositions || item.Positions || [
            item.QB, item.RB, item.WR, item.TE
          ].filter(Boolean);

          const players = [];
          const pushPlayer = (p, posOverride) => {
            if (!p) return;
            const pos = (posOverride || p.Position || p.position || p.DepthChartPosition || p.Pos || "").toString().toUpperCase();
            const name = p.Name || p.PlayerName || p.FullName || p.ShortName;
            const playerId = p.PlayerID || p.PlayerId || p.Id;
            if (!name || !pos) return;
            if (!["RB", "WR", "TE", "QB"].includes(pos)) return;
            const depth = p.Depth || p.DepthOrder || p.Order || p.DepthChartOrder || 1;
            players.push({ playerId, name, pos, depth: Number(depth) || 1 });
          };

          if (Array.isArray(positions)) {
            for (const posGroup of positions) {
              if (!posGroup) continue;
              const posName = posGroup.Position || posGroup.Pos || posGroup.PositionName;
              const arrs = [
                posGroup.Players, posGroup.PlayerList, posGroup.DepthChart || [],
                posGroup.FirstTeam || [], posGroup.SecondTeam || []
              ].filter(Boolean);
              if (arrs.length) {
                for (const arr of arrs) {
                  for (const p of arr || []) pushPlayer(p, posName);
                }
              } else {
                for (const k of Object.keys(posGroup)) {
                  if (Array.isArray(posGroup[k])) {
                    for (const p of posGroup[k]) pushPlayer(p, k);
                  }
                }
              }
            }
          }

          for (const k of ["QB", "RB", "WR", "TE"]) {
            const v = item[k];
            if (Array.isArray(v)) for (const p of v) pushPlayer(p, k);
          }

          rosters[teamAbbr] = {
            team: teamAbbr,
            players
          };
        }

        used = "sportsdata-depthcharts";
      } catch (e) {
        if (debug) console.error("SportsData depth charts failed:", e);
      }
    }

    if (!Object.keys(rosters).length) {
      for (const g of schedule) {
        for (const side of ["home","away"]) {
          const t = g[side];
          if (!t?.abbrev) continue;
          rosters[t.abbrev] = {
            team: t.abbrev,
            players: [
              { playerId: `RB1-${t.abbrev}`, name: `RB1 ${t.abbrev}`, pos: "RB", depth: 1 },
              { playerId: `WR1-${t.abbrev}`, name: `WR1 ${t.abbrev}`, pos: "WR", depth: 1 },
              { playerId: `TE1-${t.abbrev}`, name: `TE1 ${t.abbrev}`, pos: "TE", depth: 1 }
            ]
          };
        }
      }
    }

    return jsonResponse({ ok: true, season, week, teams: Object.keys(rosters).length, used, rosters });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
