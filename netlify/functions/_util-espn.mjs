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

// ESPN endpoints we will try (multiple fallbacks)
export function buildScoreboardUrls({ season, week }) {
  return [
    // site.web.api (commonly used)
    `https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?season=${season}&week=${week}&seasontype=2`,
    // site.api legacy
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?season=${season}&week=${week}&seasontype=2`,
  ];
}

export function buildTeamDepthUrl({ teamId, season }) {
  return `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${teamId}/depthchart?season=${season}`;
}

// Extract simplified schedule (home/away team ids + abbreviations) from ESPN scoreboard payloads
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
        uid: home.team?.uid,
        abbrev: home.team?.abbreviation,
        displayName: home.team?.displayName,
      },
      away: {
        id: away.team?.id,
        uid: away.team?.uid,
        abbrev: away.team?.abbreviation,
        displayName: away.team?.displayName,
      },
    });
  }
  return games;
}

// Extract depth charts: QB/RB/WR/TE lists from ESPN depth chart payload
export function parseDepthChart(depthPayload) {
  const positions = depthPayload?.items ?? depthPayload?.positions ?? [];
  const out = { QB: [], RB: [], WR: [], TE: [] };
  for (const pos of positions) {
    const key = (pos.abbrev || pos.position || pos.name || "").toUpperCase();
    const targets = out[key] ? out : null;
    if (!targets) continue;
    const athletes = pos?.athletes || pos?.items || [];
    for (const a of athletes) {
      const name = a?.athlete?.displayName || a?.athlete?.fullName || a?.displayName || a?.name;
      if (name) targets[key].push(name);
    }
  }
  return out;
}
