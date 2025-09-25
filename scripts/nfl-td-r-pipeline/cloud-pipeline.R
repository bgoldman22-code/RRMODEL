# NFL Touchdown Prediction - Cloud-Optimized R Pipeline
# Designed for GitHub Actions execution with direct JSON output

suppressPackageStartupMessages({
  library(nflfastR)
  library(nflreadr)
  library(tidyverse)
  library(jsonlite)
  library(glue)
  library(lubridate)
})

cat("🏈 Starting NFL TD Cloud Pipeline...\n")

# Auto-detect current NFL week (matches frontend logic) with consistent timezone
auto_detect_nfl_week <- function() {
  # Use Eastern Time to be consistent with NFL scheduling
  current_time <- as.POSIXct(Sys.time(), tz = "UTC")
  et_time <- format(current_time, tz = "America/New_York", usetz = TRUE)
  today <- as.Date(et_time)
  
  season_start <- as.Date("2025-09-05")  # NFL 2025 season start
  days_since_start <- as.numeric(today - season_start)
  
  cat(glue("🕐 Week calculation: Today (ET): {today}, Season start: {season_start}, Days: {days_since_start}\n"))
  
  if (days_since_start < 0) return(1)  # Preseason
  
  # Week calculation (matches frontend)
  if (days_since_start <= 6) return(1)
  else if (days_since_start <= 13) return(2)  
  else if (days_since_start <= 17) return(3)
  else return(floor((days_since_start - 18) / 7) + 4)
}

# Cloud-optimized configuration  
CLOUD_CONFIG <- list(
  current_season = as.numeric(Sys.getenv("NFL_SEASON", "2025")),
  current_week = if (Sys.getenv("NFL_WEEK") != "") {
    as.numeric(Sys.getenv("NFL_WEEK"))
  } else {
    # TEMPORARY HARDCODE: Force Week 4 for September 25, 2025
    4  # auto_detect_nfl_week()
  },
  output_files = list(
    comprehensive = "data/nfl-td-comprehensive-latest.json",
    schedule = "public/data/nfl-schedule-2025.json",
    player_features = "data/nfl-player-features-2025.json"
  )
)

# Fetch fresh NFL data from nflverse with intelligent caching
fetch_nfl_data <- function() {
  cat("📡 Fetching NFLverse data with intelligent caching...\n")
  
  # Create cache directory
  cache_dir <- "data/nfl_r_pipeline"
  dir.create(cache_dir, showWarnings = FALSE, recursive = TRUE)
  
  # Cache file paths
  pbp_cache <- file.path(cache_dir, glue("pbp_cache_{CLOUD_CONFIG$current_season}.rds"))
  schedule_cache <- file.path(cache_dir, glue("schedule_cache_{CLOUD_CONFIG$current_season}.rds"))
  stats_cache <- file.path(cache_dir, glue("stats_cache_{CLOUD_CONFIG$current_season}.rds"))
  rosters_cache <- file.path(cache_dir, glue("rosters_cache_{CLOUD_CONFIG$current_season}.rds"))
  
  # Check if we need fresh data (cache older than 6 hours or doesn't exist)
  cache_age_hours <- 6
  needs_refresh <- function(cache_file) {
    if (!file.exists(cache_file)) return(TRUE)
    file_age <- as.numeric(difftime(Sys.time(), file.mtime(cache_file), units = "hours"))
    return(file_age > cache_age_hours)
  }
  
  # Get play-by-play data (most expensive call)
  pbp_data <- if (needs_refresh(pbp_cache)) {
    cat("🔄 Downloading fresh play-by-play data...\n")
    tryCatch({
      data <- load_pbp(seasons = 2023:CLOUD_CONFIG$current_season)
      saveRDS(data, pbp_cache)
      cat(glue("✅ PBP data cached to {pbp_cache}\n"))
      data
    }, error = function(e) {
      cat(glue("⚠️ PBP download failed: {e$message}\n"))
      if (file.exists(pbp_cache)) {
        cat("📦 Using existing cached PBP data\n")
        readRDS(pbp_cache)
      } else {
        NULL
      }
    })
  } else {
    cat("📦 Using cached play-by-play data\n")
    readRDS(pbp_cache)
  }
  
  # Get current season schedule (updates frequently during season)
  schedule <- if (needs_refresh(schedule_cache)) {
    cat("🔄 Downloading fresh schedule data...\n")
    tryCatch({
      data <- load_schedules(seasons = CLOUD_CONFIG$current_season)
      saveRDS(data, schedule_cache)
      cat(glue("✅ Schedule data cached to {schedule_cache}\n"))
      data
    }, error = function(e) {
      cat(glue("⚠️ Schedule download failed: {e$message}\n"))
      if (file.exists(schedule_cache)) readRDS(schedule_cache) else NULL
    })
  } else {
    cat("📦 Using cached schedule data\n")
    readRDS(schedule_cache)
  }
  
  # Get player stats (updates after games)
  player_stats <- if (needs_refresh(stats_cache)) {
    cat("🔄 Downloading fresh player stats...\n")
    tryCatch({
      data <- load_player_stats(seasons = 2023:CLOUD_CONFIG$current_season)
      saveRDS(data, stats_cache)
      cat(glue("✅ Player stats cached to {stats_cache}\n"))
      data
    }, error = function(e) {
      cat(glue("⚠️ Player stats download failed: {e$message}\n"))
      if (file.exists(stats_cache)) readRDS(stats_cache) else NULL
    })
  } else {
    cat("📦 Using cached player stats\n")
    readRDS(stats_cache)
  }
  
  # Get rosters for current teams (updates less frequently)
  rosters <- if (needs_refresh(rosters_cache)) {
    cat("🔄 Downloading fresh roster data...\n")
    tryCatch({
      data <- load_rosters(seasons = CLOUD_CONFIG$current_season)
      saveRDS(data, rosters_cache)
      cat(glue("✅ Roster data cached to {rosters_cache}\n"))
      data
    }, error = function(e) {
      cat(glue("⚠️ Roster download failed: {e$message}\n"))
      if (file.exists(rosters_cache)) readRDS(rosters_cache) else NULL
    })
  } else {
    cat("📦 Using cached roster data\n")
    readRDS(rosters_cache)
  }
  
  # Return all data
  list(
    pbp = pbp_data,
    schedule = schedule,
    player_stats = player_stats,
    rosters = rosters
  )
}

# Process touchdown data for comprehensive predictions
process_td_data <- function(nfl_data) {
  cat("🎯 Processing touchdown prediction data...\n")
  
  if (is.null(nfl_data$pbp)) {
    stop("No play-by-play data available")
  }
  
  # Calculate player TD stats and trends
  player_td_stats <- nfl_data$pbp %>%
    filter(season >= 2023, !is.na(td_player_name)) %>%
    group_by(td_player_id, td_player_name, season, week) %>%
    summarise(
      tds_scored = n(),
      first_td = any(str_detect(desc, "TOUCHDOWN.*1st")),
      multiple_tds = sum(tds_scored) > 1,
      .groups = "drop"
    ) %>%
    group_by(td_player_id, td_player_name) %>%
    summarise(
      total_tds = sum(tds_scored),
      games_with_td = n(),
      avg_tds_per_game = mean(tds_scored),
      first_td_rate = mean(first_td, na.rm = TRUE),
      multiple_td_rate = mean(multiple_tds, na.rm = TRUE),
      recent_form = mean(tail(tds_scored, 4)), # Last 4 games
      .groups = "drop"
    )
  
  # Get current roster info and merge
  if (!is.null(nfl_data$rosters)) {
    current_rosters <- nfl_data$rosters %>%
      filter(season == CLOUD_CONFIG$current_season) %>%
      select(player_id = gsis_id, team = team, position, depth_chart_position)
    
    player_td_stats <- player_td_stats %>%
      left_join(current_rosters, by = c("td_player_id" = "player_id"))
  }
  
  return(player_td_stats)
}

# Generate comprehensive predictions in React component format
generate_comprehensive_predictions <- function(td_stats, schedule_data) {
  cat("🔮 Generating comprehensive TD predictions...\n")
  
  # Create predictions for each player
  predictions <- td_stats %>%
    filter(!is.na(team), total_tds > 0) %>%
    mutate(
      # Calculate base probabilities from historical data
      anytime_base = pmin(avg_tds_per_game * 0.85, 0.90),
      first_base = first_td_rate * 0.8,
      multiple_base = multiple_td_rate * 0.6,
      
      # Adjust for position
      position_multiplier = case_when(
        position == "RB" ~ 1.1,
        position == "WR" ~ 1.0,
        position == "TE" ~ 0.9,
        position == "QB" ~ 0.3,
        TRUE ~ 0.8
      ),
      
      # Apply adjustments
      anytime_prob = pmin(anytime_base * position_multiplier, 0.95),
      first_prob = pmin(first_base * position_multiplier, 0.25),
      multiple_prob = pmin(multiple_base * position_multiplier, 0.35),
      
      # Calculate confidence based on consistency
      confidence = pmin(30 + (games_with_td * 3) + (recent_form * 20), 95),
      
      # Get matchup info
      opponent = "TBD", # Will be filled from schedule
      is_home = TRUE    # Will be filled from schedule
    )
  
  # Format for React component with FLAT structure (not nested)
  formatted_predictions <- predictions %>%
    mutate(
      # FLAT probability fields (not nested lists)
      anytime_td_prob = round(anytime_prob, 3),
      anytime_confidence = case_when(
        confidence >= 70 ~ "high",
        confidence >= 50 ~ "medium",
        TRUE ~ "low"
      ),
      first_td_prob = round(first_prob, 3),
      first_confidence = case_when(
        confidence >= 70 ~ "high",
        confidence >= 50 ~ "medium", 
        TRUE ~ "low"
      ),
      multiple_td_prob = round(multiple_prob, 3),
      multiple_confidence = case_when(
        confidence >= 70 ~ "high",
        confidence >= 50 ~ "medium",
        TRUE ~ "low"
      ),
      # Add value scores for API compatibility
      anytime_value_score = pmax(0, (anytime_prob - 0.15) * 0.5),
      first_value_score = pmax(0, (first_prob - 0.05) * 0.3),
      multiple_value_score = pmax(0, (multiple_prob - 0.08) * 0.4),
      # Keep original nested structure for backward compatibility
      anytime_td = anytime_prob,
      first_td = first_prob,
      multiple_td = multiple_prob
    ) %>%
    select(
      player_id = td_player_id,
      name = td_player_name,
      team,
      position,
      opponent,
      is_home,
      depth_chart_position,
      # New FLAT fields
      anytime_td_prob,
      anytime_confidence,
      first_td_prob,
      first_confidence,
      multiple_td_prob,
      multiple_confidence,
      anytime_value_score,
      first_value_score,
      multiple_value_score,
      # Keep legacy fields
      anytime_td,
      first_td,
      multiple_td
    )
  
  return(formatted_predictions)
}

# Export schedule data
export_schedule <- function(schedule_data, output_file) {
  if (is.null(schedule_data)) return(FALSE)
  
  cat(glue("📅 Exporting schedule to {output_file}...\n"))
  
  schedule_export <- schedule_data %>%
    filter(season == CLOUD_CONFIG$current_season, week <= 18) %>%
    select(
      week,
      game_id,
      gameday,
      weekday,
      gametime,
      away_team,
      home_team,
      away_score,
      home_score,
      game_type,
      roof,
      surface,
      temp,
      wind
    ) %>%
    arrange(week, gameday)
  
  # Ensure directory exists
  dir.create(dirname(output_file), showWarnings = FALSE, recursive = TRUE)
  
  write_json(schedule_export, output_file, pretty = TRUE, auto_unbox = TRUE)
  
  return(TRUE)
}

# Main cloud pipeline execution
run_cloud_pipeline <- function() {
  start_time <- Sys.time()
  
  cat("🚀 NFL TD Cloud Pipeline Starting...\n")
  cat(glue("Season: {CLOUD_CONFIG$current_season}, Week: {CLOUD_CONFIG$current_week}\n\n"))
  
  # Step 1: Fetch fresh data
  nfl_data <- fetch_nfl_data()
  
  # Step 2: Process TD data
  td_stats <- process_td_data(nfl_data)
  cat(glue("✅ Processed {nrow(td_stats)} players with TD history\n"))
  
  # Step 3: Generate comprehensive predictions
  predictions <- generate_comprehensive_predictions(td_stats, nfl_data$schedule)
  cat(glue("✅ Generated predictions for {nrow(predictions)} active players\n"))
  
  # Step 4: Export comprehensive data
  comprehensive_output <- list(
    metadata = list(
      generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ"),
      season = CLOUD_CONFIG$current_season,
      week = CLOUD_CONFIG$current_week,
      total_players = nrow(predictions),
      pipeline_version = "cloud-optimized-1.0"
    ),
    predictions = predictions
  )
  
  # Ensure output directory exists
  dir.create(dirname(CLOUD_CONFIG$output_files$comprehensive), showWarnings = FALSE, recursive = TRUE)
  
  write_json(comprehensive_output, CLOUD_CONFIG$output_files$comprehensive, pretty = TRUE, auto_unbox = TRUE)
  cat(glue("✅ Exported comprehensive predictions to {CLOUD_CONFIG$output_files$comprehensive}\n"))
  
  # Step 5: Export schedule
  if (!is.null(nfl_data$schedule)) {
    export_schedule(nfl_data$schedule, CLOUD_CONFIG$output_files$schedule)
  }
  
  # Step 6: Create player features file
  player_features <- predictions %>%
    select(player_id, name, team, position, depth_chart_position) %>%
    mutate(
      active = TRUE,
      last_updated = format(Sys.time(), "%Y-%m-%d")
    )
  
  dir.create(dirname(CLOUD_CONFIG$output_files$player_features), showWarnings = FALSE, recursive = TRUE)
  write_json(player_features, CLOUD_CONFIG$output_files$player_features, pretty = TRUE, auto_unbox = TRUE)
  cat(glue("✅ Exported player features to {CLOUD_CONFIG$output_files$player_features}\n"))
  
  duration <- as.numeric(difftime(Sys.time(), start_time, units = "mins"))
  cat(glue("\n🎉 Cloud pipeline completed in {round(duration, 2)} minutes!\n"))
  
  return(list(
    success = TRUE,
    players_processed = nrow(predictions),
    files_created = c(
      CLOUD_CONFIG$output_files$comprehensive,
      CLOUD_CONFIG$output_files$schedule,
      CLOUD_CONFIG$output_files$player_features
    )
  ))
}

# Execute pipeline
if (!interactive()) {
  tryCatch({
    results <- run_cloud_pipeline()
    if (results$success) {
      cat("✅ Pipeline execution successful!\n")
      quit(status = 0)
    } else {
      cat("❌ Pipeline execution failed!\n")
      quit(status = 1)
    }
  }, error = function(e) {
    cat(glue("❌ Pipeline error: {e$message}\n"))
    quit(status = 1)
  })
}