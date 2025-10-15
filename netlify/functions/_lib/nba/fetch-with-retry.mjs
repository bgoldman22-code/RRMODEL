/**
 * Production-Grade HTTP Client with Retry Logic
 * 
 * Features:
 * - Exponential backoff (500ms → 2s → 5s)
 * - Automatic retry on 429 (rate limit) and 5xx errors
 * - Proper NBA Stats API headers
 * - Timeout handling
 * - Detailed logging
 * 
 * Usage:
 *   const data = await fetchWithRetry('https://stats.nba.com/stats/...');
 */

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true'
};

const RETRY_DELAYS = [500, 2000, 5000]; // Exponential backoff in ms
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Main fetch function with retry logic
 * 
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options (headers, method, etc.)
 * @param {object} config - Retry configuration
 * @param {number} config.maxRetries - Maximum number of retries (default: 3)
 * @param {number} config.timeout - Request timeout in ms (default: 30000)
 * @param {boolean} config.parseJSON - Auto-parse JSON response (default: true)
 * @param {array} config.retryDelays - Custom retry delays (default: [500, 2000, 5000])
 * @returns {Promise<any>} Response data or response object
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const {
    maxRetries = 3,
    timeout = DEFAULT_TIMEOUT,
    parseJSON = true,
    retryDelays = RETRY_DELAYS
  } = config;
  
  // Merge headers
  const fetchOptions = {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {})
    }
  };
  
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Fetch] ${url} (attempt ${attempt + 1}/${maxRetries})`);
      
      const response = await fetchWithTimeout(url, fetchOptions, timeout);
      
      // Success - return parsed response
      if (response.ok) {
        console.log(`[Fetch] ✅ ${response.status} ${url}`);
        
        if (parseJSON) {
          const data = await response.json();
          return data;
        }
        
        return response;
      }
      
      // Check if we should retry
      const shouldRetry = (
        response.status === 429 ||  // Rate limit
        response.status >= 500      // Server error
      ) && attempt < maxRetries - 1;
      
      if (shouldRetry) {
        const delayMs = retryDelays[attempt] || retryDelays[retryDelays.length - 1];
        console.log(`[Fetch] ⚠️  ${response.status} ${response.statusText} - Retrying in ${delayMs}ms...`);
        await delay(delayMs);
        continue;
      }
      
      // Non-retriable error or max retries reached
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      
    } catch (error) {
      lastError = error;
      
      // Network error - retry if we have attempts left
      if (attempt < maxRetries - 1) {
        const delayMs = retryDelays[attempt] || retryDelays[retryDelays.length - 1];
        console.log(`[Fetch] ⚠️  ${error.message} - Retrying in ${delayMs}ms...`);
        await delay(delayMs);
        continue;
      }
      
      // Max retries exhausted
      console.error(`[Fetch] ❌ Failed after ${maxRetries} attempts:`, error.message);
      throw error;
    }
  }
  
  // Should never reach here, but just in case
  throw lastError || new Error('Fetch failed with unknown error');
}

/**
 * Fetch NBA Stats API endpoint
 * 
 * Pre-configured for stats.nba.com endpoints
 * 
 * @param {string} endpoint - Endpoint path (e.g., 'leaguedashteamstats')
 * @param {object} params - Query parameters
 * @param {object} config - Retry configuration (optional)
 * @returns {Promise<any>} Parsed JSON response
 */
export async function fetchNBAStats(endpoint, params = {}, config = {}) {
  const baseUrl = 'https://stats.nba.com/stats';
  const queryString = new URLSearchParams(params).toString();
  const url = `${baseUrl}/${endpoint}${queryString ? '?' + queryString : ''}`;
  
  return fetchWithRetry(url, {}, config);
}

/**
 * Rate limiter for polite API usage
 * 
 * Usage:
 *   await rateLimiter.throttle();
 *   const data = await fetchWithRetry(...);
 */
export const rateLimiter = {
  lastRequest: 0,
  minDelay: 1000, // 1 second between requests
  
  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    
    if (elapsed < this.minDelay) {
      const waitTime = this.minDelay - elapsed;
      console.log(`[RateLimit] Waiting ${waitTime}ms...`);
      await delay(waitTime);
    }
    
    this.lastRequest = Date.now();
  },
  
  setDelay(ms) {
    this.minDelay = ms;
  }
};

/**
 * Fetch with fallback to cached data
 * 
 * If fresh fetch fails, returns cached data (if available)
 * 
 * @param {string} url - URL to fetch
 * @param {string} cacheKey - Key for cached data (filename or identifier)
 * @param {function} getCachedData - Function to retrieve cached data
 * @param {object} options - Fetch options
 * @returns {Promise<{data: any, isCached: boolean}>}
 */
export async function fetchWithFallback(url, cacheKey, getCachedData, options = {}) {
  try {
    const freshData = await fetchWithRetry(url, options);
    return { data: freshData, isCached: false };
    
  } catch (error) {
    console.error(`[Fetch] Failed to get fresh data:`, error.message);
    console.log(`[Fetch] Attempting to use cached data for: ${cacheKey}`);
    
    try {
      const cachedData = await getCachedData(cacheKey);
      
      if (cachedData) {
        console.log(`[Fetch] ✅ Using cached data (stale but safe)`);
        return { data: cachedData, isCached: true };
      }
      
      console.error(`[Fetch] ❌ No cached data available for: ${cacheKey}`);
      throw new Error('Fresh fetch failed and no cached data available');
      
    } catch (cacheError) {
      console.error(`[Fetch] ❌ Failed to retrieve cached data:`, cacheError.message);
      throw error; // Throw original fetch error
    }
  }
}

export default fetchWithRetry;
