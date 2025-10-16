# NFL Receiving Props - LEAK-PROOF Backtesting
# 100% Temporal Safety: Only uses data available before each game
# Walk-forward validation with strict boundaries

suppressPackageStartupMessages({
  library(tidyverse)
  library(glue)
  library(jsonlite)
  library(lubridate)
})

cat("🔒 NFL RECEIVING PROPS - LEAK-PROOF BACKTEST\n")
cat("=============================================\n\n")

# Load temporal validation framework
source("scripts/nfl-receiving-props/00_temporal_validation.R")

# Load data
DATA_DIR <- "data/nfl_receiving_props"

if (!file.exists(file.path(DATA_DIR, "pbp_receiving.rds"))) {
  stop("❌ Data not found. Run 01_collect_receiving_data.R first")
}

pbp_data <- readRDS(file.path(DATA_DIR, "pbp_receiving.rds"))
player_stats <- readRDS(file.path(DATA_DIR, "player_season_stats.rds"))

cat(glue("✅ Loaded {nrow(pbp_data)} plays\n"))
cat(glue("✅ Loaded stats for {nrow(player_stats)} player-weeks\n\n"))

# ============================================================================
# LEAK-PROOF BACKTEST CONFIGURATION
# ============================================================================

BACKTEST_CONFIG <- list(
  # Test on 2024 weeks 10-18 (holdout)
  test_season = 2024,
  test_weeks = 10:18,
  
  # Each test week trains on ALL PRIOR weeks only
  # Week 10 test: train on 2023 + 2024 weeks 1-9
  # Week 11 test: train on 2023 + 2024 weeks 1-10
  # etc.
  
  # Simulation parameters
  n_sims = 50000,
  
  # Edge thresholds to test
  edge_thresholds = c(0.03, 0.05, 0.07, 0.10),
  
  # Minimum games for player inclusion
  min_games = 3,
  
  # Props to backtest
  props = list(
    list(stat = "receptions", lines = c(2.5, 3.5, 4.5, 5.5, 6.5, 7.5)),
    list(stat = "receiving_yards", lines = seq(25.5, 95.5, by = 10))
  )
)

cat("🎯 Backtest Configuration:\n")
cat(glue("  Test season: {BACKTEST_CONFIG$test_season}\n"))
cat(glue("  Test weeks: {min(BACKTEST_CONFIG$test_weeks)} to {max(BACKTEST_CONFIG$test_weeks)}\n"))
cat(glue("  Simulations: {BACKTEST_CONFIG$n_sims:,}\n"))
cat(glue("  Edge thresholds: {paste(BACKTEST_CONFIG$edge_thresholds * 100, collapse='%, ')}%\n"))
cat(glue("  Min games: {BACKTEST_CONFIG$min_games}\n\n"))

# ============================================================================
# CREATE WALK-FORWARD SPLITS (Each split trains on prior weeks only)
# ============================================================================

cat("📅 Creating walk-forward splits...\n")
splits <- create_walkforward_splits(
  season = BACKTEST_CONFIG$test_season,
  start_week = min(BACKTEST_CONFIG$test_weeks),
  end_week = max(BACKTEST_CONFIG$test_weeks)
)
cat(glue("   Created {length(splits)} temporal splits\n\n"))

# ============================================================================
# HELPER: Calculate rolling stats with temporal safety
# ============================================================================

get_player_features_safe <- function(player_name, team, game_date, pbp_historical) {
  
  # CRITICAL: Only use games BEFORE target game
  player_history <- pbp_historical %>%
    filter(
      receiver_player_name == player_name,
      posteam == team,
      game_date < as.Date(game_date)  # STRICT: Before game date
    ) %>%
    arrange(desc(game_date))
  
  if (nrow(player_history) < 3) {
    return(NULL)  # Not enough history
  }
  
  # Calculate rolling averages (L5, L10)
  last_5 <- head(player_history, 5)
  last_10 <- head(player_history, 10)
  
  list(
    player = player_name,
    team = team,
    games_history = nrow(player_history),
    
    # L5 averages
    l5_targets = mean(last_5$targets_game, na.rm = TRUE),
    l5_receptions = mean(last_5$receptions_game, na.rm = TRUE),
    l5_yards = mean(last_5$rec_yards_game, na.rm = TRUE),
    l5_catch_rate = sum(last_5$receptions_game) / sum(last_5$targets_game),
    
    # L10 averages
    l10_targets = mean(last_10$targets_game, na.rm = TRUE),
    l10_receptions = mean(last_10$receptions_game, na.rm = TRUE),
    l10_yards = mean(last_10$rec_yards_game, na.rm = TRUE),
    l10_catch_rate = sum(last_10$receptions_game) / sum(last_10$targets_game),
    
    # Season totals
    season_targets = sum(player_history$targets_game, na.rm = TRUE),
    season_receptions = sum(player_history$receptions_game, na.rm = TRUE),
    season_yards = sum(player_history$rec_yards_game, na.rm = TRUE)
  )
}

# ============================================================================
# HELPER: Simulate props for player
# ============================================================================

simulate_player_props <- function(features, n_sims = 50000) {
  
  # Simple baseline model (will enhance in Phase 2)
  # Target distribution: Poisson
  # Catch rate: Beta-binomial
  # Yards: Gamma
  
  lambda_targets <- features$l5_targets
  catch_rate <- features$l5_catch_rate
  yards_per_rec <- features$l5_yards / features$l5_receptions
  
  # Handle NAs
  if (is.na(lambda_targets) || lambda_targets < 1) lambda_targets <- 4
  if (is.na(catch_rate) || catch_rate < 0.3) catch_rate <- 0.65
  if (is.na(yards_per_rec) || yards_per_rec < 5) yards_per_rec <- 11
  
  # Simulate
  targets_sim <- rpois(n_sims, lambda = lambda_targets)
  receptions_sim <- rbinom(n_sims, size = targets_sim, prob = catch_rate)
  
  yards_sim <- sapply(receptions_sim, function(recs) {
    if (recs == 0) return(0)
    sum(rgamma(recs, shape = 2, rate = 2 / yards_per_rec))
  })
  
  list(
    targets = targets_sim,
    receptions = receptions_sim,
    yards = yards_sim
  )
}

# ============================================================================
# MAIN BACKTEST LOOP
# ============================================================================

all_results <- list()

for (split_idx in seq_along(splits)) {
  split <- splits[[split_idx]]
  boundary <- split$boundary
  
  cat(glue("\n{'='*60}\n"))
  cat(glue("SPLIT {split_idx}/{length(splits)}: {split$name}\n"))
  cat(glue("{boundary$description}\n"))
  cat(glue("{'='*60}\n\n"))
  
  # ============================================================================
  # STEP 1: Create training data (BEFORE test week)
  # ============================================================================
  
  train_data <- pbp_data %>%
    filter(
      season < boundary$season | 
      (season == boundary$season & week < boundary$week)
    )
  
  cat(glue("📊 Training data: {nrow(train_data)} plays\n"))
  
  # VALIDATE: No temporal leakage
  validate_temporal_safety(train_data, boundary, "training_pbp")
  
  # ============================================================================
  # STEP 2: Get test games (ONLY target week)
  # ============================================================================
  
  test_games <- pbp_data %>%
    filter(
      season == boundary$season,
      week == boundary$week
    ) %>%
    group_by(game_id, receiver_player_name, posteam, game_date) %>%
    summarise(
      actual_targets = sum(!is.na(pass_attempt)),
      actual_receptions = sum(complete_pass, na.rm = TRUE),
      actual_yards = sum(yards_gained, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    filter(!is.na(receiver_player_name), receiver_player_name != "")
  
  cat(glue("🎯 Test games: {length(unique(test_games$game_id))} games, "))
  cat(glue("{nrow(test_games)} player-games\n\n"))
  
  if (nrow(test_games) == 0) {
    cat("⚠️  No test data for this week, skipping...\n")
    next
  }
  
  # VALIDATE: Test data is from correct week only
  validate_temporal_safety(test_games, boundary, "test_games")
  
  # VALIDATE: No overlap between train and test
  validate_backtest_split(train_data, test_games, boundary)
  
  # ============================================================================
  # STEP 3: Generate predictions for each player (using ONLY prior data)
  # ============================================================================
  
  predictions <- list()
  
  for (row_idx in 1:nrow(test_games)) {
    player_game <- test_games[row_idx, ]
    
    # Get player features using ONLY games before this one
    features <- get_player_features_safe(
      player_name = player_game$receiver_player_name,
      team = player_game$posteam,
      game_date = player_game$game_date,
      pbp_historical = train_data  # Only training data!
    )
    
    if (is.null(features)) {
      next  # Skip if not enough history
    }
    
    # Simulate props
    sims <- simulate_player_props(features, n_sims = BACKTEST_CONFIG$n_sims)
    
    # Calculate probabilities for various lines
    for (prop_config in BACKTEST_CONFIG$props) {
      stat_name <- prop_config$stat
      actual_value <- player_game[[paste0("actual_", stat_name)]]
      
      for (line in prop_config$lines) {
        # Model probability of OVER
        if (stat_name == "receptions") {
          model_prob <- mean(sims$receptions > line)
        } else if (stat_name == "receiving_yards") {
          model_prob <- mean(sims$yards > line)
        }
        
        # Skip if probability too extreme (no value)
        if (model_prob < 0.10 || model_prob > 0.90) next
        
        # Simulate market odds (placeholder - will use real odds later)
        # Assume 5% vig, fair line
        market_prob <- model_prob + 0.025  # Slight vig
        
        # Calculate edge
        edge <- model_prob - market_prob
        
        # Record prediction
        predictions[[length(predictions) + 1]] <- list(
          week = boundary$week,
          player = player_game$receiver_player_name,
          team = player_game$posteam,
          game_date = as.character(player_game$game_date),
          stat = stat_name,
          line = line,
          model_prob = model_prob,
          market_prob = market_prob,
          edge = edge,
          actual_value = actual_value,
          hit = actual_value > line,
          games_history = features$games_history
        )
      }
    }
    
    if (row_idx %% 50 == 0) {
      cat(glue("  Processed {row_idx}/{nrow(test_games)} players\n"))
    }
  }
  
  split_results <- bind_rows(predictions)
  cat(glue("\n✅ Generated {nrow(split_results)} predictions for week {boundary$week}\n"))
  
  all_results[[length(all_results) + 1]] <- split_results
}

# ============================================================================
# COMBINE ALL RESULTS
# ============================================================================

cat("\n\n📊 COMBINING BACKTEST RESULTS\n")
cat("==============================\n\n")

backtest_results <- bind_rows(all_results)

cat(glue("Total predictions: {nrow(backtest_results)}\n"))
cat(glue("Test weeks: {paste(unique(backtest_results$week), collapse=', ')}\n"))
cat(glue("Unique players: {length(unique(backtest_results$player))}\n\n"))

# ============================================================================
# PERFORMANCE ANALYSIS BY EDGE THRESHOLD
# ============================================================================

cat("🎯 PERFORMANCE BY EDGE THRESHOLD\n")
cat("=================================\n\n")

for (min_edge in BACKTEST_CONFIG$edge_thresholds) {
  bets <- backtest_results %>%
    filter(abs(edge) >= min_edge)
  
  if (nrow(bets) == 0) next
  
  wins <- sum(bets$hit)
  losses <- nrow(bets) - wins
  win_rate <- wins / nrow(bets)
  
  # Calculate ROI (assuming -110 odds, simplified)
  roi <- (wins * 0.91 - losses * 1.0) / nrow(bets)
  
  cat(glue("Edge >= {min_edge * 100}%:\n"))
  cat(glue("  Bets: {nrow(bets)}\n"))
  cat(glue("  Wins: {wins} ({scales::percent(win_rate, accuracy = 0.1)})\n"))
  cat(glue("  ROI: {scales::percent(roi, accuracy = 0.1)}\n"))
  cat(glue("  Units: {sprintf('%+.2f', roi * nrow(bets))}\n\n"))
}

# ============================================================================
# SAVE RESULTS
# ============================================================================

output_file <- file.path(DATA_DIR, "backtest_results_leakproof.rds")
saveRDS(backtest_results, output_file)
cat(glue("💾 Saved results to {output_file}\n\n"))

# Save summary
summary <- list(
  test_season = BACKTEST_CONFIG$test_season,
  test_weeks = BACKTEST_CONFIG$test_weeks,
  total_predictions = nrow(backtest_results),
  unique_players = length(unique(backtest_results$player)),
  date_generated = Sys.time()
)

summary_file <- file.path(DATA_DIR, "backtest_summary.json")
write_json(summary, summary_file, pretty = TRUE, auto_unbox = TRUE)
cat(glue("📄 Saved summary to {summary_file}\n\n"))

cat("✅ LEAK-PROOF BACKTEST COMPLETE\n")
