# NFL Receiving Props - SSOT Generator
# 
# Outputs: data/nfl/ssot/week_XX_2025.json
# 
# Features:
# - Empirical Bayes smoothing (season ⊕ recent)
# - ADOT-bucket opponent adjustments
# - Multinomial injury redistribution (placeholder)
# - Capped multipliers (per factor + combined)
# - Variance inflation for uncertainty

library(tidyverse)
library(nflfastR)
library(nflreadr)
library(glue)
library(jsonlite)
library(digest)
library(purrr)    # For map_dfr
library(rlang)    # For %||% null-coalescing operator

# Configuration
SEASON <- 2025
WEEK <- 8  # Change this for different weeks
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
    gsis_id = receiver_player_id,
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

# Recent form (last 5 GAMES - not play counts)
recent_stats <- pbp %>%
  filter(season == SEASON, week < WEEK) %>%
  group_by(gsis_id = receiver_player_id, game_id) %>%
  summarise(
    targets_g = n(),
    comp_g = sum(complete_pass, na.rm = TRUE),
    yds_g = sum(yards_gained[complete_pass == 1], na.rm = TRUE),
    rec_g = sum(complete_pass, na.rm = TRUE),
    .groups = "drop_last"
  ) %>%
  arrange(gsis_id, desc(game_id)) %>%
  group_by(gsis_id) %>%
  slice_head(n = 5) %>%
  summarise(
    games_recent = n(),
    targets_l5 = mean(targets_g),
    catch_rate_l5 = sum(comp_g) / pmax(sum(targets_g), 1),
    yards_per_rec_l5 = sum(yds_g) / pmax(sum(rec_g), 1),
    .groups = "drop"
  )

# Empirical Bayes combination
eb_priors <- season_stats %>%
  left_join(recent_stats, by = "gsis_id") %>%
  mutate(
    # Posterior = (1 - τ) × season + τ × recent
    eb_targets = (1 - EB_TAU) * targets_per_game + EB_TAU * coalesce(targets_l5, targets_per_game),
    eb_catch_rate = (1 - EB_TAU) * catch_rate + EB_TAU * coalesce(catch_rate_l5, catch_rate),
    eb_ypc = (1 - EB_TAU) * yards_per_rec + EB_TAU * coalesce(yards_per_rec_l5, yards_per_rec),
    
    # Ensure valid ranges (wider bounds to avoid edge flattening)
    eb_catch_rate = pmin(pmax(eb_catch_rate, 0.25), 0.98),
    eb_ypc = pmax(eb_ypc, 3),
    eb_targets = pmax(eb_targets, 1)
  )

cat(glue("✅ Computed EB priors for {nrow(eb_priors)} players (τ = {EB_TAU})\n\n"))

# ============================================================================
# 3. OPPONENT ADJUSTMENTS (ADOT-bucket splits)
# ============================================================================

cat("🎯 Building ADOT-bucket opponent tables...\n")

# CRITICAL FIX: Per-dropback normalization with TOTAL defensive dropbacks
# Problem: db = n() within bucket == targets_allowed, so ratio is always 1
# Solution: Compute total defensive dropbacks separately, then normalize bucket targets

# Step 1: Total defensive dropbacks per team (all ADOT buckets)
def_db <- pbp %>%
  filter(season == SEASON, week < WEEK, pass_attempt == 1, !is.na(air_yards)) %>%
  group_by(defteam) %>%
  summarise(db_total = n(), .groups = "drop")

# Step 2: Bucket-specific stats, normalized by total dropbacks
opp_defense <- pbp %>%
  filter(season == SEASON, week < WEEK, pass_attempt == 1, !is.na(air_yards)) %>%
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
  left_join(def_db, by = "defteam") %>%  # Join total defensive dropbacks
  group_by(adot_bucket) %>%
  mutate(
    # Per-dropback normalization: targets in bucket / total defensive dropbacks
    # This removes pace/pass-rate bias (fast defenses face more plays)
    tgt_per_db_rel = (targets_allowed / pmax(db_total, 1)) / 
                     mean(targets_allowed / pmax(db_total, 1), na.rm = TRUE),
    # Comp% and YAC stay bucket-conditional (no pace bias)
    comp_rel = comp_pct / mean(comp_pct, na.rm = TRUE),
    yac_rel = yac_avg / mean(yac_avg, na.rm = TRUE)
  ) %>%
  ungroup()

# Cap opponent effects at ±7%
opp_defense <- opp_defense %>%
  mutate(
    targets_capped = pmin(pmax(tgt_per_db_rel, 1 - CAP_PER_FACTOR), 1 + CAP_PER_FACTOR),
    comp_capped = pmin(pmax(comp_rel, 1 - CAP_PER_FACTOR), 1 + CAP_PER_FACTOR),
    yac_capped = pmin(pmax(yac_rel, 1 - CAP_PER_FACTOR), 1 + CAP_PER_FACTOR)
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
  # ... more entries would be added based on current injuries
)

cat("⚠️  Using placeholder injury redistribution (enhance with multinomial fit)\n\n")

# ============================================================================
# 5. GET WEEK 8 SCHEDULE & SPREADS
# ============================================================================

cat("📅 Loading Week 8 schedule...\n")

# Use nflreadr to get schedule
schedule <- nflreadr::load_schedules(SEASON) %>%
  filter(week == WEEK) %>%
  select(game_id, home_team, away_team, spread_line, total_line) %>%
  pivot_longer(
    cols = c(home_team, away_team),
    names_to = "location",
    values_to = "team"
  ) %>%
  mutate(
    is_home = location == "home_team",
    opp = if_else(is_home, away_team, home_team),
    # CRITICAL: Team perspective spread (if home, keep spread_line; if away, flip it)
    # spread_line is home team spread (negative if home favored)
    spread = if_else(is_home, spread_line, -spread_line),
    total = total_line
  ) %>%
  select(team, opp, is_home, spread, total) %>%
  distinct()

cat(glue("✅ Loaded {nrow(schedule)} team matchups for Week {WEEK}\n\n"))

# ============================================================================
# 5.5. LOAD CANONICAL ROSTER DATA (current team assignments)
# ============================================================================

cat("📋 Loading canonical roster data (current teams + injuries)...\n")

# Option 1: Load from canonical injuries/latest.json (includes depth charts + current teams)
canonical_path <- file.path(getwd(), "data", "nfl", "injuries", "latest.json")

if (file.exists(canonical_path)) {
  canonical_data <- jsonlite::fromJSON(canonical_path, simplifyVector = FALSE)
  
  # Extract current team assignments from canonical source
  canonical_rosters <- canonical_data$rosters %>%
    map_dfr(function(team_roster) {
      team_abbr <- team_roster$team
      
      team_roster$players %>%
        map_dfr(function(p) {
          tibble(
            gsis_id = p$gsis_id,
            canonical_team = team_abbr,
            canonical_name = p$name,
            canonical_pos = p$position,
            depth_order = p$depth %||% 99,
            injury_status = p$injury_status %||% "healthy"
          )
        })
    })
  
  cat(glue("✅ Loaded {nrow(canonical_rosters)} players from canonical source\n"))
} else {
  cat("⚠️  Canonical roster file not found, falling back to nflreadr\n")
  canonical_rosters <- tibble(
    gsis_id = character(),
    canonical_team = character(),
    canonical_name = character(),
    canonical_pos = character(),
    depth_order = integer(),
    injury_status = character()
  )
}

# Option 2: Load nflreadr rosters as backup (for position/GSIS validation)
rosters <- nflreadr::load_rosters(SEASON) %>%
  select(gsis_id, position, full_name) %>%
  filter(position %in% c("WR", "TE", "RB")) %>%
  distinct(gsis_id, .keep_all = TRUE)

cat(glue("✅ Loaded {nrow(rosters)} rostered pass-catchers from nflreadr\n\n"))

# ============================================================================
# 6. GENERATE SSOT JSON
# ============================================================================

cat("🔧 Generating SSOT JSON...\n")

# Helper: Slugify function (normalize accents, collapse dashes)
slugify <- function(x) {
  x %>%
    stringi::stri_trans_general("Latin-ASCII") %>%
    str_to_upper() %>%
    str_replace_all("[^A-Z0-9]+", "-") %>%
    str_replace_all("(^-|-$)", "")
}

# Build SSOT
ssot_players <- eb_priors %>%
  # First join canonical rosters to get CURRENT team (overrides historical PBP team)
  left_join(canonical_rosters, by = "gsis_id") %>%
  # Use canonical team if available, otherwise fall back to PBP historical team
  mutate(
    current_team = coalesce(canonical_team, team),
    current_pos = coalesce(canonical_pos, NA_character_)
  ) %>%
  # Now join schedule using CURRENT team (not historical PBP team)
  inner_join(schedule, by = c("current_team" = "team")) %>%
  # Join nflreadr roster data for position validation/backup
  left_join(rosters, by = "gsis_id") %>%
  mutate(
    # Final position: canonical > nflreadr > default WR
    final_pos = coalesce(current_pos, position, "WR"),
    
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
    # Estimate phi from variance (phi = mu^2 / (var - mu))
    # Use coefficient of variation approach: phi ~= mu / cv^2
    # CRITICAL: Clamp to prevent divide-by-zero in scanner
    neg_bin_phi = pmax(eb_targets * 0.35, 1e-6),  # Moderate overdispersion
    
    # Beta parameters (from catch rate)
    # α = μ × ν, β = (1-μ) × ν, where ν controls concentration
    beta_nu = 50,  # Concentration parameter (higher = less variable)
    beta_alpha = eb_catch_rate * beta_nu,
    beta_beta = (1 - eb_catch_rate) * beta_nu,
    
    # Lognormal parameters (from yards per catch)
    lognorm_sigma = 0.45,  # Base log-scale variance
    lognorm_mu = log(pmax(3, eb_ypc)) - 0.5 * lognorm_sigma^2,
    
    # Opponent modifiers (capped)
    opp_targets = coalesce(targets_capped, 1.0),
    opp_catch = coalesce(comp_capped, 1.0),
    opp_yac = coalesce(yac_capped, 1.0),
    
    # Create slug ID (for API keys) - use CURRENT team
    player_slug = paste0(current_team, "-", slugify(player_name)),
    
    # Injury status from canonical source
    has_injury = !is.na(injury_status) & injury_status != "healthy"
  ) %>%
  # Filter to top target-getters (avoid role players with < 4 targets/game)
  filter(eb_targets >= 4)

cat(glue("✅ Generated parameters for {nrow(ssot_players)} players\n"))

# Convert to JSON format
ssot_json <- list(
  week = WEEK,
  season = SEASON,
  generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z") %>% sub("(..)$", ":\\1", .),  # ISO 8601 with colon
  schema_version = 1,
  metadata = list(
    total_players = nrow(ssot_players),
    data_sources = c("nflfastR", "nflreadr"),
    eb_tau = EB_TAU,
    cap_settings = list(
      per_factor_max = CAP_PER_FACTOR,
      combined_min = CAP_COMBINED_MIN,
      combined_max = CAP_COMBINED_MAX
    ),
    # Provenance hash for reproducibility
    inputs_hash = digest(list(
      SEASON, WEEK, EB_TAU, CAP_PER_FACTOR,
      names(pbp), nrow(pbp), nrow(ssot_players)
    ))
  ),
  players = ssot_players %>%
    select(
      gsis_id,  # CRITICAL: Keep real GSIS ID
      player_slug,  # Slug for API keys
      player_name,
      current_team,  # Use CURRENT team, not historical PBP team
      opp,
      is_home,
      spread,
      total,
      adot,
      adot_bucket,
      neg_bin_mu,
      neg_bin_phi,
      beta_alpha,
      beta_beta,
      lognorm_mu,
      lognorm_sigma,
      opp_targets,
      opp_catch,
      opp_yac,
      final_pos,  # Final resolved position
      injury_status,  # From canonical source
      depth_order  # From canonical depth chart
    ) %>%
    pmap(function(...) {
      row <- list(...)
      
      list(
        player_id = row$player_slug,  # Use slug for API keys
        gsis_id = row$gsis_id,  # Real GSIS ID from nflfastR
        name = row$player_name,
        team = row$current_team,  # CURRENT team (e.g., NE not HOU for Diggs)
        pos = row$final_pos,
        opp = row$opp,
        is_home = row$is_home,
        matchup = paste0(row$current_team, if_else(row$is_home, " vs ", " @ "), row$opp),  # Display format
        context = list(
          spread = row$spread,
          total = row$total,
          wind_mph = 0,  # TODO: Add weather API
          precip_prob = 0,
          dome = FALSE  # TODO: Stadium lookup
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
          ),
          weather = list(
            catch_pct = 1.0,
            cap = 1.0
          ),
          injury = list(
            targets_delta = 0,
            uncertainty = 0
          ),
          snap_pct = list(
            projected = 1.0,
            l5_avg = 1.0
          )
        ),
        caps = list(
          combined_min = CAP_COMBINED_MIN,
          combined_max = CAP_COMBINED_MAX,
          raw_multiplier = NULL,
          capped_multiplier = NULL
        ),
        source_hash = digest::digest(paste0(row$player_id, row$neg_bin_mu, row$beta_alpha))
      )
    })
)

# Write to file
output_path <- glue("data/nfl/ssot/week_{WEEK}_{SEASON}.json")
dir.create(dirname(output_path), showWarnings = FALSE, recursive = TRUE)

write_json(ssot_json, output_path, pretty = TRUE, auto_unbox = TRUE)

cat(glue("\n✅ SSOT written to {output_path}\n"))
cat(glue("   {length(ssot_json$players)} players included\n"))
cat(glue("   EB smoothing: τ = {EB_TAU} (35% recent, 65% season)\n"))
cat(glue("   Opponent caps: ±{CAP_PER_FACTOR * 100}% per factor\n"))
cat(glue("   Combined caps: {CAP_COMBINED_MIN}-{CAP_COMBINED_MAX}\n\n"))

cat("🎯 NEXT STEPS:\n")
cat("1. Review SSOT JSON structure\n")
cat("2. Test scanner with: USE_SSOT=true netlify dev\n")
cat("3. Compare vs old PLAYER_DB predictions\n")
cat("4. Optimize EB_TAU via backtest (try 0.25-0.45)\n")
cat("5. Add multinomial injury model\n")
cat("6. Add weather API integration\n")
cat("7. Add actual position from roster data\n\n")

cat("✨ SSOT generation complete!\n")
