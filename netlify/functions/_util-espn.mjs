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

export function buildScoreboardDates(start, end) {
  const range = end ? `${start}-${end}` : start;
  return [
    `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${range}`,
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${range}`,
  ];
}

export function buildTeamDepthUrl(teamId, season) {
  return `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${teamId}/depthchart?season=${season}`;
}

export function buildTeamRosterUrl(teamId, season) {
  // stable, used widely by community
  return `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster?season=${season}`;
}

export function synthesizeDepthFromRoster(roster) {
  // roster.athletes[] with { position:{abbreviation}, fullName/displayName }
  const out = { QB: [], RB: [], WR: [], TE: [] };
  const list = roster?.athletes || roster?.items || [];
  for (const a of list) {
    const pos = (a?.position?.abbreviation || a?.position?.abbrev || "").toUpperCase();
    const name = a?.fullName || a?.displayName || a?.name;
    if (!name) continue;
    if (out[pos]) out[pos].push(name);
  }
  // trim to reasonable counts
  out.QB = out.QB.slice(0, 2);
  out.RB = out.RB.slice(0, 3);
  out.WR = out.WR.slice(0, 4);
  out.TE = out.TE.slice(0, 2);
  return out;
}

export function yyyymmdd(d) {
  const pad = (n)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}

export function firstNFLThursday(season) {
  // First Thursday on or after Sep 1
  const d = new Date(season, 8, 1);
  while (d.getDay() !== 4) d.setDate(d.getDate()+1);
  return d;
}
