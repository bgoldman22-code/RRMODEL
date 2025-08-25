// netlify/functions/_util-espn.mjs
export async function fetchJSON(url, desc = "fetch") {
  const meta = { url, desc };
  try {
    const res = await fetch(url, { headers: { "accept": "application/json" } });
    meta.status = res.status;
    meta.statusText = res.statusText;
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, meta };
    }
    const data = await res.json();
    return { ok: true, data, meta };
  } catch (e) {
    return { ok: false, error: String(e), meta };
  }
}

// ESPN endpoints
export function buildScoreboardByWeek({ season, week }) {
  return [
    `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?season=${season}&week=${week}&seasontype=2`,
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?season=${season}&week=${week}&seasontype=2`,
  ];
}

export function buildScoreboardByDates({ start, end }) {
  // accepts YYYYMMDD or YYYY-MM-DD
  const range = end ? `${start}-${end}` : start;
  return [
    `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${range}`,
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${range}`,
  ];
}

export function calendarUrl(season) {
  // ESPN NFL calendar (core api)
  return `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/calendar?season=${season}`;
}

export function parseSchedule(scoreboard) {
  const events = scoreboard?.events ?? [];
  const games = [];
  for (const ev of events) {
    const comps = ev?.competitions?.[0]?.competitors ?? [];
    const home = comps.find(c => c.homeAway === "home");
    const away = comps.find(c => c.homeAway === "away");
    if (!home || !away) continue;
    games.push({
      id: ev.id,
      date: ev.date,
      home: {
        id: home.team?.id,
        abbrev: home.team?.abbreviation,
        displayName: home.team?.displayName,
      },
      away: {
        id: away.team?.id,
        abbrev: away.team?.abbreviation,
        displayName: away.team?.displayName,
      },
    });
  }
  return games;
}

export function parseDepthChart(depthPayload) {
  const positions = depthPayload?.items ?? depthPayload?.positions ?? [];
  const out = { QB: [], RB: [], WR: [], TE: [] };
  for (const pos of positions) {
    const key = (pos.abbrev || pos.position || pos.name || "").toUpperCase();
    if (!out[key]) continue;
    const athletes = pos?.athletes || pos?.items || [];
    for (const a of athletes) {
      const name = a?.athlete?.displayName || a?.athlete?.fullName || a?.displayName || a?.name;
      if (name) out[key].push(name);
    }
  }
  return out;
}

export function buildTeamDepthUrl({ teamId, season }) {
  return `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${teamId}/depthchart?season=${season}`;
}

// helpers
export function yyyymmdd(d) {
  const pad = (n)=> String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}

export function firstNFLThursday(season) {
  // First Thursday on/after Sep 1 of given season
  const d = new Date(season, 8, 1); // months 0-based; 8=Sep
  while (d.getDay() !== 4) d.setDate(d.getDate()+1); // 4 = Thursday
  return d;
}
