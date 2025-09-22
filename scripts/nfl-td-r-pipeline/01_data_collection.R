# Utility: Safe data loading with caching and error handling
safe_load_data <- function(data_func, cache_file, force_refresh = FALSE) {
  # Use local data/nfl_r_pipeline/ for cache if not absolute
  cache_path <- cache_file
  if (!grepl("/", cache_file)) {
    cache_path <- file.path(CONFIG$output_dir, cache_file)
  }
  if (file.exists(cache_path) && !force_refresh) {
    cat(glue("  Loading cached data: {cache_path}\n"))
    return(readRDS(cache_path))
  }
  cat(glue("  Downloading and processing data for cache: {cache_path}\n"))
  result <- tryCatch({
    data <- data_func()
    saveRDS(data, cache_path)
    data
  }, error = function(e) {
    cat(glue("  ⚠️ Data load failed for {cache_path}: {e$message}\n"))
    return(data.frame())
  })
  return(result)
}
# NFL Touchdown Prediction - Enhanced Data Collection Pipeline
# Using NFLVerse for comprehensive NFL data (2015-2024)

# Load required libraries
suppressPackageStartupMessages({
  library(nflfastR)
  library(nflreadr)
  library(tidyverse)
  library(jsonlite)
  library(lubridate)
  library(glue)
})

# Configuration
CONFIG <- list(
  seasons = 2023:2025,
  output_dir = "data/nfl_r_pipeline",
  current_season = 2025,
  current_week = 3,
  version = "1.0.0"
)


# Chunked, memory-efficient play-by-play data collection
collect_pbp_data <- function() {
  cat("🏈 Collecting Play-by-Play Data (2023-2025, chunked)...\n")
  all_pbp <- list()
  for (season in CONFIG$seasons) {
    cache_file <- glue("pbp_{season}_processed.rds")
    if (file.exists(cache_file)) {
      cat(glue("  Loading cached processed data for season {season}...\n"))
      pbp_season <- readRDS(cache_file)
    } else {
      cat(glue("  Loading and processing season {season}...\n"))
      pbp_season <- load_pbp(season)
      if (season == 2025) {
        pbp_season <- pbp_season %>% filter(week <= 3)
      }
      pbp_season <- pbp_season %>% filter(!is.na(play_type), play_type %in% c("pass", "run"), week <= 18)
      roster_season <- load_rosters(season) %>%
        select(season, team, player_id = gsis_id, position, depth_chart_position)
      pbp_season <- pbp_season %>%
        mutate(
          game_date = as.Date(game_date),
          game_week = week,
          season_type = case_when(
            week <= 18 ~ "REG",
            week <= 22 ~ "POST",
            TRUE ~ "PRE"
          ),
          any_td = touchdown == 1,
          passing_td = pass_touchdown == 1,
          rushing_td = rush_touchdown == 1,
          receiving_td = pass_touchdown == 1,
          field_position_value = case_when(
            yardline_100 <= 5 ~ "goal_line",
            yardline_100 <= 10 ~ "red_zone_inner",
            yardline_100 <= 20 ~ "red_zone_outer", 
            yardline_100 <= 40 ~ "plus_territory",
            yardline_100 <= 60 ~ "midfield",
            TRUE ~ "own_territory"
          ),
          situation = case_when(
            down == 1 & ydstogo <= 3 ~ "short_yardage",
            down == 1 & ydstogo > 10 ~ "long_distance",
            down == 2 & ydstogo <= 3 ~ "manageable",
            down == 3 & ydstogo <= 3 ~ "short_conversion", 
            down == 3 & ydstogo > 7 ~ "long_conversion",
            down == 4 ~ "fourth_down",
            TRUE ~ "standard"
          ),
          explosive_play = case_when(
            play_type == "pass" & yards_gained >= 20 ~ 1,
            play_type == "run" & yards_gained >= 15 ~ 1,
            TRUE ~ 0
          ),
          yac_opportunity = if_else(
            play_type == "pass" & air_yards <= 5 & !is.na(yards_after_catch), 1, 0
          ),
          score_differential = posteam_score - defteam_score,
          time_remaining_game = case_when(
            qtr <= 4 ~ (4 - qtr) * 15 + (15 - (game_seconds_remaining %% 900) / 60),
            TRUE ~ game_seconds_remaining / 60
          ),
          weather_impact = case_when(
            temp <= 32 ~ "cold",
            temp >= 80 ~ "hot",
            wind >= 15 ~ "windy", 
            !is.na(weather) & str_detect(tolower(weather), "rain|snow") ~ "precipitation",
            TRUE ~ "ideal"
          )
        ) %>%
        left_join(roster_season, by = c("season", "posteam" = "team")) %>%
        filter(season_type == "REG") %>%
        select(
          game_id, game_date, season, week, posteam, defteam, 
          play_id, drive, qtr, time, down, ydstogo, yardline_100,
          field_position_value, situation, score_differential, time_remaining_game,
          play_type, yards_gained, shotgun, no_huddle,
          passer_player_id, passer_player_name,
          rusher_player_id, rusher_player_name, 
          receiver_player_id, receiver_player_name,
          any_td, passing_td, rushing_td, receiving_td,
          complete_pass, interception, fumble_lost, sack,
          air_yards, yards_after_catch, explosive_play, yac_opportunity,
          weather_impact, temp, wind, weather,
          ep, epa, wp, wpa,
          position, depth_chart_position
        )
      saveRDS(pbp_season, cache_file)
      cat(glue("  Cached processed data for season {season} to {cache_file}\n"))
    }
    all_pbp[[as.character(season)]] <- pbp_season
    rm(pbp_season)
    gc()
  }
  enhanced_pbp <- bind_rows(all_pbp)
  cat("✅ PBP Data processed:", nrow(enhanced_pbp), "plays from", 
      length(unique(enhanced_pbp$season)), "seasons\n")
  return(enhanced_pbp)

    # Clean up and standardize
    filter(season_type == "REG") %>%  # Regular season only for now
    select(
      # Game info
      game_id, game_date, season, week, posteam, defteam, 
      
      # Play context
      play_id, drive, qtr, time, down, ydstogo, yardline_100,
      field_position_value, situation, score_differential, time_remaining_game,
      
      # Play details
      play_type, yards_gained, shotgun, no_huddle,
      
      # Players
      passer_player_id, passer_player_name,
      rusher_player_id, rusher_player_name, 
      receiver_player_id, receiver_player_name,
      
      # Outcomes
      any_td, passing_td, rushing_td, receiving_td,
      complete_pass, interception, fumble_lost, sack,
      
      # Advanced metrics
      air_yards, yards_after_catch, explosive_play, yac_opportunity,
      
      # Context
      weather_impact, temp, wind, weather,
      
      # Expected values
      ep, epa, wp, wpa
    )
  
  cat("✅ PBP Data processed:", nrow(enhanced_pbp), "plays from", 
      length(unique(enhanced_pbp$season)), "seasons\n")
  
  return(enhanced_pbp)
}

# Enhanced roster and player data
collect_roster_data <- function() {
  cat("👥 Collecting Roster Data...\n")
  
  roster_data <- safe_load_data(
    data_func = function() load_rosters(CONFIG$seasons),
    cache_file = "rosters_2023_2025"
  )
  
  # Clean and enhance roster data
  enhanced_rosters <- roster_data %>%
    filter(!is.na(position), position %in% c("QB", "RB", "WR", "TE")) %>%
    mutate(
      # Standardize positions
      position_group = case_when(
        position == "QB" ~ "QB",
        position %in% c("RB", "FB") ~ "RB", 
        position %in% c("WR") ~ "WR",
        position %in% c("TE") ~ "TE",
        TRUE ~ "OTHER"
      ),
      
      # Player identifiers
      player_key = paste(gsis_id, full_name, sep = "_"),
      
      # Physical attributes
      height_inches = as.numeric(str_extract(height, "\\d+")) * 12 + 
                     as.numeric(str_extract(height, "(?<=-)\\d+")),
      weight_lbs = as.numeric(weight),
      
      # Experience level
      experience_tier = case_when(
        years_exp <= 2 ~ "rookie",
        years_exp <= 5 ~ "young", 
        years_exp <= 10 ~ "veteran",
        TRUE ~ "elder"
      )
    ) %>%
    select(
      season, team, player_id = gsis_id, full_name, position, position_group,
      depth_chart_position, jersey_number, status,
      height_inches, weight_lbs, years_exp, experience_tier,
      birth_date, college, player_key
    )
  
  cat("✅ Roster Data processed:", nrow(enhanced_rosters), "player-seasons\n")
  
  return(enhanced_rosters)
}

# Injury data collection
collect_injury_data <- function() {
  cat("🏥 Collecting Injury Data...\n")
  
  injury_data <- safe_load_data(
    data_func = function() load_injuries(CONFIG$seasons),
    cache_file = "injuries_2023_2025"
  )
  
  # Process injury data for availability predictions, handle missing columns gracefully
  if (!"report_status" %in% names(injury_data)) injury_data$report_status <- NA
  if (!"body_part" %in% names(injury_data)) injury_data$body_part <- NA
  if (!"date" %in% names(injury_data)) injury_data$date <- NA
  if (!"gsis_id" %in% names(injury_data)) injury_data$gsis_id <- NA
  if (!"full_name" %in% names(injury_data)) injury_data$full_name <- NA
  if (!"team" %in% names(injury_data)) injury_data$team <- NA
  if (!"season" %in% names(injury_data)) injury_data$season <- NA
  if (!"week" %in% names(injury_data)) injury_data$week <- NA
  if (!"date_modified" %in% names(injury_data)) injury_data$date_modified <- NA

  enhanced_injuries <- injury_data %>%
    filter(!is.na(report_status)) %>%
    mutate(
      # Injury severity scoring
      injury_severity = case_when(
        str_detect(tolower(report_status), "out") ~ 4,
        str_detect(tolower(report_status), "doubtful") ~ 3,
        str_detect(tolower(report_status), "questionable") ~ 2, 
        str_detect(tolower(report_status), "probable") ~ 1,
        TRUE ~ 0
      ),
      # Body part categorization (skip if body_part is NA)
      injury_category = ifelse(is.na(body_part), NA_character_, case_when(
        str_detect(tolower(body_part), "ankle|foot|toe") ~ "lower_extremity",
        str_detect(tolower(body_part), "knee|thigh|hamstring|quad") ~ "leg",
        str_detect(tolower(body_part), "shoulder|arm|hand|wrist") ~ "upper_extremity", 
        str_detect(tolower(body_part), "back|hip|groin") ~ "core",
        str_detect(tolower(body_part), "head|concussion") ~ "head",
        TRUE ~ "other"
      )),
      week_date = as.Date(date)
    ) %>%
    select(
      season, team, week, week_date, player_id = gsis_id, full_name,
      report_status, body_part, injury_severity, injury_category,
      date_modified
    )
  cat("✅ Injury Data processed:", nrow(enhanced_injuries), "injury reports\n")
  return(enhanced_injuries)
}

# Snap count data for usage analysis
collect_snap_data <- function() {
  cat("⏱️ Collecting Snap Count Data...\n")
  
  snap_data <- safe_load_data(
    data_func = function() load_snap_counts(CONFIG$seasons),
    cache_file = "snaps_2023_2025"
  )
  
  # Process snap counts for usage metrics
  enhanced_snaps <- snap_data %>%
    filter(!is.na(offense_snaps)) %>%
    mutate(
      snap_share = offense_snaps / offense_pct * 100,
      usage_tier = case_when(
        snap_share >= 80 ~ "bell_cow",
        snap_share >= 60 ~ "featured",
        snap_share >= 40 ~ "committee",
        snap_share >= 20 ~ "rotational",
        TRUE ~ "limited"
      )
    ) %>%
    select(
      season, team, week, player_id = pfr_player_id, player, position,
      offense_snaps, offense_pct, snap_share, usage_tier
    )
  
  cat("✅ Snap Count Data processed:", nrow(enhanced_snaps), "player-weeks\n")
  
  return(enhanced_snaps)
}

# Advanced stats from Pro Football Reference
collect_advanced_stats <- function() {
  cat("📊 Collecting Advanced Stats...\n")
  
  # This might fail for some seasons, so we'll handle gracefully
  tryCatch({
    adv_stats <- safe_load_data(
      data_func = function() load_pfr_advstats(
        CONFIG$seasons, 
        stat_type = c("rush", "rec", "pass")
      ),
      cache_file = "advanced_stats_2023_2025"
    )
    
    cat("✅ Advanced Stats collected successfully\n")
    return(adv_stats)
  }, error = function(e) {
    cat("⚠️ Advanced Stats collection failed:", e$message, "\n")
    cat("   Continuing without advanced stats...\n")
    return(data.frame())  # Return empty data frame
  })
}

# Current week schedule and matchups
collect_current_schedule <- function() {
  cat("📅 Collecting Current Season Schedule...\n")
  
  schedule_data <- safe_load_data(
    data_func = function() load_schedules(CONFIG$current_season),
    cache_file = glue("schedule_{CONFIG$current_season}")
  )
  
  # Focus on current and upcoming weeks
  # Add missing columns as NA if not present
  needed_cols <- c("roof", "surface", "temp", "wind", "weather", "away_score", "home_score", "result", "total")
  for (col in needed_cols) {
    if (!col %in% names(schedule_data)) schedule_data[[col]] <- NA
  }
  current_schedule <- schedule_data %>%
    filter(week >= CONFIG$current_week, week <= 3) %>%
    mutate(
      game_date = as.Date(gameday),
      matchup = glue("{away_team} @ {home_team}"),
      # Game environment factors
      is_divisional = case_when(
        (home_team %in% c("BUF", "MIA", "NYJ", "NE") & away_team %in% c("BUF", "MIA", "NYJ", "NE")) |
        (home_team %in% c("PIT", "BAL", "CIN", "CLE") & away_team %in% c("PIT", "BAL", "CIN", "CLE")) |
        (home_team %in% c("TEN", "IND", "HOU", "JAX") & away_team %in% c("TEN", "IND", "HOU", "JAX")) |
        (home_team %in% c("KC", "LV", "LAC", "DEN") & away_team %in% c("KC", "LV", "LAC", "DEN")) ~ TRUE,
        TRUE ~ FALSE
      ),
      is_primetime = hour(as.POSIXct(gametime, format = "%H:%M")) >= 19,
      game_importance = case_when(
        week >= 15 ~ "high",      # Late season
        is_divisional ~ "medium",
        TRUE ~ "standard"
      )
    ) %>%
    select(
      game_id, season, week, game_date, gameday, gametime,
      home_team, away_team, matchup,
      is_divisional, is_primetime, game_importance,
      roof, surface, temp, wind, weather,
      away_score, home_score, result, total
    )
  cat("✅ Schedule Data processed:", nrow(current_schedule), "games\n")
  return(current_schedule)
}

# Depth chart data (if available)
collect_depth_charts <- function() {
  cat("📋 Collecting Depth Chart Data...\n")
  
  tryCatch({
    depth_data <- safe_load_data(
      data_func = function() load_depth_charts(CONFIG$seasons),
      cache_file = "depth_charts_2023_2025"
    )
    
    enhanced_depth <- depth_data %>%
      mutate(
        depth_rank = case_when(
          depth_team == 1 ~ "starter",
          depth_team == 2 ~ "backup", 
          depth_team == 3 ~ "third_string",
          TRUE ~ "depth"
        ),
        position_group = case_when(
          position %in% c("QB") ~ "QB",
          position %in% c("RB", "FB") ~ "RB",
          position %in% c("WR", "FL", "SE") ~ "WR", 
          position %in% c("TE") ~ "TE",
          TRUE ~ "OTHER"
        )
      ) %>%
      filter(position_group != "OTHER") %>%
      select(
        season, team, week, player_id = gsis_id, full_name, 
        position, position_group, depth_team, depth_rank
      )
    
    cat("✅ Depth Chart Data processed:", nrow(enhanced_depth), "entries\n")
    return(enhanced_depth)
  }, error = function(e) {
    cat("⚠️ Depth Chart collection failed:", e$message, "\n")
    return(data.frame())
  })
}

# Main data collection orchestrator
collect_all_data <- function(force_refresh = FALSE) {
  cat("🚀 Starting NFL Data Collection Pipeline\n")
  cat("=====================================\n")
  
  start_time <- Sys.time()
  
  # Collect all data sources
  data_collection <- list()
  
  data_collection$pbp <- collect_pbp_data()
  data_collection$rosters <- collect_roster_data() 
  data_collection$injuries <- collect_injury_data()
  data_collection$snaps <- collect_snap_data()
  data_collection$advanced_stats <- collect_advanced_stats()
  data_collection$schedule <- collect_current_schedule()
  data_collection$depth_charts <- collect_depth_charts()
  
  # Create metadata
  metadata <- list(
    version = CONFIG$version,
    collected_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ"),
    seasons_covered = CONFIG$seasons,
    current_season = CONFIG$current_season,
    current_week = CONFIG$current_week,
    data_sources = names(data_collection),
    row_counts = sapply(data_collection, nrow),
    collection_time_minutes = as.numeric(difftime(Sys.time(), start_time, units = "mins"))
  )
  
  # Save master data collection
  collection_output <- list(
    metadata = metadata,
    data = data_collection
  )
  
  # Save as both RDS and JSON
  saveRDS(collection_output, file.path(CONFIG$output_dir, "master_data_collection.rds"))
  
  # Save metadata as JSON for Node.js consumption
  write_json(metadata, file.path(CONFIG$output_dir, "collection_metadata.json"), 
             pretty = TRUE, auto_unbox = TRUE)
  
  cat("\n🎉 Data Collection Complete!\n")
  cat("=====================================\n")
  cat(glue("Total time: {round(metadata$collection_time_minutes, 2)} minutes\n"))
  cat(glue("Data saved to: {CONFIG$output_dir}\n"))
  cat("\nData Summary:\n")
  
  for (source in names(metadata$row_counts)) {
    count_str <- formatC(metadata$row_counts[[source]], format = 'd', big.mark = ',')
    cat(glue("  {source}: {count_str} rows\n"))
  }
  
  return(collection_output)
}

# Validation function
validate_data_quality <- function(data_collection) {
  cat("\n🔍 Validating Data Quality...\n")
  
  validation_results <- list()
  
  # PBP validation
  pbp_data <- data_collection$data$pbp
  validation_results$pbp <- list(
    total_plays = nrow(pbp_data),
    td_plays = sum(pbp_data$any_td, na.rm = TRUE),
    td_rate = mean(pbp_data$any_td, na.rm = TRUE),
    seasons_covered = length(unique(pbp_data$season)),
    teams_covered = length(unique(pbp_data$posteam)),
    latest_game = max(pbp_data$game_date, na.rm = TRUE)
  )
  
  # Check for key data quality issues
  quality_checks <- list(
    missing_player_ids = sum(is.na(pbp_data$receiver_player_id) & 
                            pbp_data$play_type == "pass") / 
                         sum(pbp_data$play_type == "pass"),
    missing_yards_gained = sum(is.na(pbp_data$yards_gained)) / nrow(pbp_data),
    unrealistic_plays = sum(pbp_data$yards_gained > 99 | pbp_data$yards_gained < -50, 
                           na.rm = TRUE) / nrow(pbp_data)
  )
  
  validation_results$quality_checks <- quality_checks
  
  # Print validation summary
  cat("✅ PBP Data Quality:\n")
  total_plays_str <- formatC(validation_results$pbp$total_plays, format = 'd', big.mark = ',')
  td_plays_str <- formatC(validation_results$pbp$td_plays, format = 'd', big.mark = ',')
  cat(glue("   Total plays: {total_plays_str}\n"))
  cat(glue("   TD plays: {td_plays_str} ({round(validation_results$pbp$td_rate*100,2)}%)\n"))
  cat(glue("   Seasons: {validation_results$pbp$seasons_covered}\n"))
  cat(glue("   Teams: {validation_results$pbp$teams_covered}\n"))
  cat(glue("   Latest game: {validation_results$pbp$latest_game}\n"))

  cat("\n⚠️ Data Quality Flags:\n")
  cat(glue("   Missing player IDs: {round(quality_checks$missing_player_ids*100,2)}%\n"))
  cat(glue("   Missing yards: {round(quality_checks$missing_yards_gained*100,2)}%\n"))
  cat(glue("   Unrealistic plays: {round(quality_checks$unrealistic_plays*100,2)}%\n"))

  return(validation_results)
}

# Quick test function
quick_test <- function() {
  cat("🧪 Running Quick Test...\n")
  
  # Test with just 2023 data
  test_pbp <- load_pbp(2023) %>%
    filter(season_type == "REG", week <= 3) %>%
    head(1000)
  
  cat(glue("✅ Quick test successful: {nrow(test_pbp)} plays loaded\n"))
  
  # Test touchdown extraction
  tds <- test_pbp %>%
    filter(touchdown == 1) %>%
    count(receiver_player_name, sort = TRUE) %>%
    head(10)
  
  cat("Top TD scorers in test data:\n")
  print(tds)
  
  return(TRUE)
}

# Main execution
if (!interactive()) {
  # Run data collection
  main_data <- collect_all_data()
  
  # Validate data quality
  validation <- validate_data_quality(main_data)
  
  cat("\n🏁 Pipeline execution complete!\n")
}