import { getV5Store, keyForDate } from './_lib/blobs-nfl-v5.mjs'

// GET /.netlify/functions/nfl-v5-by-date?date=YYYY-MM-DD
// Returns V5 predictions for specific date

export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const date = url.searchParams.get('date')

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({ error: 'Invalid date format (use YYYY-MM-DD)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const store = getV5Store()
    const bundle = await store.get(keyForDate(date), { type: 'json' })

    if (!bundle) {
      return new Response(JSON.stringify({ error: `No predictions for ${date}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify(bundle), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // 1 hour cache for historical
        'X-Model-Version': 'v5'
      }
    })
  } catch (error) {
    console.error('Error fetching V5 by date:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
