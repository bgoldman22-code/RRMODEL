/**
 * 🛡️ NFL Safe Fetch Wrapper
 * Comprehensive error handling to prevent 502 bubbling to UI
 * 
 * FIXES:
 * 1. Timeout guards on all upstream calls (12s default, configurable)
 * 2. HTML/JSON detection with proper error normalization
 * 3. Never bubbles raw 5xx errors - always returns JSON
 * 4. Detailed logging for debugging without exposing internals
 */

// Configuration
const DEFAULT_TIMEOUT = 12000; // 12 seconds (Netlify Edge = 10-26s)
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 2000]; // 1s, 2s

/**
 * Promise race with timeout guard
 */
function withTimeout(promise, ms = DEFAULT_TIMEOUT, label = 'fetch') {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`TIMEOUT_${ms}ms_${label}`)), ms)
    )
  ]);
}

/**
 * Safe fetch with comprehensive error handling
 * 
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} options.timeout - Timeout in ms (default 12000)
 * @param {number} options.retries - Retry attempts (default 2)
 * @param {string} options.label - Label for logging
 * @returns {Promise<any>} - Parsed response or null on failure
 */
export async function safeFetch(url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRIES,
    label = 'unknown',
    ...fetchOptions
  } = options;
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`🌐 [FETCH] ${label}: ${url} (attempt ${attempt + 1}/${retries + 1})`);
      
      // Wrap fetch in timeout
      const response = await withTimeout(
        fetch(url, {
          ...fetchOptions,
          redirect: 'follow',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            ...fetchOptions.headers
          }
        }),
        timeout,
        label
      );
      
      // Check HTTP status
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let errorBody = '';
        
        try {
          // Try to extract error body (limit to 500 chars)
          if (contentType.includes('json')) {
            const json = await response.json();
            errorBody = JSON.stringify(json).slice(0, 500);
          } else {
            errorBody = await response.text().slice(0, 500);
          }
        } catch (e) {
          errorBody = '<unable to read error body>';
        }
        
        const error = new Error(
          `UPSTREAM_${response.status}_${response.statusText}_${label}`
        );
        error.status = response.status;
        error.statusText = response.statusText;
        error.body = errorBody;
        error.url = url;
        
        throw error;
      }
      
      // Detect content type and parse accordingly
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('json')) {
        const data = await response.json();
        console.log(`✅ [FETCH] ${label}: Success (JSON, ${JSON.stringify(data).length} bytes)`);
        return data;
      } else if (contentType.includes('text') || contentType.includes('html')) {
        const text = await response.text();
        console.log(`✅ [FETCH] ${label}: Success (text, ${text.length} bytes)`);
        
        // Try to parse as JSON anyway (some APIs lie about content-type)
        try {
          return JSON.parse(text);
        } catch (e) {
          // Return as text if not JSON
          return text;
        }
      } else {
        // Unknown content type - try JSON first, then text
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          return text;
        }
      }
      
    } catch (error) {
      lastError = error;
      console.error(`❌ [FETCH] ${label} (attempt ${attempt + 1}): ${error.message}`);
      
      // Don't retry on certain errors
      if (error.status === 404 || error.status === 403 || error.status === 401) {
        console.log(`⏭️  [FETCH] ${label}: Not retrying (${error.status})`);
        break;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(`⏳ [FETCH] ${label}: Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries exhausted - return normalized error
  console.error(`💀 [FETCH] ${label}: All retries exhausted`);
  return null;
}

/**
 * Normalize upstream errors to safe JSON response
 * Use this in catch blocks to ensure consistent error format
 */
export function normalizeError(error, context = 'unknown') {
  const errorInfo = {
    ok: false,
    error: 'GENERATOR_ERROR',
    message: 'Data source temporarily unavailable',
    context,
    timestamp: new Date().toISOString()
  };
  
  // Add safe error details (don't expose internals)
  if (error) {
    if (error.message?.includes('TIMEOUT')) {
      errorInfo.error = 'TIMEOUT';
      errorInfo.message = 'Request timed out - data source too slow';
    } else if (error.message?.includes('UPSTREAM_5')) {
      errorInfo.error = 'UPSTREAM_ERROR';
      errorInfo.message = 'Data source returned server error';
      errorInfo.status = error.status;
    } else if (error.message?.includes('UPSTREAM_4')) {
      errorInfo.error = 'UPSTREAM_NOT_FOUND';
      errorInfo.message = 'Data not available from source';
      errorInfo.status = error.status;
    } else {
      errorInfo.error = 'UNKNOWN_ERROR';
      errorInfo.message = 'Unexpected error occurred';
    }
    
    // Add debug info (first 100 chars of error message)
    errorInfo.detail = String(error.message || error).slice(0, 100);
  }
  
  return errorInfo;
}

/**
 * Create safe Response object that always returns JSON
 * Use this as final return in Netlify functions
 */
export function safeResponse(data, status = 200) {
  // Ensure data is always JSON-serializable
  let safeData = data;
  
  if (data === null || data === undefined) {
    safeData = {
      ok: false,
      error: 'NO_DATA',
      message: 'No data available',
      timestamp: new Date().toISOString()
    };
    status = 500;
  }
  
  // If data is already an error object (from normalizeError), use 502
  if (typeof data === 'object' && data.ok === false && data.error) {
    status = 502;
  }
  
  return new Response(
    JSON.stringify(safeData),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'X-Generator-Version': 'v4.2-safe-fetch'
      }
    }
  );
}

/**
 * Wrap entire generator function in comprehensive error handling
 * Use this as the outermost wrapper in handler
 */
export function wrapGenerator(generatorFn) {
  return async (...args) => {
    try {
      console.log('🚀 [GENERATOR] Starting...');
      const startTime = Date.now();
      
      const result = await generatorFn(...args);
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ [GENERATOR] Success in ${elapsed}ms`);
      
      return safeResponse(result, 200);
      
    } catch (error) {
      console.error('💥 [GENERATOR] Fatal error:', error);
      console.error(error.stack);
      
      const normalizedError = normalizeError(error, 'generator');
      return safeResponse(normalizedError, 502);
    }
  };
}

/**
 * Safe snapshot writer - never throws
 * Wraps CSV snapshot in try/catch to preserve main result
 */
export async function safeWriteSnapshot(snapshotFn, ...args) {
  try {
    console.log('💾 [SNAPSHOT] Writing...');
    await snapshotFn(...args);
    console.log('✅ [SNAPSHOT] Success');
  } catch (error) {
    console.error('⚠️  [SNAPSHOT] Failed (non-fatal):', error.message);
    // Don't throw - snapshot failure shouldn't break predictions
  }
}

/**
 * Parallel fetch with timeout
 * Fetches multiple URLs concurrently with timeout protection
 */
export async function parallelFetch(urls, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    label = 'parallel',
    continueOnError = true
  } = options;
  
  console.log(`🔀 [PARALLEL] Fetching ${urls.length} URLs...`);
  
  const results = await Promise.all(
    urls.map(async (url, index) => {
      try {
        return await safeFetch(url, {
          ...options,
          label: `${label}_${index}`,
          timeout
        });
      } catch (error) {
        if (continueOnError) {
          console.warn(`⚠️  [PARALLEL] URL ${index} failed:`, error.message);
          return null;
        } else {
          throw error;
        }
      }
    })
  );
  
  const successful = results.filter(r => r !== null).length;
  console.log(`✅ [PARALLEL] ${successful}/${urls.length} successful`);
  
  return results;
}

/**
 * Circuit breaker pattern
 * Prevents cascading failures by failing fast after threshold
 */
class CircuitBreaker {
  constructor(threshold = 5, resetTime = 60000) {
    this.failures = 0;
    this.threshold = threshold;
    this.resetTime = resetTime;
    this.state = 'closed'; // closed, open, half-open
    this.nextAttempt = 0;
  }
  
  async execute(fn, label = 'circuit') {
    // Check if circuit is open
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`CIRCUIT_OPEN_${label}`);
      } else {
        this.state = 'half-open';
        console.log(`🔌 [CIRCUIT] ${label}: Half-open (testing)...`);
      }
    }
    
    try {
      const result = await fn();
      
      // Success - reset circuit
      if (this.state === 'half-open') {
        console.log(`✅ [CIRCUIT] ${label}: Closed (recovered)`);
        this.state = 'closed';
        this.failures = 0;
      }
      
      return result;
      
    } catch (error) {
      this.failures++;
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        this.nextAttempt = Date.now() + this.resetTime;
        console.error(`⛔ [CIRCUIT] ${label}: OPEN (${this.failures} failures, retry in ${this.resetTime}ms)`);
      }
      
      throw error;
    }
  }
}

// Global circuit breakers for common services
export const circuitBreakers = {
  oddsAPI: new CircuitBreaker(3, 30000), // 3 failures, 30s reset
  epaAPI: new CircuitBreaker(3, 30000),
  rPipeline: new CircuitBreaker(2, 60000) // R is critical, 2 failures, 60s reset
};

export default {
  safeFetch,
  normalizeError,
  safeResponse,
  wrapGenerator,
  safeWriteSnapshot,
  parallelFetch,
  circuitBreakers,
  CircuitBreaker
};
