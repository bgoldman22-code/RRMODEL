// netlify/functions/nfl-td-candidates.mjs
import { nflStore } from './_lib/blobs.js'

const SEASON = 2025
const WEEK = 1

function pickStarters(players) {
  // crude starters: first RB/WR/TE per position group
  const want = ['RB', 'WR', 'TE']
  const starters = []
  for (const pos of want) {
    const p = players.find(pl => (pl.position || '').toUpperCase().startsWith(pos))
    if (p) starters.push(p)
  }
  return starters
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`
}

export async function handler() {
  try {
    const store = nflStore()
    const schedule = await store.getJSON(`weeks/${SEASON}/${WEEK}/schedule.json`)
    if (!schedule) {
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'schedule unavailable' }) }
    }

    const rows = []
    for (const g of schedule.games) {
      for (const side of ['home', 'away']) {
        const t = g[side]
        const opp = side === 'home' ? g.away : g.home
        const depth = await store.getJSON(`weeks/${SEASON}/${WEEK}/depth/${t.id}.json`)
        if (!depth?.players?.length) continue
        const starters = pickStarters(depth.players)

        for (const s of starters) {
          // dumb model seed: RB > WR > TE baseline
          const base = s.position.startsWith('RB') ? 0.36 : s.position.startsWith('WR') ? 0.28 : 0.22
          const rz = base * 0.68
          const exp = base - rz
          rows.push({
            player: s.fullName,
            team: t.abbrev,
            game: `${schedule.season} W${schedule.week} ${g.away.abbrev}@${g.home.abbrev}`,
            pos: s.position,
            modelTdPct: pct(base),
            rzPath: pct(rz),
            expPath: pct(exp),
            why: `${s.position} • starter • vs ${opp.abbrev}`
          })
        }
      }
    }

    // Write to blobs for UI
    await store.setJSON(`weeks/${SEASON}/${WEEK}/candidates.json`, { season: SEASON, week: WEEK, rows })

    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, count: rows.length, season: SEASON, week: WEEK }) }
  } catch (err) {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
