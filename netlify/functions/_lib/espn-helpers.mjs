export async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

export async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export function week1Window(season=2025) {
  // Week 1 2025 window based on known dates
  return { start: "20250904", end: "20250910" };
}

export async function getWeekSchedule({ season=2025, week=1 } = {}) {
  const { start, end } = week1Window(season);
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${start}-${end}`;
  const data = await fetchJson(url);
  const games = (data.events || []).map(ev => {
    const comp = (ev.competitions && ev.competitions[0]) || {};
    const home = (comp.competitors || []).find(c => c.homeAway === "home") || {};
    const away = (comp.competitors || []).find(c => c.homeAway === "away") || {};
    const tHome = home.team || {};
    const tAway = away.team || {};
    return {
      id: ev.id,
      date: ev.date,
      home: { id: tHome.id, abbrev: tHome.abbreviation, displayName: tHome.displayName },
      away: { id: tAway.id, abbrev: tAway.abbreviation, displayName: tAway.displayName }
    };
  });
  return { ok: true, season, week, games };
}

export async function getRoster(teamId, season=2025) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster?season=${season}`;
  const data = await fetchJson(url);
  const players = (data.athletes || []).flatMap(g => (g.items || []).map(p => ({
    id: p.id,
    fullName: p.displayName,
    position: (p.position && p.position.abbreviation) || (p.position && p.position.name) || "?",
    jersey: p.jersey || null
  })));
  return players;
}
