// netlify/functions/_lib/canonical-availability-v5.mjs
// Elite Pro-Level Canonical Availability System
// One source of truth per player-week, prevents all double-counting
// Integrates: Inactives, Injury Reports, Depth Charts, Snap Share, Market Shocks

import { getQBEPA, QB_EPA_TIERS } from './depth-chart-change-detector.js';

/**
 * Normalize timestamp to Unix milliseconds
 * Handles: Date objects, ISO strings, Unix seconds, Unix milliseconds
 */
function normalizeTimestamp(ts) {
  if (!ts) return Date.now();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (typeof ts === 'number') {
    // If looks like Unix seconds (< year 3000 in seconds), convert to ms
    return ts < 10000000000 ? ts * 1000 : ts;
  }
  return Date.now();
}

/**
 * SOURCE PRIORITY HIERARCHY
 * Higher number = higher authority (wins conflicts)
 */
export const SOURCE_PRIORITY = {
  MANUAL_OVERRIDE: 100,      // Human override (ops/manual corrections)
  INACTIVES_LIST: 90,        // Official 90-minute inactive list
  INJURY_REPORT: 70,         // ESPN/official injury reports (Wed-Fri)
  DEPTH_CHART: 60,           // Weekly depth chart snapshots
  SNAP_SHARE: 40,            // Rolling 2-3 week snap % inference
  MARKET_SHOCK: 20           // Provisional (line moves, expires if unconfirmed)
};

/**
 * STATUS WEIGHTS (probability of playing)
 * Used when status is set but prob_play not explicitly provided
 */
export const STATUS_WEIGHTS = {
  'active': 1.0,
  'questionable': 0.50,
  'doubtful': 0.25,
  'out': 0.0,
  'bench': 0.0,
  'rest': 0.0,
  'suspended': 0.0
};

/**
 * POSITION GROUP CAPS (prevent over-additivity)
 * Maximum cumulative spread impact per position group
 */
export const POSITION_CAPS = {
  QB: 12.0,      // One QB, can have massive impact (but see QB_IMPACT_CAPS for individual)
  RB: 4.5,       // RB committee effects
  WR: 4.5,       // WR room collectively
  TE: 2.5,       // TE impacts
  OL: 3.5,       // OL unit continuity
  DB: 4.0,       // Secondary collectively
  LB: 3.0,       // LB impacts
  DL: 3.0        // DL rotation
};

/**
 * QB-SPECIFIC IMPACT CAPS & ADJUSTMENTS
 * Prevents over-confident extreme projections
 */
export const QB_IMPACT_CAPS = {
  VETERAN_MAX: 12.0,           // Max impact for veteran QB change
  ROOKIE_FIRST_START_MAX: 10.0, // Max for true rookie first start
  UNPROVEN_MAX: 11.0,          // Max for QB with <8 career starts
  
  // Confidence penalties
  ROOKIE_CONFIDENCE: 0.65,      // Lower confidence for rookies
  UNPROVEN_CONFIDENCE: 0.75,    // Lower confidence for <8 starts
  
  // Market anchor adjustments (trust market more for unknowns)
  ROOKIE_MARKET_ANCHOR: 0.40,   // Heavy market weight for rookies
  UNPROVEN_MARKET_ANCHOR: 0.35, // Increased market weight for unproven
  
  // Variance/shrinkage (regression toward mean)
  ROOKIE_SHRINKAGE: 0.65,       // Shrink rookie impact 35% toward mean
  UNPROVEN_SHRINKAGE: 0.80      // Shrink unproven impact 20% toward mean
};

/**
 * TRUE ROOKIES (2025 NFL Draft Class)
 * Players making their first NFL starts
 */
export const NFL_ROOKIES_2025 = [
  // First Round
  'Shedeur Sanders',
  'Cam Ward',
  'Jaxson Dart',
  'Jalen Milroe',
  
  // Later Rounds / UDFAs
  'Spencer Rattler',
  'Tyler Shough'
];

/**
 * SECOND-YEAR QBs (2024 Draft, now experienced)
 */
export const SECOND_YEAR_QBS = [
  'Caleb Williams',      // 2024 #1 pick, played full 2024 season
  'Jayden Daniels',      // 2024 pick
  'Drake Maye',          // 2024 pick
  'Bo Nix',              // 2024 pick
  'Michael Penix Jr.'    // 2024 pick
];

/**
 * Canonical Player-Week Availability Record
 * Single source of truth - all data sources merge into this
 */
export class PlayerWeekAvailability {
  constructor(playerId, playerName, team, position, week) {
    this.playerId = playerId;
    this.playerName = playerName;
    this.team = team;
    this.position = position;
    this.week = week;
    
    // Core availability state
    this.status = 'active';              // active|out|doubtful|questionable|bench|rest|suspended
    this.reason = 'baseline';             // injury|bench|rest|suspension|provisional_market|baseline
    this.probPlay = 1.0;                  // [0,1] probability of playing
    
    // Depth & replacement
    this.depthOrder = 1;                  // Expected depth order (1=starter)
    this.replacementPlayerId = null;
    this.replacementPlayerName = null;
    
    // EPA integration (YOUR precision)
    this.playerEPA = null;
    this.replacementEPA = null;
    this.epaDelta = null;
    
    // Tracking & audit
    this.weeksOut = 0;                    // For injury decay curves
    this.confidence = 0.8;                // [0,1] confidence in this record
    this.effectiveFrom = null;            // Timestamp when this became effective
    this.sourceTrace = [];                // Audit trail of all sources
    this.topSource = null;                // Highest priority source that set state
    this.topSourcePriority = 0;
    
    // Market integration
    this.marketAnchor = 0.25;             // Default market anchor weight
    this.hasMarketShock = false;
    this.marketShockExpiry = null;
    this.marketShockStart = null;         // Track shock start for dynamic taper
    
    // Depth chart staleness
    this.depthChartTimestamp = null;
    this.isDepthChartStale = false;
    
    // PER-FIELD PRIORITY TRACKING (prevents field-level conflicts)
    this._fieldPriority = {};             // Tracks priority of each field
  }
  
  /**
   * Normalize timestamp to milliseconds
   * Handles Date objects, ISO strings, Unix seconds, Unix milliseconds
   */
  _normalizeTimestamp(timestamp) {
    return normalizeTimestamp(timestamp);
  }
  
  /**
   * Set field value with per-field precedence
   * Higher priority sources win per field, not per record
   */
  _maybeSetField(field, value, priority, timestamp, trace) {
    if (value === undefined || value === null) return;
    
    const currentPriority = this._fieldPriority[field] ?? -1;
    const currentTimestamp = this._fieldPriority[`${field}_ts`] ?? 0;
    const ts = this._normalizeTimestamp(timestamp);
    
    // Special guard: prevent lower-priority sources from bumping probPlay above 0
    // when it was hard-set to 0 by higher-priority source (bench/out/suspended)
    if (field === 'probPlay' && this.probPlay === 0 && value > 0 && priority < currentPriority) {
      return; // Block attempt to raise probPlay from 0 by lower-priority source
    }
    
    // Higher priority wins, or same priority but newer timestamp
    const shouldUpdate = priority > currentPriority || 
                         (priority === currentPriority && ts > currentTimestamp);
    
    if (shouldUpdate) {
      this[field] = value;
      this._fieldPriority[field] = priority;
      this._fieldPriority[`${field}_ts`] = ts;
      trace.fieldsChanged.push(field);
    }
  }
  
  /**
   * Merge a data source into this availability record
   * Uses PER-FIELD precedence (not all-or-nothing record override)
   * This allows injury reports to set status while depth charts provide replacement
   * @param {object} source - The source data to merge
   * @param {number} priority - Source priority level
   * @param {number} timestamp - Source timestamp
   * @param {number} now - Current time for staleness calculations
   */
  mergeSource(source, priority, timestamp, now = Date.now()) {
    const ts = this._normalizeTimestamp(timestamp);
    const trace = {
      source: source.type,
      priority,
      timestamp: ts,
      fieldsChanged: []
    };
    
    // PER-FIELD MERGE with individual precedence
    this._maybeSetField('status', source.status, priority, ts, trace);
    this._maybeSetField('reason', source.reason, priority, ts, trace);
    this._maybeSetField('depthOrder', source.depthOrder, priority, ts, trace);
    this._maybeSetField('replacementPlayerId', source.replacementPlayerId, priority, ts, trace);
    this._maybeSetField('replacementPlayerName', source.replacementPlayerName, priority, ts, trace);
    this._maybeSetField('confidence', source.confidence, priority, ts, trace);
    this._maybeSetField('weeksOut', source.weeksOut, priority, ts, trace);
    
    // probPlay: prefer explicit value, else derive from status
    // HARD-SET bench/out/suspended to 0 to ensure full impact calculation
    if (source.status === 'bench' || source.status === 'out' || source.status === 'suspended') {
      this._maybeSetField('probPlay', 0, priority, ts, trace);
    } else if (source.probPlay !== undefined && source.probPlay !== null) {
      this._maybeSetField('probPlay', source.probPlay, priority, ts, trace);
    } else if (source.status && (this._fieldPriority['probPlay'] ?? -1) < priority) {
      const derivedProbPlay = STATUS_WEIGHTS[source.status] ?? this.probPlay;
      this._maybeSetField('probPlay', derivedProbPlay, priority, ts, trace);
    }
    
    // Track highest priority source that touched ANY field
    if (trace.fieldsChanged.length > 0 && priority > this.topSourcePriority) {
      this.topSource = source.type;
      this.topSourcePriority = priority;
      this.effectiveFrom = ts;
    }
    
    // MARKET SHOCK: Provisional adjustment (doesn't override higher-priority fields)
    if (source.type === 'MARKET_SHOCK') {
      this.hasMarketShock = true;
      this.marketShockStart = ts; // Track start time for dynamic taper
      
      // Default TTL: 3 hours if not provided
      this.marketShockExpiry = source.expiryTime || (ts + 3 * 60 * 60 * 1000);
      
      const statusPriority = this._fieldPriority['status'] ?? -1;
      
      // Only apply provisional shading if no higher-priority source set status
      if (this.status === 'active' && statusPriority <= SOURCE_PRIORITY.MARKET_SHOCK) {
        this.status = 'questionable';
        this.reason = 'provisional_market';
        this.probPlay = Math.min(this.probPlay, source.probPlay ?? 0.35);
        this.confidence = Math.min(this.confidence, 0.6);
        trace.fieldsChanged.push('provisional_market_adjustment');
      }
    }
    
    // DEPTH CHART: Track timestamp for staleness
    if (source.type === 'DEPTH_CHART') {
      this.depthChartTimestamp = ts;
      const ageHours = (now - ts) / (1000 * 60 * 60);
      this.isDepthChartStale = ageHours > 48;
    }
    
    // Add to audit trail
    if (trace.fieldsChanged.length > 0) {
      this.sourceTrace.push(trace);
    }
  }
  
  /**
   * Calculate dynamic market anchor based on current state
   * Higher anchor when only provisional evidence exists
   * Uses hasMarketShock flag + field priorities (not just topSource)
   * Includes gradual taper during market shock TTL to avoid hard flips
   */
  calculateMarketAnchor(now) {
    // Check if market shock is active and not expired
    if (this.hasMarketShock && !this.isMarketShockExpired(now)) {
      const statusPriority = this._fieldPriority['status'] ?? -1;
      
      // Calculate time remaining in TTL for gradual taper
      // Use actual duration (supports custom TTLs, not just 3-hour default)
      const timeRemaining = this.marketShockExpiry - now;
      const totalDuration = this.marketShockStart 
        ? (this.marketShockExpiry - this.marketShockStart)
        : (3 * 60 * 60 * 1000); // Fallback to 3h if start not tracked
      const taperFactor = Math.max(0, Math.min(1, timeRemaining / totalDuration));
      
      // If status was SET BY market shock, high market weight with taper
      if (statusPriority === SOURCE_PRIORITY.MARKET_SHOCK) {
        const baseAnchor = 0.6;
        const minAnchor = 0.25;
        return minAnchor + (baseAnchor - minAnchor) * taperFactor; // Taper 0.6 → 0.25
      }
      
      // If depth chart is stale WITH market shock, elevated anchor with taper
      if (this.isDepthChartStale) {
        const baseAnchor = 0.45;
        const minAnchor = 0.25;
        return minAnchor + (baseAnchor - minAnchor) * taperFactor; // Taper 0.45 → 0.25
      }
      
      // Market shock present but not dominant, moderate taper
      const baseAnchor = 0.35;
      const minAnchor = 0.25;
      return minAnchor + (baseAnchor - minAnchor) * taperFactor; // Taper 0.35 → 0.25
    }
    
    // If official inactives or injury report confirmed, trust model more
    if (this.topSource === 'INACTIVES_LIST' || this.topSource === 'INJURY_REPORT') {
      return 0.15; // Low market weight, trust data
    }
    
    // Default: moderate market influence
    return 0.25;
  }
  
  /**
   * Check if market shock has expired (TTL elapsed without confirmation)
   * Cooldown: disable shock flag when expired to lower marketAnchor
   */
  isMarketShockExpired(now) {
    if (!this.hasMarketShock || !this.marketShockExpiry) {
      return false;
    }
    const expired = now > this.marketShockExpiry;
    if (expired) {
      this.hasMarketShock = false; // Cooldown: clear flag on expiry
    }
    return expired;
  }
  
  /**
   * Calculate impact using EPA-based calculations (YOUR precision)
   * Called exactly ONCE per player-week after all sources merged
   */
  calculateImpact() {
    // No impact if active and healthy
    if (this.status === 'active' && this.probPlay >= 0.95 && !this.replacementPlayerId) {
      return {
        spreadImpact: 0,
        totalImpact: 0,
        epaImpact: 0,
        confidence: 0.95,
        reason: 'expected_starter_active',
        source: this.topSource,
        calculationType: 'no_adjustment'
      };
    }
    
    // QB EPA-based calculation (YOUR precision)
    if (this.position === 'QB') {
      return this._calculateQBImpact();
    }
    
    // RB/WR/TE calculations
    if (['RB', 'WR', 'TE'].includes(this.position)) {
      return this._calculateSkillPositionImpact();
    }
    
    // Fallback for other positions
    return this._calculateGenericImpact();
  }
  
  /**
   * Check if QB is a true rookie (first NFL start)
   */
  _isRookieQB(qbName) {
    return NFL_ROOKIES_2025.includes(qbName);
  }
  
  /**
   * Check if QB is unproven (< 8 career starts)
   * Uses dynamic starts-based logic if available, falls back to curated arrays
   */
  _isUnprovenQB(qbName, starts = null) {
    // Dynamic detection (preferred): if starts data available, use it
    if (starts !== null && starts !== undefined) {
      return starts < 8;
    }
    
    // Second-year QBs who played 2024 are NOT unproven
    if (SECOND_YEAR_QBS.includes(qbName)) {
      return false; // They have a full season of data
    }
    
    // True rookies are unproven
    if (this._isRookieQB(qbName)) {
      return true;
    }
    
    // Known backups with minimal starts (fallback for when starts data unavailable)
    const unprovenBackups = [
      'Cooper Rush', 'Mason Rudolph', 'Tyson Bagent', 
      'Jake Browning', 'Joshua Dobbs', 'Drew Lock',
      'Kyle Allen', 'Nick Mullens', 'Brandon Allen',
      'Tyler Shough', 'Joe Milton III'
    ];
    
    return unprovenBackups.includes(qbName);
  }
  
  /**
   * QB-specific EPA-based impact calculation with rookie/unproven adjustments
   */
  _calculateQBImpact() {
    // Track adjustments up front (before any branch uses it)
    const adjustments = {
      isRookie: false,
      isUnproven: false,
      shrinkage: 1.0,
      cap: null,
      originalImpact: null,
      unknownReplacement: false,
      unknownReplacementCap: 8.0
    };
    
    // Get EPA ratings for starter and replacement
    this.playerEPA = getQBEPA(this.playerName);
    
    if (this.replacementPlayerName) {
      this.replacementEPA = getQBEPA(this.replacementPlayerName);
    } else {
      // Unknown replacement: use backup default with confidence haircut
      this.replacementEPA = -0.12; // Default backup QB EPA
      this.confidence = Math.min(this.confidence, 0.72);
      this.marketAnchor = Math.max(this.marketAnchor, 0.35);
      adjustments.unknownReplacement = true;
      adjustments.unknownReplacementCap = 8.0; // Cap impact until replacement known
      
      if (process.env.DEBUG_AVAILABILITY) {
        console.log(`⚠️  Unknown replacement for ${this.playerName}, confidence reduced to ${this.confidence.toFixed(2)}`);
      }
    }
    
    this.epaDelta = this.replacementEPA - this.playerEPA;
    
    // Calculate impact: EPA delta * plays per game
    // Use team pace if available, else default 65 with clamp
    // TODO: Replace with actual team pace + opponent pace (seconds per play, neutral script)
    let playsPerGame = 65; // Default neutral pace
    playsPerGame = Math.max(58, Math.min(70, playsPerGame)); // Clamp to realistic range
    let rawSpreadImpact = this.epaDelta * playsPerGame;
    adjustments.originalImpact = rawSpreadImpact;
    
    // ROOKIE/UNPROVEN ADJUSTMENTS (for replacement QB)
    if (this.replacementPlayerName) {
      const isRookie = this._isRookieQB(this.replacementPlayerName);
      const isUnproven = this._isUnprovenQB(this.replacementPlayerName);
      
      if (isRookie) {
        // True rookie first start: Higher uncertainty
        adjustments.isRookie = true;
        adjustments.shrinkage = QB_IMPACT_CAPS.ROOKIE_SHRINKAGE;
        adjustments.cap = QB_IMPACT_CAPS.ROOKIE_FIRST_START_MAX;
        
        // Lower confidence and increase market anchor
        this.confidence = Math.min(this.confidence, QB_IMPACT_CAPS.ROOKIE_CONFIDENCE);
        this.marketAnchor = QB_IMPACT_CAPS.ROOKIE_MARKET_ANCHOR;
        
        // Shrink impact toward mean (regression)
        rawSpreadImpact *= adjustments.shrinkage;
        
        if (process.env.DEBUG_AVAILABILITY) {
          console.log(`🔰 Rookie QB adjustment: ${this.replacementPlayerName}`);
          console.log(`   Original impact: ${adjustments.originalImpact.toFixed(2)} → Shrunk: ${rawSpreadImpact.toFixed(2)}`);
        }
        
      } else if (isUnproven) {
        // Unproven backup: Moderate uncertainty
        adjustments.isUnproven = true;
        adjustments.shrinkage = QB_IMPACT_CAPS.UNPROVEN_SHRINKAGE;
        adjustments.cap = QB_IMPACT_CAPS.UNPROVEN_MAX;
        
        // Moderate confidence penalty
        this.confidence = Math.min(this.confidence, QB_IMPACT_CAPS.UNPROVEN_CONFIDENCE);
        this.marketAnchor = Math.max(this.marketAnchor, QB_IMPACT_CAPS.UNPROVEN_MARKET_ANCHOR);
        
        // Moderate shrinkage
        rawSpreadImpact *= adjustments.shrinkage;
        
        if (process.env.DEBUG_AVAILABILITY) {
          console.log(`⚠️  Unproven QB adjustment: ${this.replacementPlayerName}`);
          console.log(`   Original impact: ${adjustments.originalImpact.toFixed(2)} → Shrunk: ${rawSpreadImpact.toFixed(2)}`);
        }
      }
    }
    
    // Apply caps (after shrinkage)
    let cappedSpreadImpact = rawSpreadImpact;
    let cap = adjustments.cap || QB_IMPACT_CAPS.VETERAN_MAX;
    
    // Unknown replacement: use tighter cap until replacement known
    if (adjustments.unknownReplacement) {
      cap = Math.min(cap, adjustments.unknownReplacementCap);
    }
    
    if (Math.abs(rawSpreadImpact) > cap) {
      cappedSpreadImpact = Math.sign(rawSpreadImpact) * cap;
      adjustments.wasCapped = true;
      if (process.env.DEBUG_AVAILABILITY) {
        console.log(`🛡️ QB impact capped: ${rawSpreadImpact.toFixed(2)} → ${cappedSpreadImpact.toFixed(2)}`);
      }
    }
    
    // Apply weeks-out decay (exponential decay for longer injuries ONLY)
    // QB tau = 4 weeks (slower decay for QBs)
    // Only decay injuries, not benchings/rest/suspension
    // MAX_DECAY_WEEKS = 12 to prevent underflow for long absences
    let decayedSpreadImpact = cappedSpreadImpact;
    const MAX_DECAY_WEEKS = 12;
    if (this.weeksOut > 0 && this.reason === 'injury') {
      const qbTau = 4.0;
      const clampedWeeksOut = Math.min(this.weeksOut, MAX_DECAY_WEEKS);
      const decay = Math.exp(-clampedWeeksOut / qbTau);
      decayedSpreadImpact = cappedSpreadImpact * decay;
      adjustments.decay = decay;
      adjustments.weeksOut = this.weeksOut;
      adjustments.clampedWeeksOut = clampedWeeksOut;
      
      if (process.env.DEBUG_AVAILABILITY) {
        console.log(`📉 Weeks-out decay (injury): ${this.weeksOut} weeks (clamped: ${clampedWeeksOut}), decay factor ${decay.toFixed(3)}`);
        console.log(`   ${cappedSpreadImpact.toFixed(2)} → ${decayedSpreadImpact.toFixed(2)}`);
      }
    }
    
    // Adjust by probability of starter missing
    const finalSpreadImpact = decayedSpreadImpact * (1 - this.probPlay);
    
    // Total moves ~30% as much as spread for QB changes
    const totalImpact = finalSpreadImpact * 0.3;
    
    return {
      spreadImpact: finalSpreadImpact,
      totalImpact: totalImpact,
      epaImpact: this.epaDelta,
      playerEPA: this.playerEPA,
      replacementEPA: this.replacementEPA,
      confidence: this.confidence,
      reason: this._getImpactReason(),
      source: this.topSource,
      calculationType: 'qb_epa_based',
      probPlay: this.probPlay,
      adjustments: adjustments,  // Include adjustment details
      marketAnchor: this.marketAnchor // Include adjusted market anchor
    };
  }
  
  /**
   * Skill position (RB/WR/TE) impact calculation
   */
  _calculateSkillPositionImpact() {
    // Position-specific baseline impacts
    const baselineImpacts = {
      RB: -1.8,  // RB1 vs RB2
      WR: -2.2,  // WR1 vs WR2
      TE: -1.1   // TE1 vs TE2
    };
    
    const baseImpact = baselineImpacts[this.position] || -1.5;
    
    // Depth multiplier (deeper = less impact)
    const depthMultipliers = {
      1: 1.0,   // Starter
      2: 0.4,   // Key backup
      3: 0.15   // Third string
    };
    
    const depthMultiplier = depthMultipliers[this.depthOrder] || 0.1;
    
    // Status multiplier
    const statusMultipliers = {
      'out': 1.0,
      'doubtful': 0.7,
      'questionable': 0.3,
      'bench': 1.0
    };
    
    const statusMultiplier = statusMultipliers[this.status] || 0.5;
    
    let spreadImpact = baseImpact * depthMultiplier * statusMultiplier;
    
    // Apply weeks-out decay (faster decay for skill positions)
    // Skill position tau = 2 weeks (faster decay than QBs)
    // Only decay injuries, not benchings/rest/suspension
    if (this.weeksOut > 0 && this.reason === 'injury') {
      const skillTau = 2.0;
      const decay = Math.exp(-this.weeksOut / skillTau);
      spreadImpact *= decay;
    }
    
    const totalImpact = spreadImpact * 0.25; // Smaller total impact for non-QBs
    
    return {
      spreadImpact,
      totalImpact,
      epaImpact: spreadImpact / 20, // Rough EPA conversion
      confidence: this.confidence,
      reason: this._getImpactReason(),
      source: this.topSource,
      calculationType: 'skill_position_baseline',
      probPlay: this.probPlay
    };
  }
  
  /**
   * Generic impact for other positions
   */
  _calculateGenericImpact() {
    const baseImpact = -1.0;
    const spreadImpact = baseImpact * (1 - this.probPlay);
    
    return {
      spreadImpact,
      totalImpact: spreadImpact * 0.2,
      epaImpact: 0,
      confidence: this.confidence * 0.7, // Lower confidence for generic
      reason: this._getImpactReason(),
      source: this.topSource,
      calculationType: 'generic_fallback',
      probPlay: this.probPlay
    };
  }
  
  /**
   * Get human-readable reason for impact
   */
  _getImpactReason() {
    // Return from injury: active now but was injured recently
    if (this.status === 'active' && this.weeksOut > 0 && this.reason === 'injury') {
      return 'return_from_injury';
    }
    if (this.status === 'out') {
      return this.reason === 'injury' ? 'injury_out' : 'benched_out';
    }
    if (this.status === 'bench') {
      return 'performance_benching';
    }
    if (this.status === 'doubtful') {
      return 'likely_inactive';
    }
    if (this.status === 'questionable') {
      return this.reason === 'provisional_market' ? 'market_shock_provisional' : 'game_time_decision';
    }
    return 'availability_concern';
  }
  
  /**
   * Convert to format compatible with existing injury system
   */
  toInjuryReportFormat() {
    return {
      playerName: this.playerName,
      position: this.position,
      status: this.status,
      reason: this.reason,
      depthOrder: this.depthOrder,
      weeksOut: this.weeksOut,
      confidence: this.confidence,
      source: this.topSource
    };
  }
}

/**
 * Build canonical availability from multiple sources
 * This is the main integration point
 */
export function buildCanonicalAvailability(
  playerId,
  playerName,
  team,
  position,
  week,
  sources,
  now = Date.now()
) {
  const avail = new PlayerWeekAvailability(playerId, playerName, team, position, week);
  
  // Sort sources by priority (highest first)
  const sortedSources = sources
    .filter(s => s && s.type) // Filter out null/invalid sources
    .sort((a, b) => {
      const aPri = SOURCE_PRIORITY[a.type] || 0;
      const bPri = SOURCE_PRIORITY[b.type] || 0;
      return bPri - aPri;
    });
  
  // Check if market shock has expired
  const validSources = sortedSources.filter(s => {
    if (s.type === 'MARKET_SHOCK' && s.expiryTime && now > s.expiryTime) {
      return false; // Expired market shock, discard
    }
    return true;
  });
  
  // Merge all valid sources
  for (const source of validSources) {
    const priority = SOURCE_PRIORITY[source.type];
    avail.mergeSource(source, priority, source.timestamp || now, now);
  }
  
  // Calculate dynamic market anchor and clamp to [0,1]
  avail.marketAnchor = Math.max(0, Math.min(1, avail.calculateMarketAnchor(now)));
  
  return avail;
}

/**
 * Apply position caps to prevent over-additivity
 * Uses two-sided caps (harmful/helpful split) to avoid shrinking upgrades
 */
export function applyPositionCaps(teamAdjustments) {
  const byPosition = {};
  
  // Group by position
  for (const adj of teamAdjustments) {
    const pos = adj.position;
    if (!byPosition[pos]) {
      byPosition[pos] = [];
    }
    byPosition[pos].push(adj);
  }
  
  // Apply caps per position
  const capped = [];
  for (const [pos, adjustments] of Object.entries(byPosition)) {
    const cap = POSITION_CAPS[pos] || 5.0;
    
    // Split by sign: harmful (negative) vs helpful (positive)
    const harmful = adjustments.filter(a => a.impact.spreadImpact < 0);
    const helpful = adjustments.filter(a => a.impact.spreadImpact > 0);
    
    // Calculate magnitudes for each side
    const harmfulMagnitude = harmful.reduce((sum, adj) => sum + Math.abs(adj.impact.spreadImpact), 0);
    const helpfulMagnitude = helpful.reduce((sum, adj) => sum + Math.abs(adj.impact.spreadImpact), 0);
    
    // Initial budget: split cap 50/50 between harmful and helpful
    let harmfulBudget = cap / 2;
    let helpfulBudget = cap / 2;
    
    // Reallocate unused budget: if one side uses less, give leftover to other side
    if (harmfulMagnitude < harmfulBudget && helpfulMagnitude > helpfulBudget) {
      const leftover = harmfulBudget - harmfulMagnitude;
      helpfulBudget += leftover;
      if (process.env.DEBUG_AVAILABILITY) {
        console.log(`🔄 Position cap reallocation (${pos}): harmful leftover ${leftover.toFixed(2)} → helpful`);
      }
    } else if (helpfulMagnitude < helpfulBudget && harmfulMagnitude > harmfulBudget) {
      const leftover = helpfulBudget - helpfulMagnitude;
      harmfulBudget += leftover;
      if (process.env.DEBUG_AVAILABILITY) {
        console.log(`🔄 Position cap reallocation (${pos}): helpful leftover ${leftover.toFixed(2)} → harmful`);
      }
    }
    
    // Scale harmful side if over budget
    if (harmfulMagnitude > harmfulBudget) {
      const scaleFactor = harmfulBudget / harmfulMagnitude;
      if (process.env.DEBUG_AVAILABILITY) {
        console.log(`🛡️ Position cap (${pos}, harmful): ${harmfulMagnitude.toFixed(2)} → ${harmfulBudget.toFixed(2)}, scale ${scaleFactor.toFixed(3)}`);
      }
      
      for (const adj of harmful) {
        const originalSpread = adj.impact.spreadImpact;
        const originalTotal = adj.impact.totalImpact;
        const originalRatio = originalTotal / originalSpread;
        
        adj.impact.spreadImpact = originalSpread * scaleFactor;
        adj.impact.totalImpact = adj.impact.spreadImpact * originalRatio;
        adj.impact.wasCapped = true;
        adj.impact.capScaleFactor = scaleFactor;
        adj.impact.capSide = 'harmful';
        adj.impact.originalSpreadImpact = originalSpread;
        adj.impact.originalTotalImpact = originalTotal;
      }
    }
    
    // Scale helpful side if over budget
    if (helpfulMagnitude > helpfulBudget) {
      const scaleFactor = helpfulBudget / helpfulMagnitude;
      if (process.env.DEBUG_AVAILABILITY) {
        console.log(`🛡️ Position cap (${pos}, helpful): ${helpfulMagnitude.toFixed(2)} → ${helpfulBudget.toFixed(2)}, scale ${scaleFactor.toFixed(3)}`);
      }
      
      for (const adj of helpful) {
        const originalSpread = adj.impact.spreadImpact;
        const originalTotal = adj.impact.totalImpact;
        const originalRatio = originalTotal / originalSpread;
        
        adj.impact.spreadImpact = originalSpread * scaleFactor;
        adj.impact.totalImpact = adj.impact.spreadImpact * originalRatio;
        adj.impact.wasCapped = true;
        adj.impact.capScaleFactor = scaleFactor;
        adj.impact.capSide = 'helpful';
        adj.impact.originalSpreadImpact = originalSpread;
        adj.impact.originalTotalImpact = originalTotal;
      }
    }
    
    capped.push(...harmful, ...helpful);
  }
  
  return capped;
}

export default {
  PlayerWeekAvailability,
  buildCanonicalAvailability,
  applyPositionCaps,
  SOURCE_PRIORITY,
  STATUS_WEIGHTS,
  POSITION_CAPS,
  QB_IMPACT_CAPS,
  NFL_ROOKIES_2025,
  SECOND_YEAR_QBS
};
