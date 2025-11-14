/**
 * NHL API Rate Limiter
 * 
 * Conservative rate limiting to avoid 429s from NHL API.
 * 
 * Features:
 * - Configurable calls per second (default: 0.5 = one call every 2 seconds)
 * - Jittered delays to avoid burst patterns
 * - Global call caps per run
 * - Runtime duration caps
 * - Call tracking and reporting
 * 
 * Usage:
 *   const limiter = new RateLimiter(0.5, { maxCallsPerRun: 100, maxDurationMinutes: 15 });
 *   
 *   for (const item of items) {
 *     await limiter.wait();
 *     const data = await fetch(url);
 *   }
 *   
 *   limiter.report();
 */

export class RateLimiter {
  /**
   * @param {number} callsPerSecond - Target rate (default: 0.5 = one call every 2 seconds)
   * @param {Object} options
   * @param {boolean} options.jitter - Add randomization to delays (default: true)
   * @param {number} options.maxCallsPerRun - Global cap on total calls (default: 100)
   * @param {number} options.maxDurationMinutes - Max runtime in minutes (default: 15)
   */
  constructor(callsPerSecond = 0.5, options = {}) {
    this.callsPerSecond = callsPerSecond;
    this.minDelay = 1000 / callsPerSecond; // milliseconds between calls
    this.jitter = options.jitter !== false; // default true
    this.maxCallsPerRun = options.maxCallsPerRun || 100;
    this.maxDurationMinutes = options.maxDurationMinutes || 15;
    
    // Tracking
    this.callCount = 0;
    this.startTime = Date.now();
    this.lastCallTime = 0;
    
    console.log(`🚦 RateLimiter initialized: ${callsPerSecond} calls/sec (${this.minDelay}ms delay)`);
    console.log(`   Global caps: ${this.maxCallsPerRun} calls, ${this.maxDurationMinutes} min runtime`);
  }
  
  /**
   * Wait before making next API call.
   * Enforces rate limit, jitter, and global caps.
   * 
   * @throws {Error} If global caps exceeded
   */
  async wait() {
    // Check global caps BEFORE waiting
    this._checkGlobalCaps();
    
    const now = Date.now();
    
    // Calculate required delay
    let delay = this.minDelay;
    
    // If this isn't the first call, ensure minimum time has passed
    if (this.lastCallTime > 0) {
      const elapsed = now - this.lastCallTime;
      delay = Math.max(0, this.minDelay - elapsed);
    }
    
    // Add jitter: ±20% randomization
    if (this.jitter && delay > 0) {
      const jitterAmount = delay * 0.2;
      delay = delay + (Math.random() * 2 * jitterAmount - jitterAmount);
      delay = Math.max(0, delay);
    }
    
    // Wait if needed
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Update tracking
    this.lastCallTime = Date.now();
    this.callCount++;
  }
  
  /**
   * Check if global caps have been exceeded.
   * 
   * @throws {Error} If caps exceeded
   */
  _checkGlobalCaps() {
    // Check call count cap
    if (this.callCount >= this.maxCallsPerRun) {
      throw new Error(
        `❌ RATE LIMIT: Exceeded max calls per run (${this.maxCallsPerRun}). ` +
        `This is a safety mechanism to prevent API abuse.`
      );
    }
    
    // Check duration cap
    const elapsedMinutes = (Date.now() - this.startTime) / 1000 / 60;
    if (elapsedMinutes >= this.maxDurationMinutes) {
      throw new Error(
        `❌ RATE LIMIT: Exceeded max runtime (${this.maxDurationMinutes} min). ` +
        `Currently at ${elapsedMinutes.toFixed(1)} minutes.`
      );
    }
  }
  
  /**
   * Get current statistics.
   * 
   * @returns {Object} Stats object
   */
  getStats() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const actualRate = this.callCount / elapsedSeconds;
    
    return {
      callCount: this.callCount,
      elapsedSeconds: elapsedSeconds.toFixed(1),
      elapsedMinutes: (elapsedSeconds / 60).toFixed(2),
      targetRate: this.callsPerSecond,
      actualRate: actualRate.toFixed(2),
      remainingCalls: this.maxCallsPerRun - this.callCount,
      remainingMinutes: (this.maxDurationMinutes - elapsedSeconds / 60).toFixed(1)
    };
  }
  
  /**
   * Print summary report.
   */
  report() {
    const stats = this.getStats();
    
    console.log('\n📊 Rate Limiter Report:');
    console.log(`   Total calls: ${stats.callCount} / ${this.maxCallsPerRun}`);
    console.log(`   Elapsed time: ${stats.elapsedMinutes} min / ${this.maxDurationMinutes} min`);
    console.log(`   Target rate: ${stats.targetRate} calls/sec`);
    console.log(`   Actual rate: ${stats.actualRate} calls/sec`);
    console.log(`   Remaining capacity: ${stats.remainingCalls} calls, ${stats.remainingMinutes} min`);
  }
  
  /**
   * Check if we're approaching caps (for early warnings).
   * 
   * @param {number} threshold - Percentage threshold (e.g., 0.8 = 80%)
   * @returns {boolean} True if approaching caps
   */
  isApproachingCaps(threshold = 0.8) {
    const callsUsed = this.callCount / this.maxCallsPerRun;
    const elapsedMinutes = (Date.now() - this.startTime) / 1000 / 60;
    const timeUsed = elapsedMinutes / this.maxDurationMinutes;
    
    return callsUsed >= threshold || timeUsed >= threshold;
  }
}
