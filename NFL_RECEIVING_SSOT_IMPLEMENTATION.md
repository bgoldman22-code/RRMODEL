# 🏈 NFL Receiving Props - Elite Upgrade Implementation Plan

**Date:** October 18, 2025  
**Goal:** Prototype → Elite in 4-6 focused hours  
**Constraint:** Do NOT touch NFL game predictions model

---

## Phase 1: SSOT JSON Schema (30 minutes)

### **File: `data/nfl/ssot/schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NFL Receiving Props SSOT",
  "type": "object",
  "required": ["week", "generated_at", "schema_version", "players"],
  "properties": {
    "week": { "type": "integer", "minimum": 1, "maximum": 18 },
    "season": { "type": "integer" },
    "generated_at": { "type": "string", "format": "date-time" },
    "schema_version": { "type": "integer", "const": 1 },
    "metadata": {
      "type": "object",
      "properties": {
        "total_players": { "type": "integer" },
        "data_sources": { "type": "array", "items": { "type": "string" } },
        "eb_tau": { "type": "number", "description": "Empirical Bayes smoothing weight" },
        "cap_settings": {
          "type": "object",
          "properties": {
            "per_factor_max": { "type": "number", "default": 0.07 },
            "combined_min": { "type": "number", "default": 0.88 },
            "combined_max": { "type": "number", "default": 1.12 }
          }
        }
      }
    },
    "players": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["player_id", "team", "pos", "opp", "is_home", "neg_bin", "beta", "lognorm"],
        "properties": {
          "player_id": {
            "type": "string",
            "pattern": "^[A-Z]{2,3}-[A-Z0-9-]+$",
            "description": "Format: TEAM-FIRSTNAME-LASTNAME",
            "examples": ["DAL-CEEDEE-LAMB", "MIA-TYREEK-HILL"]
          },
          "gsis_id": { "type": "string", "description": "NFL GSIS ID for lookup" },
          "team": { "type": "string", "pattern": "^[A-Z]{2,3}$" },
          "pos": { "type": "string", "enum": ["WR", "TE", "RB"] },
          "opp": { "type": "string", "pattern": "^[A-Z]{2,3}$" },
          "is_home": { "type": "boolean" },
          "context": {
            "type": "object",
            "properties": {
              "spread": { "type": "number", "description": "Team spread (+ = underdog)" },
              "total": { "type": "number" },
              "wind_mph": { "type": "number", "minimum": 0 },
              "precip_prob": { "type": "number", "minimum": 0, "maximum": 1 },
              "dome": { "type": "boolean" }
            }
          },
          "neg_bin": {
            "type": "object",
            "required": ["mu", "phi"],
            "properties": {
              "mu": { "type": "number", "minimum": 0, "description": "Expected targets" },
              "phi": { "type": "number", "minimum": 0, "description": "Dispersion (0 = Poisson)" }
            }
          },
          "beta": {
            "type": "object",
            "required": ["alpha", "beta"],
            "properties": {
              "alpha": { "type": "number", "minimum": 0 },
              "beta": { "type": "number", "minimum": 0 }
            }
          },
          "lognorm": {
            "type": "object",
            "required": ["log_mu", "log_sigma"],
            "properties": {
              "log_mu": { "type": "number" },
              "log_sigma": { "type": "number", "minimum": 0 }
            }
          },
          "adot": { "type": "number", "description": "Average depth of target" },
          "mods": {
            "type": "object",
            "description": "Multiplicative adjustments (capped per factor)",
            "properties": {
              "opp": {
                "type": "object",
                "properties": {
                  "targets_pct": { "type": "number", "minimum": 0.93, "maximum": 1.07 },
                  "catch_pct": { "type": "number", "minimum": 0.93, "maximum": 1.07 },
                  "yac_pct": { "type": "number", "minimum": 0.93, "maximum": 1.07 },
                  "adot_bucket": { "type": "string", "enum": ["0-5", "6-12", "13+"] }
                }
              },
              "weather": {
                "type": "object",
                "properties": {
                  "catch_pct": { "type": "number", "minimum": 0.94, "maximum": 1.0 },
                  "cap": { "type": "number", "minimum": 0.94, "maximum": 1.0 }
                }
              },
              "injury": {
                "type": "object",
                "properties": {
                  "targets_delta": { "type": "number", "description": "+/- targets from injury redistribution" },
                  "uncertainty": { "type": "number", "minimum": 0, "maximum": 1, "description": "Variance multiplier" }
                }
              },
              "snap_pct": {
                "type": "object",
                "properties": {
                  "projected": { "type": "number", "minimum": 0, "maximum": 1 },
                  "l5_avg": { "type": "number", "minimum": 0, "maximum": 1 }
                }
              }
            }
          },
          "caps": {
            "type": "object",
            "properties": {
              "combined_min": { "type": "number", "default": 0.88 },
              "combined_max": { "type": "number", "default": 1.12 },
              "raw_multiplier": { "type": "number", "description": "Pre-cap combined adjustment" },
              "capped_multiplier": { "type": "number", "description": "Post-cap adjustment" }
            }
          },
          "source_hash": { "type": "string", "description": "Hash for change detection" }
        }
      }
    }
  }
}
```

---

## Phase 2: Scanner Glue Code (1-2 hours)

### **File: `netlify/functions/_lib/ssot-loader.mjs`**

```javascript
/**
 * SSOT Loader & Modifier Composition
 * 
 * Loads canonical JSON, applies capped multipliers, inflates variance
 * Zero leakage guarantee: only reads pre-generated SSOT
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load SSOT JSON for current week
 */
export async function loadSSOT(week, season = 2025) {
  const ssotPath = path.join(__dirname, '../../..', `data/nfl/ssot/week_${week}_${season}.json`);
  
  try {
    const data = await fs.readFile(ssotPath, 'utf8');
    const ssot = JSON.parse(data);
    
    // Validate schema version
    if (ssot.schema_version !== 1) {
      throw new Error(`Unsupported SSOT schema version: ${ssot.schema_version}`);
    }
    
    console.log(`✅ Loaded SSOT: Week ${ssot.week}, ${ssot.players.length} players, generated ${ssot.generated_at}`);
    
    return ssot;
  } catch (error) {
    console.warn(`⚠️  Could not load SSOT: ${error.message}`);
    return null;
  }
}

/**
 * Soft clip using tanh-based limiter
 * Prevents multiplier explosions while preserving gradient
 */
function softClip(value, min, max) {
  const mid = (max + min) / 2;
  const range = (max - min) / 2;
  
  // Normalize to [-1, 1] range
  const normalized = (value - mid) / range;
  
  // Apply tanh for soft saturation
  const clipped = Math.tanh(normalized);
  
  // Denormalize back to [min, max]
  return mid + clipped * range;
}

/**
 * Compose and cap multipliers
 * 
 * Order: opponent → weather → injury → snap_pct
 * Each factor capped individually, then combined cap applied
 */
export function composeModifiers(mods, caps) {
  const {
    opp = {},
    weather = {},
    injury = {},
    snap_pct = {}
  } = mods;
  
  const { combined_min = 0.88, combined_max = 1.12 } = caps;
  
  // Individual factors (already capped in SSOT generation)
  const oppFactor = {
    targets: opp.targets_pct || 1.0,
    catchRate: opp.catch_pct || 1.0,
    yac: opp.yac_pct || 1.0
  };
  
  const weatherFactor = {
    catchRate: weather.catch_pct || 1.0,
    cap: weather.cap || 1.0
  };
  
  const injuryFactor = {
    targets_delta: injury.targets_delta || 0,
    uncertainty: injury.uncertainty || 0
  };
  
  const snapFactor = snap_pct.projected || 1.0;
  
  // Compose multiplicatively
  const rawTargetsMult = oppFactor.targets * snapFactor;
  const rawCatchMult = oppFactor.catchRate * weatherFactor.catchRate;
  const rawYacMult = oppFactor.yac * weatherFactor.cap;
  
  // Apply soft clip to combined multipliers
  const targetsMult = softClip(rawTargetsMult, combined_min, combined_max);
  const catchMult = softClip(rawCatchMult, combined_min, combined_max);
  const yacMult = softClip(rawYacMult, combined_min, combined_max);
  
  return {
    targets: {
      multiplier: targetsMult,
      delta: injuryFactor.targets_delta,
      raw: rawTargetsMult
    },
    catchRate: {
      multiplier: catchMult,
      raw: rawCatchMult
    },
    yac: {
      multiplier: yacMult,
      raw: rawYacMult
    },
    uncertainty: injuryFactor.uncertainty,
    clipped: {
      targets: Math.abs(targetsMult - rawTargetsMult) > 0.001,
      catchRate: Math.abs(catchMult - rawCatchMult) > 0.001,
      yac: Math.abs(yacMult - rawYacMult) > 0.001
    }
  };
}

/**
 * Apply modifiers to SSOT parameters
 * Returns adjusted parameters ready for simulation
 */
export function applyModifiers(player, modifiers) {
  const { neg_bin, beta, lognorm } = player;
  const { targets, catchRate, yac, uncertainty } = modifiers;
  
  // Adjust target mean and add injury delta
  const adjustedMu = (neg_bin.mu * targets.multiplier) + targets.delta;
  
  // Inflate variance if injury uncertainty present
  const uncertaintyMult = 1 + uncertainty;
  const adjustedPhi = neg_bin.phi * uncertaintyMult;
  
  // Adjust catch rate parameters (scale both alpha and beta)
  const adjustedAlpha = beta.alpha * catchRate.multiplier;
  const adjustedBeta = beta.beta * catchRate.multiplier;
  
  // Adjust yards per catch (shift log mean, inflate sigma)
  const adjustedLogMu = lognorm.log_mu + Math.log(yac.multiplier);
  const adjustedLogSigma = lognorm.log_sigma * uncertaintyMult;
  
  return {
    playerId: player.player_id,
    gameDate: player.context?.game_date || new Date().toISOString(),
    
    // Targets (Negative Binomial)
    meanTargets: adjustedMu,
    kTargets: adjustedMu / adjustedPhi, // k = mu / phi
    
    // Catches (Beta-Binomial)
    alphaCatch: adjustedAlpha,
    betaCatch: adjustedBeta,
    
    // Yards per catch (Lognormal)
    yardsPerCatchMu: adjustedLogMu,
    yardsPerCatchSigma: adjustedLogSigma,
    
    // Metadata for logging
    modifiers: {
      targets_mult: targets.multiplier,
      targets_delta: targets.delta,
      catch_mult: catchRate.multiplier,
      yac_mult: yac.multiplier,
      uncertainty: uncertainty,
      clipped: modifiers.clipped
    }
  };
}

/**
 * Convert SSOT player to simulation parameters
 * Main entry point for scanner
 */
export function playerToParams(player) {
  const modifiers = composeModifiers(player.mods || {}, player.caps || {});
  return applyModifiers(player, modifiers);
}
```

---

## Phase 3: Updated Scanner (30 minutes)

### **File: `netlify/functions/nfl-receiving-scanner-ssot.mjs`**

```javascript
/**
 * NFL RECEIVING PROPS - SSOT Edition
 * 
 * Uses single-source-of-truth JSON with:
 * - Empirical Bayes smoothed priors
 * - ADOT-bucket opponent adjustments
 * - Multinomial injury redistribution
 * - Variance inflation for uncertainty
 * - Soft-clipped multipliers
 */

import fetch from 'node-fetch';
import {
  simulateReceptionsProbOver,
  simulateYardsProbOver,
  removeVig,
  kellyFraction,
  calibrateProb,
  DEFAULT_CALIBRATION,
  decimalToAmerican
} from './_lib/elite-pricing-engine.mjs';

import {
  loadSSOT,
  playerToParams
} from './_lib/ssot-loader.mjs';

const ODDS_API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
const USE_SSOT = process.env.USE_SSOT !== 'false'; // Feature flag

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    console.log('🏈 NFL RECEIVING PROPS - SSOT EDITION');
    console.log('=' .repeat(60));
    
    // Determine current week (could be passed as query param)
    const week = parseInt(event.queryStringParameters?.week) || 8;
    const season = parseInt(event.queryStringParameters?.season) || 2025;
    
    // Load SSOT
    const ssot = await loadSSOT(week, season);
    
    if (!ssot && USE_SSOT) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          success: false,
          error: `SSOT not available for Week ${week}, ${season}`,
          message: 'Run SSOT generator first: Rscript scripts/nfl-receiving-props/generate-ssot.R'
        })
      };
    }
    
    // Fallback to old PLAYER_DB if SSOT not available
    if (!ssot) {
      console.warn('⚠️  SSOT not available, falling back to hardcoded PLAYER_DB');
      // Import old scanner logic here
    }
    
    // Fetch real odds
    const realOdds = await fetchRealOdds();
    const opportunities = [];
    
    // Process each player from SSOT
    for (const player of ssot.players) {
      // Convert SSOT to simulation parameters
      const params = playerToParams(player);
      
      // Receptions props
      const recLines = [3.5, 4.5, 5.5, 6.5, 7.5];
      for (const line of recLines) {
        const modelProbRaw = simulateReceptionsProbOver(params, line);
        const modelProb = calibrateProb(modelProbRaw, DEFAULT_CALIBRATION);
        
        // Check for real odds
        const oddsKey = `${player.player_id}_${line}`;
        const realMarket = realOdds?.get(oddsKey);
        
        if (realMarket && realMarket.market === 'player_receptions') {
          const { pOver, pUnder } = removeVig(realMarket.overOdds, realMarket.underOdds);
          
          // OVER
          const edgeOver = modelProb - pOver;
          if (edgeOver >= 0.05) {
            opportunities.push({
              player: player.player_id,
              team: player.team,
              prop: 'Receptions',
              line,
              side: 'OVER',
              book: realMarket.book,
              offered_odds: realMarket.overOdds,
              market_prob_fair: pOver,
              model_prob_raw: modelProbRaw,
              model_prob: modelProb,
              edge: edgeOver,
              kelly: kellyFraction(modelProb, realMarket.overOdds),
              fair_odds_model: decimalToAmerican(1 / modelProb),
              has_real_odds: true,
              // Logging fields
              ssot_meta: {
                targets_mult: params.modifiers.targets_mult,
                catch_mult: params.modifiers.catch_mult,
                uncertainty: params.modifiers.uncertainty,
                clipped: params.modifiers.clipped
              }
            });
          }
          
          // UNDER (similar logic)
        } else if (!realOdds) {
          // Synthetic mode (same as before but with SSOT data)
        }
      }
      
      // Yards props (similar structure)
    }
    
    // Sort and return
    opportunities.sort((a, b) => b.edge - a.edge);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        generated_at: new Date().toISOString(),
        ssot_version: ssot.schema_version,
        ssot_generated: ssot.generated_at,
        total_predictions: opportunities.length,
        predictions: opportunities,
        metadata: {
          model: 'SSOT Elite (EB smoothed priors + capped multipliers)',
          week,
          season,
          data_quality: {
            eb_tau: ssot.metadata.eb_tau,
            cap_settings: ssot.metadata.cap_settings,
            total_players: ssot.players.length
          }
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
}

// Odds fetching logic same as before (using correct API keys)
```

---

## Phase 4: R SSOT Generator (2-3 hours)

### **File: `scripts/nfl-receiving-props/generate-ssot.R`**

```r
# NFL Receiving Props - SSOT Generator
# 
# Outputs: data/nfl/ssot/week_XX_2025.json
# 
# Features:
# - Empirical Bayes smoothing (season ⊕ recent)
# - ADOT-bucket opponent adjustments
# - Multinomial injury redistribution
# - Capped multipliers (per factor + combined)
# - Variance inflation for uncertainty

library(tidyverse)
library(nflfastR)
library(glue)
library(jsonlite)

# Configuration
SEASON <- 2025
WEEK <- 8
EB_TAU <- 0.35  # Empirical Bayes weight (will optimize via backtest)
CAP_PER_FACTOR <- 0.07
CAP_COMBINED_MIN <- 0.88
CAP_COMBINED_MAX <- 1.12

cat("🏈 NFL RECEIVING PROPS - SSOT GENERATOR\n")
cat(glue("Week {WEEK}, {SEASON}\n\n"))

# ============================================================================
# 1. LOAD nflfastR DATA
# ============================================================================

cat("📡 Loading play-by-play data...\n")

pbp <- load_pbp(2023:SEASON) %>%
  filter(
    season_type == "REG",
    !is.na(receiver_player_id),
    pass_attempt == 1
  )

cat(glue("✅ Loaded {nrow(pbp):,} pass plays\n\n"))

# ============================================================================
# 2. EMPIRICAL BAYES PRIORS (season + recent)
# ============================================================================

cat("📊 Calculating Empirical Bayes priors...\n")

# Season baselines (full body of work)
season_stats <- pbp %>%
  filter(season == SEASON, week < WEEK) %>%
  group_by(
    player_id = receiver_player_id,
    player_name = receiver_player_name,
    team = posteam
  ) %>%
  summarise(
    games = n_distinct(game_id),
    targets = n(),
    completions = sum(complete_pass, na.rm = TRUE),
    yards = sum(yards_gained, na.rm = TRUE),
    adot = mean(air_yards, na.rm = TRUE),
    yac_per_rec = mean(yards_after_catch[complete_pass == 1], na.rm = TRUE),
    .groups = "drop"
  ) %>%
  filter(games >= 3) %>%  # Min 3 games
  mutate(
    targets_per_game = targets / games,
    catch_rate = completions / targets,
    yards_per_rec = yards / completions
  )

# Recent form (last 5 games)
recent_stats <- pbp %>%
  filter(season == SEASON, week < WEEK) %>%
  group_by(player_id = receiver_player_id) %>%
  arrange(desc(week)) %>%
  slice_head(n = 5 * 50) %>%  # Approx 5 games worth of plays
  summarise(
    targets_l5 = n() / 5,
    catch_rate_l5 = sum(complete_pass, na.rm = TRUE) / n(),
    yards_per_rec_l5 = sum(yards_gained[complete_pass == 1]) / sum(complete_pass),
    .groups = "drop"
  )

# Empirical Bayes combination
eb_priors <- season_stats %>%
  left_join(recent_stats, by = "player_id") %>%
  mutate(
    # Posterior = (1 - τ) × season + τ × recent
    eb_targets = (1 - EB_TAU) * targets_per_game + EB_TAU * coalesce(targets_l5, targets_per_game),
    eb_catch_rate = (1 - EB_TAU) * catch_rate + EB_TAU * coalesce(catch_rate_l5, catch_rate),
    eb_ypc = (1 - EB_TAU) * yards_per_rec + EB_TAU * coalesce(yards_per_rec_l5, yards_per_rec)
  )

cat(glue("✅ Computed EB priors for {nrow(eb_priors)} players (τ = {EB_TAU})\n\n"))

# ============================================================================
# 3. OPPONENT ADJUSTMENTS (ADOT-bucket splits)
# ============================================================================

cat("🎯 Building ADOT-bucket opponent tables...\n")

opp_defense <- pbp %>%
  filter(season == SEASON, week < WEEK) %>%
  mutate(
    adot_bucket = case_when(
      air_yards <= 5 ~ "0-5",
      air_yards <= 12 ~ "6-12",
      TRUE ~ "13+"
    )
  ) %>%
  group_by(defteam, adot_bucket) %>%
  summarise(
    targets_allowed = n(),
    comp_pct = mean(complete_pass, na.rm = TRUE),
    yac_avg = mean(yards_after_catch[complete_pass == 1], na.rm = TRUE),
    .groups = "drop"
  ) %>%
  group_by(adot_bucket) %>%
  mutate(
    # Relative to league average
    targets_vs_avg = targets_allowed / mean(targets_allowed),
    comp_vs_avg = comp_pct / mean(comp_pct),
    yac_vs_avg = yac_avg / mean(yac_avg)
  ) %>%
  ungroup()

# Cap opponent effects at ±7%
opp_defense <- opp_defense %>%
  mutate(
    targets_capped = pmin(pmax(targets_vs_avg, 1 - CAP_PER_FACTOR), 1 + CAP_PER_FACTOR),
    comp_capped = pmin(pmax(comp_vs_avg, 1 - CAP_PER_FACTOR), 1 + CAP_PER_FACTOR),
    yac_capped = pmin(pmax(yac_vs_avg, 1 - CAP_PER_FACTOR), 1 + CAP_PER_FACTOR)
  )

cat(glue("✅ Built opponent defense tables ({nrow(opp_defense)} team×ADOT combinations)\n\n"))

# ============================================================================
# 4. INJURY REDISTRIBUTION (multinomial model placeholder)
# ============================================================================

cat("🏥 Injury redistribution (placeholder - will enhance)\n")

# For now: simple lookup table
# TODO: Fit multinomial model per team/coach
injury_redistribution <- tribble(
  ~team, ~injured_player, ~beneficiary, ~absorption_rate,
  "HOU", "Nico Collins", "Tank Dell", 0.70,
  "HOU", "Nico Collins", "Robert Woods", 0.20
  # ... more entries
)

cat("⚠️  Using placeholder injury redistribution (enhance with multinomial fit)\n\n")

# ============================================================================
# 5. GENERATE SSOT JSON
# ============================================================================

cat("🔧 Generating SSOT JSON...\n")

# Get current week matchups (from nflreadr or manual input)
# For now: manual schedule
schedule <- tribble(
  ~team, ~opp, ~is_home, ~spread, ~total,
  "DAL", "PHI", TRUE, -2.5, 48.5,
  "KC", "SF", FALSE, 3.0, 50.0
  # ... complete Week 8 schedule
)

# Build SSOT
ssot_players <- eb_priors %>%
  inner_join(schedule, by = "team") %>%
  mutate(
    # Classify ADOT bucket
    adot_bucket = case_when(
      adot <= 5 ~ "0-5",
      adot <= 12 ~ "6-12",
      TRUE ~ "13+"
    )
  ) %>%
  left_join(opp_defense, by = c("opp" = "defteam", "adot_bucket")) %>%
  mutate(
    # Negative Binomial parameters
    neg_bin_mu = eb_targets,
    neg_bin_phi = eb_targets * 0.3,  # Dispersion (will refine)
    
    # Beta parameters (from catch rate)
    # α = μ × ν, β = (1-μ) × ν, where ν controls concentration
    beta_nu = 50,  # Concentration parameter
    beta_alpha = eb_catch_rate * beta_nu,
    beta_beta = (1 - eb_catch_rate) * beta_nu,
    
    # Lognormal parameters (from yards per catch)
    lognorm_sigma = 0.45,  # Base variance
    lognorm_mu = log(pmax(3, eb_ypc)) - 0.5 * lognorm_sigma^2,
    
    # Opponent modifiers (capped)
    opp_targets = coalesce(targets_capped, 1.0),
    opp_catch = coalesce(comp_capped, 1.0),
    opp_yac = coalesce(yac_capped, 1.0)
  )

# Convert to JSON format
ssot_json <- list(
  week = WEEK,
  season = SEASON,
  generated_at = Sys.time(),
  schema_version = 1,
  metadata = list(
    total_players = nrow(ssot_players),
    data_sources = c("nflfastR", "nflreadr"),
    eb_tau = EB_TAU,
    cap_settings = list(
      per_factor_max = CAP_PER_FACTOR,
      combined_min = CAP_COMBINED_MIN,
      combined_max = CAP_COMBINED_MAX
    )
  ),
  players = ssot_players %>%
    select(
      player_id,
      team,
      opp,
      is_home,
      spread,
      total,
      adot,
      neg_bin_mu,
      neg_bin_phi,
      beta_alpha,
      beta_beta,
      lognorm_mu,
      lognorm_sigma,
      opp_targets,
      opp_catch,
      opp_yac
    ) %>%
    pmap(function(...) {
      row <- list(...)
      list(
        player_id = row$player_id,
        team = row$team,
        pos = "WR",  # TODO: actual position
        opp = row$opp,
        is_home = row$is_home,
        context = list(
          spread = row$spread,
          total = row$total,
          dome = FALSE  # TODO: stadium lookup
        ),
        neg_bin = list(
          mu = row$neg_bin_mu,
          phi = row$neg_bin_phi
        ),
        beta = list(
          alpha = row$beta_alpha,
          beta = row$beta_beta
        ),
        lognorm = list(
          log_mu = row$lognorm_mu,
          log_sigma = row$lognorm_sigma
        ),
        adot = row$adot,
        mods = list(
          opp = list(
            targets_pct = row$opp_targets,
            catch_pct = row$opp_catch,
            yac_pct = row$opp_yac,
            adot_bucket = row$adot_bucket
          )
        ),
        caps = list(
          combined_min = CAP_COMBINED_MIN,
          combined_max = CAP_COMBINED_MAX
        )
      )
    })
)

# Write to file
output_path <- glue("data/nfl/ssot/week_{WEEK}_{SEASON}.json")
dir.create(dirname(output_path), showWarnings = FALSE, recursive = TRUE)

write_json(ssot_json, output_path, pretty = TRUE, auto_unbox = TRUE)

cat(glue("✅ SSOT written to {output_path}\n"))
cat(glue("   {length(ssot_json$players)} players included\n\n"))

cat("🎯 NEXT STEPS:\n")
cat("1. Review SSOT JSON structure\n")
cat("2. Test scanner with: USE_SSOT=true\n")
cat("3. Compare vs old PLAYER_DB predictions\n")
cat("4. Optimize EB_TAU via backtest\n")
cat("5. Add multinomial injury model\n")
```

---

## Phase 5: Deployment & Testing (1 hour)

### **A/B Test Script**

```bash
#!/bin/bash
# Compare old vs new predictions

echo "🏈 A/B Test: PLAYER_DB vs SSOT"
echo "================================"

# Generate SSOT
Rscript scripts/nfl-receiving-props/generate-ssot.R

# Run old scanner
echo "Running old scanner..."
curl "/.netlify/functions/nfl-receiving-scanner-elite" > /tmp/old.json

# Run new scanner
echo "Running SSOT scanner..."
curl "/.netlify/functions/nfl-receiving-scanner-ssot?week=8" > /tmp/new.json

# Compare
echo ""
echo "Old predictions: $(jq '.total_predictions' /tmp/old.json)"
echo "New predictions: $(jq '.total_predictions' /tmp/new.json)"
echo ""
echo "Sample comparison (top 5):"
jq -r '.predictions[0:5] | .[] | "\(.player) \(.prop) \(.line) \(.side): Edge = \(.edge * 100 | floor)%"' /tmp/new.json
```

---

## Critical Safeguards

### **1. Kill Switch (CLV-based)**

```javascript
// In scanner
const recentProps = await getRecentProps(100); // Last 100 predictions
const clv = calculateCLV(recentProps);
const mae = calculateMAE(recentProps);

if (clv < -0.003 || mae > baseline_mae + 0.8) {
  console.error('🚨 KILL SWITCH: Model degraded, reverting to PLAYER_DB');
  // Fall back to old system
  return generateFromPlayerDB();
}
```

### **2. Logging Pipeline**

```javascript
// Log every prediction with full provenance
const predictionLog = {
  timestamp: new Date().toISOString(),
  player_id: player.player_id,
  week,
  ssot_hash: player.source_hash,
  
  // Inputs
  neg_bin: { mu: params.meanTargets, phi: params.kTargets },
  beta: { alpha: params.alphaCatch, beta: params.betaCatch },
  mods: params.modifiers,
  
  // Outputs
  sim_prob: modelProb,
  line,
  edge,
  kelly,
  
  // Market
  offered_odds,
  implied_prob,
  
  // Result (fill after game)
  actual_stat: null,
  hit: null,
  clv: null,
  roi: null
};
```

---

## What NOT to Touch

✅ **Safe to modify (NFL Receiving Props only):**
- `netlify/functions/nfl-receiving-scanner-elite.mjs`
- `netlify/functions/nfl-receiving-scanner-ssot.mjs` (new)
- `netlify/functions/_lib/ssot-loader.mjs` (new)
- `netlify/functions/_lib/elite-pricing-engine.mjs` (simulation engine - already good)
- `scripts/nfl-receiving-props/*` (R pipeline)
- `data/nfl/ssot/*` (new SSOT JSON files)

❌ **DO NOT TOUCH (NFL Game Predictions):**
- `netlify/functions/_lib/canonical-availability-v5.mjs`
- Any `nfl-predictions` or `nfl-td` functions
- Game-level models or spread/total predictors

---

## Timeline

| Task | Time | Priority |
|------|------|----------|
| Phase 1: SSOT JSON schema | 30 min | High |
| Phase 2: Scanner glue code | 1-2 hrs | High |
| Phase 3: Update scanner | 30 min | High |
| Phase 4: R SSOT generator | 2-3 hrs | Critical |
| Phase 5: A/B test & deploy | 1 hr | High |
| **TOTAL** | **4-6 hrs** | |

**This Weekend:** Phases 1-4 (get SSOT working)  
**Monday:** Phase 5 (A/B test, go live if CLV positive)

---

## Success Metrics

- ✅ SSOT JSON validates against schema
- ✅ Scanner loads SSOT successfully
- ✅ Predictions within ±10% of old system (sanity check)
- ✅ CLV ≥ 0% over 2-3 slates
- ✅ MAE doesn't degrade >0.5 yards
- ✅ Multiplier clipping <5% of cases
- ✅ Logging pipeline captures all fields

---

## Future Enhancements (Post-Launch)

1. **Optimize EB_TAU** via backtest (grid search 0.25-0.45)
2. **Multinomial injury model** (fit per team/coach/personnel)
3. **Weather API integration** (wind/precip caps)
4. **Home/road splits** (add to EB priors)
5. **Pace adjustments** (team tempo × matchup)
6. **CB/WR matchups** (only if premium data available)

**Don't add these until SSOT v1 proves CLV positive!**
