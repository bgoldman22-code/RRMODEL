// netlify/functions/nfl-data.js
import { nflStore } from './_lib/blobs.js'

export async function handler(event) {
  try {
    const store = nflStore()
    const qs = new URL(event.rawUrl || `http://localhost${event.path}?${event.queryStringParameters ?? ''}`)
    const type = qs.searchParams.get('type') || 'schedule'
    const season = qs.searchParams.get('season') || '2025'
    const week = qs.searchParams.get('week') || '1'

    let key
    if (type === 'schedule') key = `weeks/${season}/${week}/schedule.json`
    else if (type === 'candidates') key = `weeks/${season}/${week}/candidates.json`
    else key = type

    const json = await store.getJSON(key)
    if (!json) {
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'no data' }) }
    }
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, data: json }) }
  } catch (err) {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: String(err) }) }
  }
}
