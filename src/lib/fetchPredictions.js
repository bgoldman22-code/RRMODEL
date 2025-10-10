// src/lib/fetchPredictions.js
// Smart polling utility for predictions cache with fallback to generator

/**
 * Fetch predictions from cached endpoint (fast path)
 * Returns { status: 'ready', data } or { status: 'pending', retryAfterSeconds }
 */
export async function fetchPredictionsCached({ season, week }) {
  const url = `/.netlify/functions/nfl-predictions-cached?season=${season}&week=${week || 'current'}`;
  
  try {
    const res = await fetch(url, { 
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    // 202 = cache miss: function kicked off a refresh
    if (res.status === 202) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 3);
      const body = await res.json().catch(() => ({}));
      
      return { 
        status: 'pending', 
        retryAfterSeconds: retryAfter,
        message: body.message || 'Warming cache…'
      };
    }

    // 200 = cache hit
    if (res.ok) {
      const data = await res.json();
      return { status: 'ready', data };
    }

    // Other errors
    const errorText = await res.text().catch(() => '');
    throw new Error(`Cached endpoint ${res.status}: ${errorText}`);
    
  } catch (error) {
    console.error('[FETCH_CACHE_ERROR]', error);
    throw error;
  }
}

/**
 * Fetch predictions from generator (slow path fallback)
 */
export async function fetchPredictionsDirect({ season, games }) {
  const url = `/.netlify/functions/nfl-predictions-generate`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      season: season.toString(),
      games: games,
      refresh: true
    })
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Generator ${res.status}: ${errorText}`);
  }

  return await res.json();
}

/**
 * Load predictions with smart polling and fallback
 * 1. Try cached endpoint (fast)
 * 2. If 202 (pending), poll with exponential backoff (max 5 retries)
 * 3. If still pending after retries, fall back to direct generator
 */
export async function loadPredictionsWithPolling({ season, week, games, onProgress }) {
  let delay = 1500; // ms
  const maxRetries = 5;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fetchPredictionsCached({ season, week });
      
      if (result.status === 'ready') {
        onProgress?.({ stage: 'ready', message: 'Loaded from cache' });
        return result.data;
      }
      
      // Status is 'pending' - wait and retry
      const waitSeconds = result.retryAfterSeconds || (delay / 1000);
      onProgress?.({ 
        stage: 'polling', 
        message: result.message || `Warming cache… retry ${attempt + 1}/${maxRetries}`,
        retryIn: waitSeconds,
        attempt: attempt + 1,
        maxRetries
      });
      
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      delay = Math.min(delay * 1.5, 6000); // exponential backoff, max 6s
      
    } catch (error) {
      console.warn(`[POLLING_ATTEMPT_${attempt + 1}]`, error.message);
      
      // On last retry, fall through to fallback
      if (attempt === maxRetries - 1) {
        break;
      }
      
      // Otherwise wait and retry
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 6000);
    }
  }
  
  // Fallback to direct generator (slow path)
  console.warn('[CACHE_TIMEOUT] Falling back to direct generator');
  onProgress?.({ 
    stage: 'fallback', 
    message: 'Cache still warming, generating fresh predictions (15-20s)…' 
  });
  
  return await fetchPredictionsDirect({ season, games });
}
