/**
 * Safe Fetch Utilities - Production-Grade API Calls
 * 
 * Implements:
 * 1. Configurable timeouts
 * 2. Automatic retries with exponential backoff
 * 3. Circuit breaker pattern
 * 4. Schema validation
 * 5. Never fail the whole function - always fallback gracefully
 */

/**
 * Safe Fetch with Timeout and Retries
 * 
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options + safeFetch options
 * @returns {Promise<object>} - Response or null on failure
 */
export async function safeFetch(url, options = {}) {
  const {
    timeout = 10000, // 10 second default
    retries = 3,
    retryDelay = 1000, // Start at 1 second
    backoffMultiplier = 2,
    validateSchema = null,
    fallbackValue = null,
    ...fetchOptions
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Fetch with timeout
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Check HTTP status
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Parse JSON
      const data = await response.json();
      
      // Validate schema if provided
      if (validateSchema && !validateSchema(data)) {
        throw new Error('Response failed schema validation');
      }
      
      // Success!
      return { success: true, data, attempt: attempt + 1 };
      
    } catch (error) {
      lastError = error;
      
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = error.message.includes('fetch') || error.message.includes('network');
      const is5xx = error.message.includes('HTTP 5');
      
      console.warn(`[safeFetch] Attempt ${attempt + 1}/${retries} failed:`, {
        url: url.substring(0, 100),
        error: error.message,
        isTimeout,
        isNetworkError,
        is5xx
      });
      
      // Don't retry on 4xx errors (client errors)
      if (error.message.includes('HTTP 4')) {
        console.error(`[safeFetch] Client error, not retrying:`, error.message);
        break;
      }
      
      // Retry on timeout, network errors, or 5xx
      if (attempt < retries - 1 && (isTimeout || isNetworkError || is5xx)) {
        const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
        console.log(`[safeFetch] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  // All retries failed
  console.error(`[safeFetch] All ${retries} attempts failed for ${url}:`, lastError?.message);
  
  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    fallback: fallbackValue,
    attempt: retries
  };
}

/**
 * Safe Parallel Fetch
 * Fetches multiple URLs concurrently with individual error handling
 */
export async function safeFetchAll(urls, options = {}) {
  const promises = urls.map(url => safeFetch(url, options));
  const results = await Promise.all(promises);
  
  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);
  
  console.log(`[safeFetchAll] ${successes.length}/${urls.length} succeeded`);
  
  if (failures.length > 0) {
    console.warn(`[safeFetchAll] ${failures.length} failures:`, 
      failures.map(f => f.error).join(', '));
  }
  
  return {
    successes: successes.map(s => s.data),
    failures: failures.map(f => ({ error: f.error })),
    allSucceeded: failures.length === 0
  };
}

/**
 * Circuit Breaker
 * Prevents cascading failures by temporarily stopping requests
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
  }
  
  async execute(fn) {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceFailure > this.resetTimeout) {
        console.log('[CircuitBreaker] Transitioning to HALF_OPEN');
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker OPEN (${Math.round((this.resetTimeout - timeSinceFailure) / 1000)}s remaining)`);
      }
    }
    
    try {
      const result = await fn();
      
      // Success - reset if in HALF_OPEN
      if (this.state === 'HALF_OPEN') {
        console.log('[CircuitBreaker] Success in HALF_OPEN, resetting to CLOSED');
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      
      return result;
      
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.failureThreshold) {
        console.error(`[CircuitBreaker] Threshold reached (${this.failureCount} failures), opening circuit`);
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Rate Limiter
 * Prevents hitting API rate limits
 */
class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 10;
    this.windowMs = options.windowMs || 1000; // 1 second
    this.requests = [];
  }
  
  async throttle() {
    const now = Date.now();
    
    // Remove old requests outside window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      // Wait until oldest request exits window
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      
      if (waitTime > 0) {
        console.log(`[RateLimiter] Throttling for ${waitTime}ms`);
        await sleep(waitTime);
      }
      
      // Re-clean after wait
      this.requests = this.requests.filter(time => Date.now() - time < this.windowMs);
    }
    
    this.requests.push(Date.now());
  }
}

/**
 * Schema Validators
 */
export const schemas = {
  oddsAPI: (data) => {
    return data &&
           Array.isArray(data) &&
           data.every(game => 
             game.id &&
             game.home_team &&
             game.away_team &&
             Array.isArray(game.bookmakers)
           );
  },
  
  espnScoreboard: (data) => {
    return data &&
           data.events &&
           Array.isArray(data.events);
  },
  
  nbaStatsAPI: (data) => {
    return data &&
           data.resultSets &&
           Array.isArray(data.resultSets) &&
           data.resultSets.length > 0;
  },
  
  injuries: (data) => {
    return data &&
           Array.isArray(data.injuries) &&
           data.injuries.every(inj => 
             inj.player &&
             inj.status
           );
  }
};

/**
 * API Client with All Safeguards
 */
export class SafeAPIClient {
  constructor(options = {}) {
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.rateLimiter = new RateLimiter(options.rateLimiter);
    this.defaultTimeout = options.timeout || 10000;
    this.defaultRetries = options.retries || 3;
  }
  
  async fetch(url, options = {}) {
    // Apply rate limiting
    await this.rateLimiter.throttle();
    
    // Execute through circuit breaker
    return this.circuitBreaker.execute(async () => {
      return safeFetch(url, {
        timeout: this.defaultTimeout,
        retries: this.defaultRetries,
        ...options
      });
    });
  }
  
  async fetchWithFallback(url, fallbackFn, options = {}) {
    const result = await this.fetch(url, options);
    
    if (result.success) {
      return result.data;
    }
    
    console.warn(`[SafeAPIClient] Falling back for ${url}`);
    return fallbackFn();
  }
}

/**
 * Helper: Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * USAGE EXAMPLES:
 * 
 * // Simple safe fetch
 * const result = await safeFetch('https://api.example.com/data', {
 *   timeout: 5000,
 *   retries: 3,
 *   validateSchema: schemas.oddsAPI,
 *   fallbackValue: []
 * });
 * 
 * if (result.success) {
 *   console.log('Got data:', result.data);
 * } else {
 *   console.warn('Using fallback:', result.fallback);
 * }
 * 
 * // API client with circuit breaker + rate limiter
 * const client = new SafeAPIClient({
 *   timeout: 10000,
 *   retries: 3,
 *   circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 },
 *   rateLimiter: { maxRequests: 10, windowMs: 1000 }
 * });
 * 
 * const data = await client.fetchWithFallback(
 *   'https://api.example.com/odds',
 *   () => ({ fallback: true, odds: [] }), // Fallback function
 *   { validateSchema: schemas.oddsAPI }
 * );
 */
