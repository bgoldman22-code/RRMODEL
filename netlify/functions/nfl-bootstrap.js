// netlify/functions/nfl-bootstrap.js
// ESM + Node >=18 (global fetch). No node-fetch import required.
import { nflStore } from './_lib/blobs.js'

const ESPN_SCOREBOARD_DATES = '20250904-20250910'
const SEASON = 2025
const WEEK = 1

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'accept': 'application/json' } })
  if (!res.ok) {
    return { ok: false, status: res.status, url }
  }
  const data = await res.json()
  return { ok: true, status: res.status, url, data }
}

function uniqueTeamIds(schedule) {
  const ids = new Set()
  schedule.games.forEach(g => {
    ids.add(g.home.id)
    ids.add(g.away.id)
  })
  return Array.from(ids)
}

export async function handler(event) {
  try {
    const store = nflStore()

    // Detect/force refresh via querystring
    const url = new URL(event.rawUrl || `http://localhost${event.path}?${event.queryStringParameters ?? ''}`)
    const doRefresh = (url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true')
    const mode = url.searchParams.get('mode') || 'auto'

    // Try known ESPN endpoints (web first then site), but we already know "site" works for dates range.
    const tried = []
    let schedule = null

    // dates window (works in preseason transition)
    for (const base of [
      'https://site.web.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=',
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates='
    ]) {
      const res = await fetchJson(base + ESPN_SCOREBOARD_DATES)
      tried.push({ url: res.url, ok: res.ok, status: res.status })
      if (res.ok) {
        const games = (res.data?.events || []).map(ev => {
          const comp = ev.competitions?.[0]
          const home = comp?.competitors?.find(c => c.homeAway === 'home')?.team
          const away = comp?.competitors?.find(c => c.homeAway === 'away')?.team
          return {
            id: ev.id,
            date: ev.date,
            home: { id: home?.id, abbrev: home?.abbreviation, displayName: home?.displayName },
            away: { id: away?.id, abbrev: away?.abbreviation, displayName: away?.displayName },
          }
        }).filter(g => g.home?.id && g.away?.id)
        schedule = { season: SEASON, week: WEEK, games }
        break
      }
    }

    if (!schedule) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Could not fetch schedule from ESPN', tried })
      }
    }

    // Write schedule to Blobs
    const scheduleKey = `weeks/${SEASON}/${WEEK}/schedule.json`
    await store.setJSON(scheduleKey, schedule)

    // Optionally refresh team rosters (we use roster endpoint since depthchart 404s preseason)
    const teamIds = uniqueTeamIds(schedule)
    const depthLog = []
    for (const id of teamIds) {
      // ESPN roster fallback
      const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster?season=${SEASON}`
      const r = await fetchJson(rosterUrl)
      depthLog.push({ url: r.url, ok: r.ok, status: r.status })
      if (r.ok) {
        // Normalize minimal structure we need
        const players = []
        for (const grp of (r.data?.athletes || [])) {
          const pos = grp?.position?.abbreviation || grp?.position?.name || 'UNK'
          for (const p of (grp?.items || [])) {
            players.push({
              id: p.id,
              fullName: p.fullName || p.displayName,
              position: pos,
              jersey: p.jersey || null,
            })
          }
        }
        await store.setJSON(`weeks/${SEASON}/${WEEK}/depth/${id}.json`, { teamId: id, season: SEASON, week: WEEK, players })
      }
    }

    // Write meta marker (helps your list check)
    await store.setJSON('meta-rosters.json', { season: SEASON, week: WEEK, seededAt: new Date().toISOString() })

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, season: SEASON, week: WEEK, games: schedule.games.length, schedule, used: { mode }, tried, depthLog })
    }
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err) })
    }
  }
}
