/**
 * Robust HTTP fetcher with retry logic for NHL API
 * 
 * Features:
 * - Up to 3 retry attempts
 * - Exponential backoff (1s, 2s, 4s)
 * - Special 429 (rate limit) handling
 * - Honors Retry-After header
 * - Configurable fatal vs non-fatal failures
 * - Detailed error logging
 * 
 * Usage:
 *   import { fetchWithRetry } from './fetch-with-retry.mjs';
 *   
 *   const data = await fetchWithRetry('https://api.nhl.com/...', {
 *     maxRetries: 3,
 *     fatal: true
 *   });
 */

/**
 * Sleep for specified milliseconds.
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry and exponential backoff.
 * 
 * @param {string} url - URL to fetch
 * @param {Object} options
 * @param {number} options.maxRetries - Max retry attempts (default: 3)
 * @param {boolean} options.fatal - Throw on failure (default: true)
 * @param {number} options.timeoutMs - Request timeout (default: 10000)
 * @param {Object} options.fetchOptions - Additional fetch options
 * @param {string} options.label - Descriptive label for logging
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If fatal=true and all retries exhausted
 */
export async function fetchWithRetry(url, options = {}) {
  const {
    maxRetries = 3,
    fatal = true,
    timeoutMs = 10000,
    fetchOptions = {},
    label = url.split('/').slice(-2).join('/')
  } = options;
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Log attempt
      if (attempt > 0) {
        console.log(`   🔄 Retry ${attempt}/${maxRetries}: ${label}`);
      }
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      // Make request
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : Math.pow(2, attempt);
        
        console.warn(
          `⚠️  429 Rate Limited: ${label}\n` +
          `   Retry-After: ${retryAfter || 'not specified'}\n` +
          `   Waiting ${waitSeconds}s before retry ${attempt + 1}/${maxRetries}...`
        );
        
        if (attempt < maxRetries) {
          await sleep(waitSeconds * 1000);
          continue; // Retry
        } else {
          throw new Error(
            `Rate limited (429) and exhausted retries. URL: ${label}. ` +
            `This suggests we're hitting NHL API limits too hard.`
          );
        }
      }
      
      // Handle other HTTP errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read response body');
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}\n` +
          `URL: ${label}\n` +
          `Body: ${errorText.substring(0, 200)}`
        );
      }
      
      // Success - parse JSON
      const data = await response.json();
      
      // Log success on retry
      if (attempt > 0) {
        console.log(`   ✅ Success after ${attempt} retries: ${label}`);
      }
      
      return data;
      
    } catch (error) {
      lastError = error;
      
      // Handle timeout
      if (error.name === 'AbortError') {
        console.warn(`⏱️  Timeout (${timeoutMs}ms): ${label}`);
      }
      
      // If this was the last attempt, handle based on fatal flag
      if (attempt === maxRetries) {
        if (fatal) {
          console.error(
            `❌ FATAL: All retries exhausted for ${label}\n` +
            `   Error: ${error.message}\n` +
            `   Attempts: ${maxRetries + 1}\n` +
            `   URL: ${url}`
          );
          throw new Error(
            `Failed after ${maxRetries + 1} attempts: ${label}. ` +
            `Original error: ${error.message}`
          );
        } else {
          console.warn(
            `⚠️  Non-fatal failure after ${maxRetries + 1} attempts: ${label}\n` +
            `   Error: ${error.message}\n` +
            `   Returning null and continuing...`
          );
          return null;
        }
      }
      
      // Calculate exponential backoff for next retry
      const backoffSeconds = Math.pow(2, attempt); // 1s, 2s, 4s, 8s...
      console.warn(
        `⚠️  Attempt ${attempt + 1} failed: ${error.message}\n` +
        `   Waiting ${backoffSeconds}s before retry...`
      );
      await sleep(backoffSeconds * 1000);
    }
  }
  
  // Should never reach here, but handle defensively
  if (fatal) {
    throw lastError;
  }
  return null;
}

/**
 * Batch fetch multiple URLs with retry logic.
 * 
 * Useful for fetching many endpoints in sequence while respecting rate limits.
 * 
 * @param {string[]} urls - Array of URLs to fetch
 * @param {Object} options - Same options as fetchWithRetry
 * @param {Function} options.rateLimiter - Optional RateLimiter.wait() function
 * @returns {Promise<any[]>} Array of results (null for non-fatal failures)
 */
export async function batchFetchWithRetry(urls, options = {}) {
  const { rateLimiter, ...fetchOptions } = options;
  
  console.log(`📦 Batch fetching ${urls.length} URLs...`);
  
  const results = [];
  let successCount = 0;
  let failureCount = 0;
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    
    // Rate limit if provided
    if (rateLimiter) {
      await rateLimiter.wait();
    }
    
    // Fetch with retry
    try {
      const data = await fetchWithRetry(url, {
        ...fetchOptions,
        label: `[${i + 1}/${urls.length}] ${url.split('/').slice(-2).join('/')}`
      });
      
      results.push(data);
      if (data !== null) {
        successCount++;
      } else {
        failureCount++;
      }
    } catch (error) {
      // If fatal=true (default), error will propagate up
      // If fatal=false, null will be returned and we continue
      failureCount++;
      results.push(null);
    }
    
    // Progress update every 25 items
    if ((i + 1) % 25 === 0 || i === urls.length - 1) {
      console.log(
        `   Progress: ${i + 1}/${urls.length} (${successCount} ok, ${failureCount} failed)`
      );
    }
  }
  
  console.log(`✅ Batch complete: ${successCount}/${urls.length} succeeded, ${failureCount} failed`);
  
  return results;
}

/**
 * Validate that response has expected structure.
 * 
 * @param {any} data - Response data
 * @param {Object} schema - Expected structure
 * @param {string} label - Label for error messages
 * @throws {Error} If validation fails
 * 
 * Example:
 *   validateResponse(data, { players: Array, totalPlayers: Number }, 'player stats');
 */
export function validateResponse(data, schema, label) {
  if (!data) {
    throw new Error(`${label}: Response is null or undefined`);
  }
  
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in data)) {
      throw new Error(`${label}: Missing required field '${key}'`);
    }
    
    if (type === Array && !Array.isArray(data[key])) {
      throw new Error(`${label}: Field '${key}' should be an array`);
    }
    
    if (type === Number && typeof data[key] !== 'number') {
      throw new Error(`${label}: Field '${key}' should be a number`);
    }
    
    if (type === String && typeof data[key] !== 'string') {
      throw new Error(`${label}: Field '${key}' should be a string`);
    }
    
    if (type === Object && typeof data[key] !== 'object') {
      throw new Error(`${label}: Field '${key}' should be an object`);
    }
  }
}
