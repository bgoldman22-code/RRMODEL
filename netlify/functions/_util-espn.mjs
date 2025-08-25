// _util-espn.mjs
// Lightweight ESPN helpers for schedule, weeks, teams, depth charts.

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

export async function getJSON(url) {
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.json();
}

// Infer the NFL season year for a given date in America/New_York.
// The regular season typically starts early September; if before March we still use the same year.
export function inferSeasonYear(now = new Date()) {
  const nyNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const y = nyNow.getFullYear();
  // Preseason usually Aug; regular season Sept; postseason Jan-Feb of next calendar year.
  // If it's Jan-Jun, season year is the *same* year as the Super Bowl's season (previous calendar year).
  // E.g., Feb 2026 games are season 2025.
  const m = nyNow.getMonth() + 1;
  if (m <= 6) return y - 1;
  return y;
}

// Fetch all weeks metadata for a season (regular season = type 2)
export async function fetchWeeks(season, type = 2) {
  const url = `${ESPN_CORE}/seasons/${season}/types/${type}/weeks`;
  const j = await getJSON(url);
  const items = Array.isArray(j.items) ? j.items : [];
  // Each item is a URL to a week resource; fetch them (lightweight)
  const weeks = await Promise.all(items.map(u => getJSON(u)));
  return weeks.map(w => ({
    number: w.number,
    startDate: w.startDate,
    endDate: w.endDate,
    url: w.$ref || null
  })).sort((a,b)=>a.number-b.number);
}

// Pick the current or next week number given a list of weeks and "now".
export function pickCurrentWeek(weeks, now = new Date()) {
  const nyNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  for (const w of weeks) {
    const start = new Date(w.startDate);
    const end = new Date(w.endDate);
    if (nyNow >= start && nyNow <= end) return w.number;
  }
  // If not in any, return next upcoming
  const upcoming = weeks.find(w => new Date(w.startDate) > nyNow);
  return (upcoming && upcoming.number) || weeks[0]?.number || 1;
}

// Fetch scoreboard for a week (fewer round trips than core events)
export async function fetchScoreboardWeek(season, week, type = 2) {
  // Add dates=season to force correct season context
  const url = `${ESPN_SITE}/scoreboard?dates=${season}&seasontype=${type}&week=${week}`;
  const j = await getJSON(url);
  const evs = Array.isArray(j.events) ? j.events : [];
  const games = evs.map(ev => {
    const comp = ev.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === "home");
    const away = comp.competitors?.find(c => c.homeAway === "away");
    return {
      eventId: ev.id,
      season,
      week,
      startTime: ev.date,
      status: ev.status?.type?.name || "STATUS_SCHEDULED",
      home: home ? {
        id: home.team?.id,
        abbr: home.team?.abbreviation,
        name: home.team?.displayName
      } : null,
      away: away ? {
        id: away.team?.id,
        abbr: away.team?.abbreviation,
        name: away.team?.displayName
      } : null
    };
  }).filter(g => g.home && g.away);
  return games;
}

// Build a map of ESPN team id -> {abbr, name}
export async function fetchTeamsMap(season) {
  const url = `${ESPN_CORE}/seasons/${season}/teams?limit=1000`;
  const j = await getJSON(url);
  const items = Array.isArray(j.items) ? j.items : [];
  const teams = await Promise.all(items.map(u => getJSON(u)));
  const map = new Map();
  for (const t of teams) {
    const id = String(t.id);
    const abbr = (t.abbreviation || t.shortDisplayName || t.slug || "").toUpperCase();
    const name = t.displayName || t.name || abbr;
    map.set(id, { abbr, name });
  }
  return map;
}

// Depth charts via ESPN core API per team id
export async function fetchTeamDepthChart(season, teamId) {
  const url = `${ESPN_CORE}/seasons/${season}/teams/${teamId}/depthcharts`;
  const j = await getJSON(url);
  // The resource typically lists "items" (by position) -> each has "positions" or "athletes" refs.
  // We'll try a generic parser with defensive checks.
  const out = { QB: [], RB: [], WR: [], TE: [] };
  const items = Array.isArray(j.items) ? j.items : [];
  const posResources = await Promise.all(items.map(u => getJSON(u).catch(()=>null)));
  for (const pr of posResources) {
    if (!pr) continue;
    const posName = (pr.position?.abbreviation || pr.position?.displayName || pr.abbreviation || pr.name || "").toUpperCase();
    const key = ["QB","RB","WR","TE"].includes(posName) ? posName : null;
    // entries may be in pr.athletes, pr.items, or pr.entries depending on ESPN day
    const entries = pr.athletes || pr.items || pr.entries || [];
    let athletes = [];
    if (Array.isArray(entries)) {
      for (const e of entries) {
        const ref = e.athlete?.$ref || e.$ref || e.href || e.ref;
        if (!ref) continue;
        const aj = await getJSON(ref).catch(()=>null);
        if (!aj) continue;
        const name = aj.displayName || aj.fullName || `${aj.firstName||""} ${aj.lastName||""}`.trim();
        athletes.push(name);
      }
    }
    if (key) {
      out[key] = athletes.filter(Boolean);
    }
  }
  return out;
}

export async function fetchDepthChartsForTeams(season, teamIds) {
  const results = {};
  for (const tid of teamIds) {
    try {
      const dc = await fetchTeamDepthChart(season, tid);
      results[tid] = dc;
    } catch (e) {
      results[tid] = { QB: [], RB: [], WR: [], TE: [], __error: String(e) };
    }
  }
  return results;
}
