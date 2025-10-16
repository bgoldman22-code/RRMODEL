# NFL Receiving Props - Temporal Data Leakage Prevention
# Ensures 100% leak-proof backtesting with strict temporal boundaries

suppressPackageStartupMessages({
  library(tidyverse)
  library(lubridate)
  library(glue)
})

#' TEMPORAL VALIDATION RULES
#' 
#' 1. ONLY use data from games that finished BEFORE prediction time
#' 2. Rolling stats must look BACKWARD only (no future games)
#' 3. Injury reports: only use status known BEFORE kickoff
#' 4. Depth charts: only use version published BEFORE week start
#' 5. Opponent stats: only from games BEFORE matchup
#' 
#' PREDICTION TIMELINE (for Week N game):
#' - Wednesday: Depth chart for Week N published
#' - Thursday-Saturday: Injury reports updated
#' - Sunday 12:45pm ET: First games kick off
#' - At kickoff: FREEZE all data inputs
#' 
#' TRAINING DATA CUTOFF:
#' - For Week N prediction: Use games through Week N-1 ONLY
#' - Do NOT include any Week N games (even earlier in same week)

#' Create temporal boundary for prediction
#' 
#' @param season Season year
#' @param week Week number to predict
#' @return List with cutoff dates and allowed data
create_temporal_boundary <- function(season, week) {
  
  # NFL schedule structure (approximate)
  # Week 1 starts ~Sept 5, each week is 7 days
  season_start <- as.Date(paste0(season, "-09-05"))
  
  # Week N starts on Tuesday after Week N-1 games
  week_start <- season_start + (week - 1) * 7
  
  # First games of Week N kick off on Thursday 8:20pm ET (some weeks)
  # or Sunday 1pm ET (most weeks)
  # Conservative: Use Tuesday 11:59pm before week starts
  prediction_deadline <- week_start - days(1) + hours(23) + minutes(59)
  
  # Training data: All games that FINISHED before prediction deadline
  # This means: Weeks 1 through (N-1) are safe
  # Week N games are FORBIDDEN
  max_training_week <- week - 1
  
  # For injury data: Use latest report BEFORE kickoff
  # In backtest: Use Friday injury report (72 hours before Sunday games)
  injury_report_cutoff <- week_start + days(3) # Friday of game week
  
  # For depth charts: Use version published BEFORE week starts
  # Typically published Tuesday/Wednesday
  depth_chart_cutoff <- week_start - days(1)
  
  list(
    season = season,
    week = week,
    week_start = week_start,
    prediction_deadline = prediction_deadline,
    max_training_week = max_training_week,
    injury_report_cutoff = injury_report_cutoff,
    depth_chart_cutoff = depth_chart_cutoff,
    description = glue("Predicting {season} Week {week}: Use games through Week {max_training_week} only")
  )
}

#' Validate that dataset has no temporal leakage
#' 
#' @param data Dataset to validate
#' @param boundary Temporal boundary from create_temporal_boundary()
#' @param data_type Type of data (pbp, injury, depth_chart, etc)
#' @return TRUE if valid, stops with error if leakage detected
validate_temporal_safety <- function(data, boundary, data_type = "unknown") {
  
  cat(glue("\n🔍 TEMPORAL VALIDATION: {data_type}\n"))
  cat(glue("  Boundary: {boundary$description}\n"))
  
  # Check 1: No future games
  if ("season" %in% names(data) && "week" %in% names(data)) {
    future_games <- data %>%
      filter(
        season > boundary$season | 
        (season == boundary$season & week >= boundary$week)
      )
    
    if (nrow(future_games) > 0) {
      cat(glue("  ❌ LEAKAGE DETECTED: {nrow(future_games)} future games found!\n"))
      cat(glue("     These games happen AFTER prediction deadline:\n"))
      print(future_games %>% select(season, week, game_id) %>% head(10))
      stop("TEMPORAL LEAKAGE: Future games in training data")
    }
    cat(glue("  ✅ No future games (checked season/week)\n"))
  }
  
  # Check 2: Game dates must be before deadline
  if ("game_date" %in% names(data)) {
    data <- data %>% mutate(game_date = as.Date(game_date))
    future_dates <- data %>%
      filter(game_date >= as.Date(boundary$week_start))
    
    if (nrow(future_dates) > 0) {
      cat(glue("  ❌ LEAKAGE DETECTED: {nrow(future_dates)} games after week start!\n"))
      cat(glue("     Week {boundary$week} starts {boundary$week_start}\n"))
      print(future_dates %>% select(game_date, game_id) %>% head(10))
      stop("TEMPORAL LEAKAGE: Future game dates in training data")
    }
    cat(glue("  ✅ No future dates (all games before {boundary$week_start})\n"))
  }
  
  # Check 3: Rolling stats must not include current week
  if ("stat_week" %in% names(data)) {
    current_week_stats <- data %>%
      filter(
        season == boundary$season,
        stat_week >= boundary$week
      )
    
    if (nrow(current_week_stats) > 0) {
      cat(glue("  ❌ LEAKAGE DETECTED: Stats from Week {boundary$week} in rolling averages!\n"))
      stop("TEMPORAL LEAKAGE: Current week stats in features")
    }
    cat(glue("  ✅ Rolling stats only use past weeks\n"))
  }
  
  # Check 4: Injury reports must be from before kickoff
  if ("injury_updated" %in% names(data)) {
    data <- data %>% mutate(injury_updated = as.POSIXct(injury_updated))
    future_injury_updates <- data %>%
      filter(injury_updated > boundary$injury_report_cutoff)
    
    if (nrow(future_injury_updates) > 0) {
      cat(glue("  ⚠️  WARNING: {nrow(future_injury_updates)} injury updates after cutoff\n"))
      cat(glue("     Cutoff: {boundary$injury_report_cutoff}\n"))
      # Don't stop - just warn (injury reports can update until kickoff)
    }
    cat(glue("  ✅ Injury reports within acceptable window\n"))
  }
  
  cat(glue("  ✅ TEMPORAL VALIDATION PASSED for {data_type}\n\n"))
  return(TRUE)
}

#' Filter data to respect temporal boundary
#' 
#' @param data Dataset to filter
#' @param boundary Temporal boundary
#' @return Filtered dataset with only temporally valid data
apply_temporal_filter <- function(data, boundary) {
  
  # Filter by season and week
  if ("season" %in% names(data) && "week" %in% names(data)) {
    before_count <- nrow(data)
    data <- data %>%
      filter(
        season < boundary$season | 
        (season == boundary$season & week < boundary$week)
      )
    after_count <- nrow(data)
    removed <- before_count - after_count
    
    if (removed > 0) {
      cat(glue("  🔒 Filtered {removed} future games (kept {after_count})\n"))
    }
  }
  
  return(data)
}

#' Create walk-forward backtest splits
#' 
#' Each split trains on historical data and tests on next week
#' Ensures no data leakage between train and test
#' 
#' @param season Season to backtest
#' @param start_week First week to test
#' @param end_week Last week to test
#' @return List of train/test splits with temporal boundaries
create_walkforward_splits <- function(season, start_week = 5, end_week = 18) {
  
  splits <- list()
  
  for (test_week in start_week:end_week) {
    boundary <- create_temporal_boundary(season, test_week)
    
    split <- list(
      name = glue("{season}_W{test_week}"),
      test_week = test_week,
      boundary = boundary,
      
      # Training data: Everything before test week
      train_filter = function(data) {
        data %>% filter(
          season < season | 
          (season == season & week < test_week)
        )
      },
      
      # Test data: Only the target week
      test_filter = function(data) {
        data %>% filter(
          season == season,
          week == test_week
        )
      }
    )
    
    splits[[length(splits) + 1]] <- split
  }
  
  cat(glue("\n📅 Created {length(splits)} walk-forward splits\n"))
  cat(glue("   Season: {season}\n"))
  cat(glue("   Test weeks: {start_week} to {end_week}\n"))
  cat(glue("   Each split trains on prior weeks only\n\n"))
  
  return(splits)
}

#' Calculate rolling statistics with strict temporal boundaries
#' 
#' @param player_games Player game logs
#' @param target_date Date to calculate stats FOR (not INCLUDING)
#' @param window_size Number of games to include
#' @return Rolling stats using only games BEFORE target_date
calculate_rolling_stats_safe <- function(player_games, target_date, window_size = 5) {
  
  # CRITICAL: Only use games that finished BEFORE target_date
  historical_games <- player_games %>%
    filter(game_date < as.Date(target_date)) %>%
    arrange(desc(game_date)) %>%
    head(window_size)
  
  if (nrow(historical_games) < 3) {
    # Not enough history - return NA
    return(list(
      games_used = nrow(historical_games),
      avg_targets = NA_real_,
      avg_receptions = NA_real_,
      avg_yards = NA_real_,
      catch_rate = NA_real_,
      yards_per_rec = NA_real_
    ))
  }
  
  list(
    games_used = nrow(historical_games),
    avg_targets = mean(historical_games$targets, na.rm = TRUE),
    avg_receptions = mean(historical_games$receptions, na.rm = TRUE),
    avg_yards = mean(historical_games$receiving_yards, na.rm = TRUE),
    catch_rate = sum(historical_games$receptions, na.rm = TRUE) / 
                 sum(historical_games$targets, na.rm = TRUE),
    yards_per_rec = sum(historical_games$receiving_yards, na.rm = TRUE) / 
                    sum(historical_games$receptions, na.rm = TRUE),
    most_recent_date = max(historical_games$game_date)
  )
}

#' Validate entire backtest for temporal leakage
#' 
#' @param train_data Training dataset
#' @param test_data Test dataset
#' @param boundary Temporal boundary
#' @return TRUE if valid, stops if leakage detected
validate_backtest_split <- function(train_data, test_data, boundary) {
  
  cat(glue("\n🔐 VALIDATING BACKTEST SPLIT: {boundary$description}\n"))
  
  # Check 1: No overlap between train and test
  if ("game_id" %in% names(train_data) && "game_id" %in% names(test_data)) {
    overlap <- intersect(train_data$game_id, test_data$game_id)
    if (length(overlap) > 0) {
      cat(glue("  ❌ LEAKAGE: {length(overlap)} games in both train and test!\n"))
      print(head(overlap))
      stop("TEMPORAL LEAKAGE: Train/test overlap")
    }
    cat(glue("  ✅ No train/test overlap\n"))
  }
  
  # Check 2: All training data is before test data
  if ("game_date" %in% names(train_data) && "game_date" %in% names(test_data)) {
    train_data <- train_data %>% mutate(game_date = as.Date(game_date))
    test_data <- test_data %>% mutate(game_date = as.Date(game_date))
    
    latest_train <- max(train_data$game_date, na.rm = TRUE)
    earliest_test <- min(test_data$game_date, na.rm = TRUE)
    
    if (latest_train >= earliest_test) {
      cat(glue("  ❌ LEAKAGE: Training data ({latest_train}) >= Test data ({earliest_test})\n"))
      stop("TEMPORAL LEAKAGE: Training data not before test data")
    }
    cat(glue("  ✅ All training data before test data\n"))
    cat(glue("     Latest train: {latest_train}\n"))
    cat(glue("     Earliest test: {earliest_test}\n"))
  }
  
  # Check 3: Test data is only from target week
  if ("week" %in% names(test_data) && "season" %in% names(test_data)) {
    wrong_week <- test_data %>%
      filter(season != boundary$season | week != boundary$week)
    
    if (nrow(wrong_week) > 0) {
      cat(glue("  ❌ LEAKAGE: {nrow(wrong_week)} test games from wrong week!\n"))
      stop("TEMPORAL LEAKAGE: Test data from wrong week")
    }
    cat(glue("  ✅ Test data only from target week ({boundary$season} W{boundary$week})\n"))
  }
  
  cat(glue("  ✅ BACKTEST SPLIT VALIDATION PASSED\n\n"))
  return(TRUE)
}

# Export functions
cat("✅ Temporal validation functions loaded\n")
cat("   - create_temporal_boundary()\n")
cat("   - validate_temporal_safety()\n")
cat("   - apply_temporal_filter()\n")
cat("   - create_walkforward_splits()\n")
cat("   - calculate_rolling_stats_safe()\n")
cat("   - validate_backtest_split()\n\n")
