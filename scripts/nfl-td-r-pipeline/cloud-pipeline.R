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

# Auto-detect current NFL week (matches frontend logic) using Eastern Time
auto_detect_nfl_week <- function() {
  # Normalize to America/New_York because NFL schedule uses ET
  current_time_utc <- as.POSIXct(Sys.time(), tz = "UTC")
  current_time_et <- format(current_time_utc, tz = "America/New_York")
  today <- as.Date(current_time_et)

  season_start <- as.Date("2025-09-05")  # NFL 2025 season start (ET)
  days_since_start <- as.numeric(today - season_start)

  cat(glue("🕐 Week calc — Today (ET): {today}, Season start: {season_start}, Days: {days_since_start}\n"))

  if (days_since_start < 0) return(1)  # Preseason (treat as Week 1)

  # Week calculation (matches frontend buckets)
  if (days_since_start <= 6) return(1)
  else if (days_since_start <= 13) return(2)
  else if (days_since_start <= 17) return(3)
  else return(floor((days_since_start - 18) / 7) + 4)
}

CLOUD_CONFIG <- list(
  current_season = as.numeric(Sys.getenv("NFL_SEASON", "2025")),
  current_week = if (Sys.getenv("NFL_WEEK") != "") {
    as.numeric(Sys.getenv("NFL_WEEK"))
  } else {
    auto_detect_nfl_week()
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

# Calculate detailed player stats from play-by-play data
calculate_detailed_player_stats <- function(pbp_data, player_stats_data, predictions) {
  if (is.null(pbp_data)) {
    cat("⚠️ No play-by-play data available, using defaults\n")
    return(tibble())
  }
  
  cat("🔍 Processing play-by-play data for detailed stats...\n")
  
  # Calculate snap counts and red zone usage from play-by-play
  # Focus on recent 4 weeks for current form
  recent_weeks <- max(pbp_data$week, na.rm = TRUE) - 3
  
  # Calculate stats for skill position players
  player_stats <- pbp_data %>%
    filter(
      season == CLOUD_CONFIG$current_season,
      week >= recent_weeks,
      !is.na(posteam)
    ) %>%
    group_by(posteam, week) %>%
    mutate(
      team_plays = n(),
      is_red_zone = yardline_100 <= 20
    ) %>%
    ungroup() %>%
    group_by(posteam, week) %>%
    mutate(
      team_red_zone_plays = sum(is_red_zone, na.rm = TRUE)
    ) %>%
    ungroup()
  
  # RB stats: rushing attempts + targets
  rb_stats <- player_stats %>%
    filter(!is.na(rusher_player_id) | !is.na(receiver_player_id)) %>%
    mutate(
      player_id = coalesce(rusher_player_id, receiver_player_id),
      player_name = coalesce(rusher_player_name, receiver_player_name)
    ) %>%
    filter(!is.na(player_id)) %>%
    group_by(player_id, player_name, posteam) %>%
    summarise(
      total_touches = n(),
      rush_attempts = sum(!is.na(rusher_player_id), na.rm = TRUE),
      targets = sum(!is.na(receiver_player_id), na.rm = TRUE),
      receptions = sum(!is.na(receiver_player_id) & complete_pass == 1, na.rm = TRUE),
      red_zone_touches = sum(is_red_zone, na.rm = TRUE),
      red_zone_rush = sum(is_red_zone & !is.na(rusher_player_id), na.rm = TRUE),
      red_zone_targets = sum(is_red_zone & !is.na(receiver_player_id), na.rm = TRUE),
      touchdowns = sum(touchdown == 1 & (td_player_id == player_id), na.rm = TRUE),
      games_played = n_distinct(week),
      team_plays = mean(team_plays, na.rm = TRUE),
      team_rz_plays = mean(team_red_zone_plays, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    mutate(
      snap_percentage = pmin(total_touches / (team_plays * 0.6), 1.0),  # Estimate from touches
      target_share = targets / (team_plays * 0.35),  # Estimate passing plays
      red_zone_efficiency = if_else(red_zone_touches > 0, 
                                     touchdowns / red_zone_touches, 
                                     0),
      red_zone_usage_rate = if_else(team_rz_plays > 0,
                                     red_zone_touches / team_rz_plays,
                                     0),
      consistency_score = if_else(games_played > 0,
                                   1 - (sd(c(rep(1, touchdowns), rep(0, games_played - touchdowns))) / (games_played * 0.5)),
                                   0.5),
      # Adjust metrics to realistic ranges
      snap_percentage = pmin(pmax(snap_percentage, 0), 1),
      target_share = pmin(pmax(target_share, 0), 1),
      red_zone_efficiency = pmin(pmax(red_zone_efficiency, 0), 1),
      red_zone_usage_rate = pmin(pmax(red_zone_usage_rate, 0), 1),
      consistency_score = pmin(pmax(consistency_score, 0), 1)
    )
  
  # Add position from predictions
  rb_stats <- rb_stats %>%
    left_join(
      predictions %>% select(player_id, position, team),
      by = c("player_id", "posteam" = "team")
    )
  
  return(rb_stats)
}

# Create comprehensive player data in the format expected by the UI
create_comprehensive_player_data <- function(predictions, detailed_stats) {
  cat("📦 Creating comprehensive player data structure...\n")
  
  # Create player data with key_factors
  players_list <- list()
  
  for (i in 1:nrow(predictions)) {
    player <- predictions[i, ]
    pid <- player$player_id
    
    # Find matching detailed stats
    player_stats <- detailed_stats %>% filter(player_id == pid)
    
    # Use detailed stats if available, otherwise use reasonable defaults by position
    if (nrow(player_stats) > 0) {
      snap_pct <- player_stats$snap_percentage[1]
      rz_eff <- player_stats$red_zone_efficiency[1]
      consist <- player_stats$consistency_score[1]
      rz_targets <- player_stats$red_zone_targets[1]
      rz_carries <- player_stats$red_zone_rush[1]
    } else {
      # Position-based defaults
      snap_pct <- case_when(
        player$position == "RB" && player$depth_chart_position == "RB" ~ 0.65,
        player$position == "RB" ~ 0.35,
        player$position == "WR" && player$depth_chart_position == "WR" ~ 0.75,
        player$position == "WR" ~ 0.40,
        player$position == "TE" && player$depth_chart_position == "TE" ~ 0.60,
        player$position == "TE" ~ 0.30,
        player$position == "QB" ~ 0.95,
        TRUE ~ 0.50
      )
      rz_eff <- case_when(
        player$position == "RB" ~ 0.35,
        player$position == "WR" ~ 0.25,
        player$position == "TE" ~ 0.30,
        player$position == "QB" ~ 0.15,
        TRUE ~ 0.20
      )
      consist <- 0.70
      rz_targets <- 0
      rz_carries <- 0
    }
    
    players_list[[pid]] <- list(
      player_id = pid,
      name = player$name,
      position = player$position,
      team = player$team,
      depth_chart_position = as.integer(gsub("\\D", "", as.character(player$depth_chart_position))),
      anytime_td = list(
        probability = player$anytime_td_prob,
        confidence = case_when(
          player$anytime_confidence == "high" ~ 75,
          player$anytime_confidence == "medium" ~ 60,
          TRUE ~ 45
        ),
        implied_odds = sprintf("+%.0f", (1/player$anytime_td_prob - 1) * 100),
        value = player$anytime_value_score,
        best_book = "DraftKings"
      ),
      first_td = list(
        probability = player$first_td_prob,
        confidence = case_when(
          player$first_confidence == "high" ~ 65,
          player$first_confidence == "medium" ~ 50,
          TRUE ~ 35
        ),
        implied_odds = sprintf("+%.0f", (1/max(player$first_td_prob, 0.01) - 1) * 100),
        value = player$first_value_score,
        best_book = "FanDuel"
      ),
      multiple_td = list(
        probability = player$multiple_td_prob,
        confidence = case_when(
          player$multiple_confidence == "high" ~ 60,
          player$multiple_confidence == "medium" ~ 45,
          TRUE ~ 30
        ),
        implied_odds = sprintf("+%.0f", (1/max(player$multiple_td_prob, 0.01) - 1) * 100),
        value = player$multiple_value_score,
        best_book = "BetMGM"
      ),
      key_factors = list(
        snap_percentage = round(snap_pct, 4),
        red_zone_efficiency = round(rz_eff, 4),
        consistency_score = round(consist, 4),
        red_zone_targets = as.integer(rz_targets),
        red_zone_carries = as.integer(rz_carries)
      ),
      model_metadata = list(
        primary_td_path = case_when(
          player$position == "RB" ~ "rushing",
          player$position == "WR" ~ "receiving",
          player$position == "TE" ~ "redzone",
          player$position == "QB" ~ "rushing",
          TRUE ~ "opportunity"
        ),
        data_reliability = round(min(player$anytime_confidence / 100, 0.95), 4),
        upside_factors = if_else(snap_pct > 0.6, "volume", "opportunity"),
        risk_factors = case_when(
          snap_pct < 0.3 ~ list(c("limited_snaps", "inconsistent_role")),
          consist < 0.5 ~ list(c("td_volatility", "game_script_dependent")),
          TRUE ~ list(c("matchup_dependent"))
        )
      )
    )
  }
  
  # Create final structure matching expected format
  output <- list(
    players = players_list,
    last_updated = format(Sys.time(), "%Y-%m-%d %H:%M:%S UTC"),
    season = CLOUD_CONFIG$current_season,
    week = CLOUD_CONFIG$current_week
  )
  
  cat(glue("✅ Created player data for {length(players_list)} players\n"))
  
  return(output)
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
  
  # Step 6: Calculate detailed player stats from play-by-play data
  cat("📊 Calculating detailed player stats from play-by-play data...\n")
  detailed_player_stats <- calculate_detailed_player_stats(nfl_data$pbp, nfl_data$player_stats, predictions)
  
  # Step 7: Create comprehensive player data file with detailed stats
  player_data <- create_comprehensive_player_data(predictions, detailed_player_stats)
  
  # Export to public/nfl-anytime-td-player-data.json format
  player_data_file <- "public/nfl-anytime-td-player-data.json"
  dir.create(dirname(player_data_file), showWarnings = FALSE, recursive = TRUE)
  write_json(player_data, player_data_file, pretty = TRUE, auto_unbox = TRUE)
  cat(glue("✅ Exported comprehensive player data to {player_data_file}\n"))
  
  # Also keep the minimal player features file for backward compatibility
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
      CLOUD_CONFIG$output_files$player_features,
      "public/nfl-anytime-td-player-data.json"
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