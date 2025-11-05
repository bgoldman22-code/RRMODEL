import { getV5Store, LATEST_KEY } from './_lib/blobs-nfl-v5.mjs'

// GET /.netlify/functions/nfl-v5-latest
// Returns latest V5 predictions bundle

export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const store = getV5Store()
    const bundle = await store.get(LATEST_KEY, { type: 'json' })

    if (!bundle) {
      return new Response(JSON.stringify({ error: 'No predictions available' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify(bundle), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 min cache
        'X-Model-Version': 'v5'
      }
    })
  } catch (error) {
    console.error('Error fetching V5 latest:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
