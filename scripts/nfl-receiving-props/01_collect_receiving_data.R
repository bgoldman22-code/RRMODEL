# NFL Receiving Props - Data Collection Pipeline
# Independent system leveraging nflfastR for receptions/yards props
# Author: RR Model
# Date: 2025-10-16

suppressPackageStartupMessages({
  library(nflfastR)
  library(nflreadr)
  library(tidyverse)
  library(jsonlite)
  library(glue)
  library(lubridate)
})

cat("🏈 NFL RECEIVING PROPS - Data Collection Pipeline\n")
cat("================================================\n\n")

# Configuration
CONFIG <- list(
  seasons = 2023:2025,  # Training: 2023-2024, Live: 2025
  current_season = 2025,
  current_week = 7,  # Will auto-detect in production
  cache_dir = "data/nfl_receiving_props",
  output_dir = "data/nfl_receiving_props",
  min_targets = 20  # Minimum targets to include player (filters noise)
)

# Create directories
dir.create(CONFIG$cache_dir, showWarnings = FALSE, recursive = TRUE)
dir.create(CONFIG$output_dir, showWarnings = FALSE, recursive = TRUE)

cat(glue::glue("📁 Cache directory: {CONFIG$cache_dir}"), "\n")
cat(glue::glue("📁 Output directory: {CONFIG$output_dir}"), "\n\n")

# ============================================================================
# 1. FETCH PLAY-BY-PLAY DATA (2023-2025)
# ============================================================================

fetch_pbp_data <- function() {
  cat("📡 Fetching play-by-play data (2023-2025)...\n")
  
  cache_file <- file.path(CONFIG$cache_dir, "pbp_raw.rds")
  
  # Check cache (refresh if older than 6 hours)
  if (file.exists(cache_file)) {
    file_age <- as.numeric(difftime(Sys.time(), file.mtime(cache_file), units = "hours"))
    if (file_age < 6) {
      cat(glue("  ✅ Loading cached PBP data (age: {round(file_age, 1)} hours)\n"))
      return(readRDS(cache_file))
    }
  }
  
  cat("  🔄 Downloading fresh PBP data from nflfastR...\n")
  
  pbp_data <- tryCatch({
    data <- load_pbp(seasons = CONFIG$seasons)
    
    # Filter to regular season passing plays only
    data <- data %>%
      filter(
        season_type == "REG",
        week <= 18,
        play_type == "pass",
        !is.na(receiver_player_name),
        receiver_player_name != ""
      ) %>%
      select(
        # Game identifiers
        game_id, season, week, game_date,
        home_team, away_team, posteam, defteam,
        
        # Game context
        score_differential, half_seconds_remaining,
        qtr, down, ydstogo, yardline_100,
        
        # Play outcome
        complete_pass, incomplete_pass, interception,
        yards_gained, touchdown, pass_touchdown,
        
        # Receiving data
        receiver_player_id, receiver_player_name,
        passer_player_id, passer_player_name,
        
        # Target quality
        air_yards, yards_after_catch,
        pass_location, pass_length,
        
        # Pressure/coverage
        qb_hit, qb_scramble,
        
        # EPA
        epa, success
      )
    
    # Save cache
    saveRDS(data, cache_file)
    cat(glue("  ✅ Cached {nrow(data):,} passing plays\n"))
    
    data
  }, error = function(e) {
    cat(glue("  ❌ Error fetching PBP data: {e$message}\n"))
    return(data.frame())
  })
  
  return(pbp_data)
}

# ============================================================================
# 2. CALCULATE PLAYER RECEIVING BASELINES
# ============================================================================

calculate_player_baselines <- function(pbp_data) {
  cat("\n📊 Calculating player receiving baselines...\n")
  
  # Aggregate by player-season-week for rolling calculations
  player_game_stats <- pbp_data %>%
    group_by(season, week, game_id, receiver_player_id, receiver_player_name, posteam) %>%
    summarise(
      # Target counts
      targets = n(),
      receptions = sum(complete_pass, na.rm = TRUE),
      
      # Yards
      receiving_yards = sum(yards_gained, na.rm = TRUE),
      air_yards_total = sum(air_yards, na.rm = TRUE),
      yac_total = sum(yards_after_catch, na.rm = TRUE),
      
      # Efficiency
      catch_rate = receptions / targets,
      yards_per_target = receiving_yards / targets,
      yards_per_reception = if_else(receptions > 0, receiving_yards / receptions, 0),
      
      # Target quality
      avg_depth_of_target = mean(air_yards, na.rm = TRUE),
      deep_targets = sum(air_yards >= 20, na.rm = TRUE),
      short_targets = sum(air_yards <= 5, na.rm = TRUE),
      
      # TD opportunity
      touchdowns = sum(pass_touchdown, na.rm = TRUE),
      red_zone_targets = sum(yardline_100 <= 20, na.rm = TRUE),
      
      # Success
      epa_per_target = mean(epa, na.rm = TRUE),
      success_rate = mean(success, na.rm = TRUE),
      
      .groups = "drop"
    ) %>%
    arrange(season, week, receiver_player_name)
  
  cat(glue("  ✅ Calculated stats for {n_distinct(player_game_stats$receiver_player_id)} unique players\n"))
  cat(glue("  ✅ Total player-games: {nrow(player_game_stats):,}\n"))
  
  # Calculate season-long averages (for baseline rates)
  player_season_stats <- player_game_stats %>%
    group_by(season, receiver_player_id, receiver_player_name, posteam) %>%
    summarise(
      games = n(),
      total_targets = sum(targets),
      total_receptions = sum(receptions),
      total_yards = sum(receiving_yards),
      
      # Per-game averages
      targets_per_game = mean(targets),
      receptions_per_game = mean(receptions),
      yards_per_game = mean(receiving_yards),
      
      # Rates
      catch_rate = sum(receptions) / sum(targets),
      yards_per_reception = sum(receiving_yards) / sum(receptions),
      yards_per_target = sum(receiving_yards) / sum(targets),
      
      # Target quality
      avg_depth_of_target = mean(avg_depth_of_target, na.rm = TRUE),
      deep_target_rate = sum(deep_targets) / sum(targets),
      
      # Efficiency
      avg_epa_per_target = mean(epa_per_target, na.rm = TRUE),
      avg_success_rate = mean(success_rate, na.rm = TRUE),
      
      .groups = "drop"
    ) %>%
    filter(total_targets >= CONFIG$min_targets)  # Filter low-volume players
  
  cat(glue("  ✅ {nrow(player_season_stats)} player-seasons with {CONFIG$min_targets}+ targets\n"))
  
  return(list(
    game_stats = player_game_stats,
    season_stats = player_season_stats
  ))
}

# ============================================================================
# 3. CALCULATE ROLLING AVERAGES (L5, L10, L20 games)
# ============================================================================

calculate_rolling_stats <- function(player_game_stats) {
  cat("\n📈 Calculating rolling averages (L5, L10, L20)...\n")
  
  rolling_stats <- player_game_stats %>%
    arrange(receiver_player_id, season, week) %>%
    group_by(receiver_player_id, receiver_player_name) %>%
    mutate(
      # Last 5 games
      targets_l5 = zoo::rollmean(targets, k = 5, fill = NA, align = "right"),
      receptions_l5 = zoo::rollmean(receptions, k = 5, fill = NA, align = "right"),
      yards_l5 = zoo::rollmean(receiving_yards, k = 5, fill = NA, align = "right"),
      catch_rate_l5 = zoo::rollmean(catch_rate, k = 5, fill = NA, align = "right"),
      
      # Last 10 games
      targets_l10 = zoo::rollmean(targets, k = 10, fill = NA, align = "right"),
      receptions_l10 = zoo::rollmean(receptions, k = 10, fill = NA, align = "right"),
      yards_l10 = zoo::rollmean(receiving_yards, k = 10, fill = NA, align = "right"),
      catch_rate_l10 = zoo::rollmean(catch_rate, k = 10, fill = NA, align = "right"),
      
      # Last 20 games (season+)
      targets_l20 = zoo::rollmean(targets, k = 20, fill = NA, align = "right"),
      receptions_l20 = zoo::rollmean(receptions, k = 20, fill = NA, align = "right"),
      yards_l20 = zoo::rollmean(receiving_yards, k = 20, fill = NA, align = "right"),
      catch_rate_l20 = zoo::rollmean(catch_rate, k = 20, fill = NA, align = "right")
    ) %>%
    ungroup()
  
  cat(glue("  ✅ Rolling stats calculated\n"))
  
  return(rolling_stats)
}

# ============================================================================
# 4. LOAD ROSTERS & DEPTH CHARTS
# ============================================================================

load_roster_depth_data <- function() {
  cat("\n👥 Loading rosters and depth chart data...\n")
  
  rosters <- tryCatch({
    roster_data <- load_rosters(seasons = CONFIG$seasons) %>%
      filter(position %in% c("WR", "TE", "RB")) %>%
      select(
        season, team, 
        player_id = gsis_id,
        player_name = full_name,
        position, 
        depth_chart_position,
        jersey_number,
        status,
        entry_year,
        rookie_year
      )
    
    cat(glue("  ✅ Loaded {nrow(roster_data):,} roster entries\n"))
    roster_data
  }, error = function(e) {
    cat(glue("  ⚠️ Error loading rosters: {e$message}\n"))
    return(data.frame())
  })
  
  return(rosters)
}

# ============================================================================
# 5. OPPONENT DEFENSE STATS (Pass Defense Quality)
# ============================================================================

calculate_opponent_defense_stats <- function(pbp_data) {
  cat("\n🛡️ Calculating opponent pass defense quality...\n")
  
  defense_stats <- pbp_data %>%
    group_by(season, defteam) %>%
    summarise(
      pass_plays_faced = n(),
      
      # Completions allowed
      completions_allowed = sum(complete_pass, na.rm = TRUE),
      completion_rate_allowed = completions_allowed / pass_plays_faced,
      
      # Yards allowed
      pass_yards_allowed = sum(yards_gained, na.rm = TRUE),
      yards_per_attempt_allowed = pass_yards_allowed / pass_plays_faced,
      
      # Big plays allowed
      explosive_plays_allowed = sum(yards_gained >= 20, na.rm = TRUE),
      explosive_rate = explosive_plays_allowed / pass_plays_faced,
      
      # EPA allowed
      epa_per_pass_allowed = mean(epa, na.rm = TRUE),
      success_rate_allowed = mean(success, na.rm = TRUE),
      
      .groups = "drop"
    ) %>%
    mutate(
      # Normalize to league average (0 = average, positive = good defense)
      epa_allowed_vs_avg = epa_per_pass_allowed - mean(epa_per_pass_allowed),
      completion_rate_vs_avg = completion_rate_allowed - mean(completion_rate_allowed)
    )
  
  cat(glue("  ✅ Defense stats for {nrow(defense_stats)} team-seasons\n"))
  
  return(defense_stats)
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main <- function() {
  start_time <- Sys.time()
  
  cat("\n" , strrep("=", 60) , "\n")
  cat("STARTING NFL RECEIVING PROPS DATA COLLECTION\n")
  cat(strrep("=", 60) , "\n\n")
  
  # Step 1: Fetch PBP data
  pbp_data <- fetch_pbp_data()
  
  if (nrow(pbp_data) == 0) {
    cat("❌ Failed to fetch PBP data. Exiting.\n")
    return(invisible(NULL))
  }
  
  # Step 2: Calculate player baselines
  player_stats <- calculate_player_baselines(pbp_data)
  
  # Step 3: Calculate rolling averages
  rolling_data <- calculate_rolling_stats(player_stats$game_stats)
  
  # Step 4: Load roster/depth data
  rosters <- load_roster_depth_data()
  
  # Step 5: Calculate opponent defense stats
  defense_stats <- calculate_opponent_defense_stats(pbp_data)
  
  # Step 6: Save outputs
  cat("\n💾 Saving processed data...\n")
  
  saveRDS(pbp_data, file.path(CONFIG$output_dir, "pbp_receiving.rds"))
  saveRDS(player_stats$season_stats, file.path(CONFIG$output_dir, "player_season_stats.rds"))
  saveRDS(rolling_data, file.path(CONFIG$output_dir, "player_rolling_stats.rds"))
  saveRDS(rosters, file.path(CONFIG$output_dir, "rosters.rds"))
  saveRDS(defense_stats, file.path(CONFIG$output_dir, "defense_stats.rds"))
  
  # Also save as JSON for JavaScript consumption
  write_json(
    player_stats$season_stats,
    file.path(CONFIG$output_dir, "player_season_stats.json"),
    pretty = TRUE
  )
  
  cat(glue("  ✅ Saved to {CONFIG$output_dir}/\n"))
  
  # Summary
  end_time <- Sys.time()
  elapsed <- round(as.numeric(difftime(end_time, start_time, units = "secs")), 1)
  
  cat("\n" , strrep("=", 60) , "\n")
  cat("✅ DATA COLLECTION COMPLETE\n")
  cat(strrep("=", 60) , "\n")
  cat(glue("⏱️  Elapsed time: {elapsed} seconds\n"))
  cat(glue("📊 Players tracked: {n_distinct(player_stats$season_stats$receiver_player_id)}\n"))
  cat(glue("🏈 Total passing plays: {nrow(pbp_data):,}\n"))
  cat(glue("📁 Output directory: {CONFIG$output_dir}\n\n"))
  
  return(invisible(list(
    pbp = pbp_data,
    player_stats = player_stats,
    rolling = rolling_data,
    rosters = rosters,
    defense = defense_stats
  )))
}

# Run if executed directly
if (!interactive()) {
  main()
}
