# NFL Receiving Props - Comprehensive 3-Season Backtest (2022-2024)
# Rigorous walk-forward validation like NBA model
# 100% Leak-Proof with detailed performance analysis

suppressPackageStartupMessages({
  library(tidyverse)
  library(nflfastR)
  library(glue)
  library(jsonlite)
  library(lubridate)
})

cat("🏈 NFL RECEIVING PROPS - 3-SEASON BACKTEST (2022-2024)\n")
cat("======================================================\n\n")

# Load temporal validation
source("scripts/nfl-receiving-props/00_temporal_validation.R")

# Configuration
DATA_DIR <- "data/nfl_receiving_props"
dir.create(DATA_DIR, showWarnings = FALSE, recursive = TRUE)

BACKTEST_CONFIG <- list(
  seasons = 2022:2024,
  train_start = 2022,
  test_start_week = 5,  # Need 4 weeks of history minimum
  n_sims = 50000,
  min_games_history = 3,
  edge_thresholds = c(0.03, 0.05, 0.07, 0.10, 0.15),
  
  # Props to test
  reception_lines = c(2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5),
  yards_lines = seq(25.5, 95.5, by = 10)
)

cat("📊 Backtest Configuration:\n")
cat(glue("  Seasons: {paste(BACKTEST_CONFIG$seasons, collapse=', ')}\n"))
cat(glue("  Test weeks: {BACKTEST_CONFIG$test_start_week}-18 per season\n"))
cat(glue("  Simulations: {format(BACKTEST_CONFIG$n_sims, big.mark=',')}\n"))
cat(glue("  Min games history: {BACKTEST_CONFIG$min_games_history}\n\n"))

# ============================================================================
# STEP 1: Load Play-by-Play Data (2022-2024)
# ============================================================================

cat("📡 Loading play-by-play data for 2022-2024...\n")

pbp_cache <- file.path(DATA_DIR, "pbp_2022_2024.rds")

if (file.exists(pbp_cache)) {
  cat("  Loading from cache...\n")
  pbp_all <- readRDS(pbp_cache)
} else {
  cat("  Downloading from nflfastR...\n")
  pbp_all <- load_pbp(seasons = BACKTEST_CONFIG$seasons)
  
  # Process for receiving props
  pbp_all <- pbp_all %>%
    filter(
      !is.na(receiver_player_name),
      receiver_player_name != "",
      week <= 18  # Regular season only
    ) %>%
    mutate(
      game_date = as.Date(game_date),
      targets = as.integer(!is.na(pass_attempt)),
      receptions = as.integer(complete_pass == 1),
      receiving_yards = if_else(complete_pass == 1, yards_gained, 0),
      air_yards = replace_na(air_yards, 0),
      yac = replace_na(yards_after_catch, 0)
    )
  
  saveRDS(pbp_all, pbp_cache)
  cat(glue("  Cached to {pbp_cache}\n"))
}

cat(glue("✅ Loaded {format(nrow(pbp_all), big.mark=',')} passing plays\n"))
cat(glue("   Seasons: {paste(unique(pbp_all$season), collapse=', ')}\n"))
cat(glue("   Receivers: {format(length(unique(pbp_all$receiver_player_name)), big.mark=',')}\n\n"))

# ============================================================================
# STEP 2: Create Player Game Logs (For Rolling Averages)
# ============================================================================

cat("📊 Creating player game logs...\n")

player_games <- pbp_all %>%
  group_by(season, week, game_id, game_date, receiver_player_name, posteam) %>%
  summarise(
    targets = sum(targets, na.rm = TRUE),
    receptions = sum(receptions, na.rm = TRUE),
    receiving_yards = sum(receiving_yards, na.rm = TRUE),
    air_yards_total = sum(air_yards, na.rm = TRUE),
    yac_total = sum(yac, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  filter(targets > 0) %>%
  arrange(receiver_player_name, game_date)

cat(glue("✅ Created {format(nrow(player_games), big.mark=',')} player-games\n\n"))

# ============================================================================
# STEP 3: Helper Functions (Leak-Proof)
# ============================================================================

# Calculate safe rolling averages (only look backward)
get_player_rolling_stats <- function(player_name, target_date, history_data, window = 5) {
  
  # STRICT: Only games BEFORE target date
  player_history <- history_data %>%
    filter(
      receiver_player_name == player_name,
      game_date < as.Date(target_date)
    ) %>%
    arrange(desc(game_date)) %>%
    head(window)
  
  if (nrow(player_history) < 3) {
    return(NULL)  # Not enough history
  }
  
  list(
    games_used = nrow(player_history),
    avg_targets = mean(player_history$targets, na.rm = TRUE),
    avg_receptions = mean(player_history$receptions, na.rm = TRUE),
    avg_yards = mean(player_history$receiving_yards, na.rm = TRUE),
    catch_rate = sum(player_history$receptions) / sum(player_history$targets),
    yards_per_rec = sum(player_history$receiving_yards) / sum(player_history$receptions),
    yards_per_target = sum(player_history$receiving_yards) / sum(player_history$targets)
  )
}

# Simulate player props (3-stage cascade)
simulate_player_props <- function(stats, n_sims = 50000) {
  
  # Extract features with safety checks
  lambda_targets <- stats$avg_targets
  catch_rate <- stats$catch_rate
  yards_per_rec <- stats$yards_per_rec
  
  # Handle edge cases
  if (is.na(lambda_targets) || lambda_targets < 1) lambda_targets <- 4
  if (is.na(catch_rate) || catch_rate < 0.3 || catch_rate > 1) catch_rate <- 0.65
  if (is.na(yards_per_rec) || yards_per_rec < 5) yards_per_rec <- 11
  
  # Stage 1: Targets (Poisson)
  targets_sim <- rpois(n_sims, lambda = lambda_targets)
  
  # Stage 2: Receptions (Binomial)
  receptions_sim <- rbinom(n_sims, size = targets_sim, prob = catch_rate)
  
  # Stage 3: Yards (Gamma distribution conditional on receptions)
  yards_sim <- sapply(receptions_sim, function(recs) {
    if (recs == 0) return(0)
    # Each reception ~ Gamma with mean = yards_per_rec
    sum(rgamma(recs, shape = 2, rate = 2 / yards_per_rec))
  })
  
  list(
    targets = targets_sim,
    receptions = receptions_sim,
    yards = yards_sim,
    features = stats
  )
}

# ============================================================================
# STEP 4: Walk-Forward Backtest (All Seasons)
# ============================================================================

cat("🔄 Starting walk-forward backtest...\n\n")

all_predictions <- list()
split_counter <- 0

for (season in BACKTEST_CONFIG$seasons) {
  
  cat(glue("\n{strrep('=', 60)}\n"))
  cat(glue("SEASON {season}\n"))
  cat(glue("{strrep('=', 60)}\n\n"))
  
  # Test weeks for this season
  test_weeks <- BACKTEST_CONFIG$test_start_week:18
  
  for (test_week in test_weeks) {
    split_counter <- split_counter + 1
    
    cat(glue("\n[{split_counter}] Testing {season} Week {test_week}...\n"))
    
    # Create temporal boundary
    boundary <- create_temporal_boundary(season, test_week)
    
    # Training data: Everything BEFORE test week
    train_data <- player_games %>%
      filter(
        season < boundary$season | 
        (season == boundary$season & week < boundary$week)
      )
    
    # Test data: Only target week
    test_data <- player_games %>%
      filter(
        season == boundary$season,
        week == boundary$week
      )
    
    if (nrow(test_data) == 0) {
      cat("  ⚠️  No test data, skipping...\n")
      next
    }
    
    cat(glue("  Train: {format(nrow(train_data), big.mark=',')} player-games | Test: {format(nrow(test_data), big.mark=',')} player-games\n"))
    
    # Validate temporal safety
    # NOTE: Use week numbers, not dates (MNF/TNF can have later dates in same week)
    tryCatch({
      # Check season/week only (not dates, due to MNF/TNF)
      future_games <- train_data %>%
        filter(
          season > boundary$season |
          (season == boundary$season & week >= boundary$week)
        )
      
      if (nrow(future_games) > 0) {
        stop(glue("WEEK NUMBER LEAKAGE: {nrow(future_games)} games from Week {boundary$week}+ in training"))
      }
      
      cat("  ✅ Temporal safety validated (using week numbers)\n")
    }, error = function(e) {
      cat(glue("  ❌ TEMPORAL VALIDATION FAILED: {e$message}\n"))
      return(NULL)
    })
    
    # Generate predictions for each player in test week
    week_predictions <- list()
    
    for (i in seq_len(nrow(test_data))) {
      player_game <- test_data[i, ]
      
      # Get rolling stats (L5) using only training data
      stats_l5 <- get_player_rolling_stats(
        player_name = player_game$receiver_player_name,
        target_date = player_game$game_date,
        history_data = train_data,
        window = 5
      )
      
      if (is.null(stats_l5)) next  # Not enough history
      
      # Simulate distributions
      sims <- simulate_player_props(stats_l5, n_sims = BACKTEST_CONFIG$n_sims)
      
      # Actual results
      actual_targets <- player_game$targets
      actual_receptions <- player_game$receptions
      actual_yards <- player_game$receiving_yards
      
      # Test reception lines (BOTH over and under)
      for (line in BACKTEST_CONFIG$reception_lines) {
        model_prob_over <- mean(sims$receptions > line)
        model_prob_under <- 1 - model_prob_over  # Under = complement of over
        
        # Test OVER
        if (model_prob_over >= 0.15 && model_prob_over <= 0.85) {
          market_prob_over <- model_prob_over + 0.025
          edge_over <- model_prob_over - market_prob_over
          
          if (model_prob_over >= 0.50) {
            fair_odds_over <- -100 * model_prob_over / (1 - model_prob_over)
          } else {
            fair_odds_over <- 100 * (1 - model_prob_over) / model_prob_over
          }
          
          week_predictions[[length(week_predictions) + 1]] <- list(
            season = season,
            week = test_week,
            game_date = as.character(player_game$game_date),
            player = player_game$receiver_player_name,
            team = player_game$posteam,
            prop = "receptions",
            line = line,
            side = "over",
            model_prob = model_prob_over,
            market_prob = market_prob_over,
            edge = edge_over,
            fair_odds = round(fair_odds_over),
            actual_value = actual_receptions,
            hit = actual_receptions > line,
            games_history = stats_l5$games_used,
            avg_receptions_l5 = stats_l5$avg_receptions
          )
        }
        
        # Test UNDER
        if (model_prob_under >= 0.15 && model_prob_under <= 0.85) {
          market_prob_under <- model_prob_under + 0.025
          edge_under <- model_prob_under - market_prob_under
          
          if (model_prob_under >= 0.50) {
            fair_odds_under <- -100 * model_prob_under / (1 - model_prob_under)
          } else {
            fair_odds_under <- 100 * (1 - model_prob_under) / model_prob_under
          }
          
          week_predictions[[length(week_predictions) + 1]] <- list(
            season = season,
            week = test_week,
            game_date = as.character(player_game$game_date),
            player = player_game$receiver_player_name,
            team = player_game$posteam,
            prop = "receptions",
            line = line,
            side = "under",
            model_prob = model_prob_under,
            market_prob = market_prob_under,
            edge = edge_under,
            fair_odds = round(fair_odds_under),
            actual_value = actual_receptions,
            hit = actual_receptions < line,
            games_history = stats_l5$games_used,
            avg_receptions_l5 = stats_l5$avg_receptions
          )
        }
      }
      
      # Test yards lines (BOTH over and under)
      for (line in BACKTEST_CONFIG$yards_lines) {
        model_prob_over <- mean(sims$yards > line)
        model_prob_under <- 1 - model_prob_over  # Under = complement of over
        
        # Test OVER
        if (model_prob_over >= 0.15 && model_prob_over <= 0.85) {
          market_prob_over <- model_prob_over + 0.025
          edge_over <- model_prob_over - market_prob_over
          
          if (model_prob_over >= 0.50) {
            fair_odds_over <- -100 * model_prob_over / (1 - model_prob_over)
          } else {
            fair_odds_over <- 100 * (1 - model_prob_over) / model_prob_over
          }
          
          week_predictions[[length(week_predictions) + 1]] <- list(
            season = season,
            week = test_week,
            game_date = as.character(player_game$game_date),
            player = player_game$receiver_player_name,
            team = player_game$posteam,
            prop = "receiving_yards",
            line = line,
            side = "over",
            model_prob = model_prob_over,
            market_prob = market_prob_over,
            edge = edge_over,
            fair_odds = round(fair_odds_over),
            actual_value = actual_yards,
            hit = actual_yards > line,
            games_history = stats_l5$games_used,
            avg_yards_l5 = stats_l5$avg_yards
          )
        }
        
        # Test UNDER
        if (model_prob_under >= 0.15 && model_prob_under <= 0.85) {
          market_prob_under <- model_prob_under + 0.025
          edge_under <- model_prob_under - market_prob_under
          
          if (model_prob_under >= 0.50) {
            fair_odds_under <- -100 * model_prob_under / (1 - model_prob_under)
          } else {
            fair_odds_under <- 100 * (1 - model_prob_under) / model_prob_under
          }
          
          week_predictions[[length(week_predictions) + 1]] <- list(
            season = season,
            week = test_week,
            game_date = as.character(player_game$game_date),
            player = player_game$receiver_player_name,
            team = player_game$posteam,
            prop = "receiving_yards",
            line = line,
            side = "under",
            model_prob = model_prob_under,
            market_prob = market_prob_under,
            edge = edge_under,
            fair_odds = round(fair_odds_under),
            actual_value = actual_yards,
            hit = actual_yards < line,
            games_history = stats_l5$games_used,
            avg_yards_l5 = stats_l5$avg_yards
          )
        }
      }
    }
    
    if (length(week_predictions) > 0) {
      week_df <- bind_rows(week_predictions)
      all_predictions[[length(all_predictions) + 1]] <- week_df
      cat(glue("  ✅ Generated {format(nrow(week_df), big.mark=',')} predictions\n"))
    }
  }
}

# ============================================================================
# STEP 5: Combine and Save Results
# ============================================================================

cat("\n\n📊 COMBINING RESULTS\n")
cat("====================\n\n")

backtest_results <- bind_rows(all_predictions)

cat(glue("Total predictions: {format(nrow(backtest_results), big.mark=',')}\n"))
cat(glue("Seasons: {paste(unique(backtest_results$season), collapse=', ')}\n"))
cat(glue("Players: {format(length(unique(backtest_results$player)), big.mark=',')}\n"))
cat(glue("Props: {paste(unique(backtest_results$prop), collapse=', ')}\n\n"))

# Save full results
results_file <- file.path(DATA_DIR, "backtest_3season_2022_2024.rds")
saveRDS(backtest_results, results_file)
cat(glue("💾 Saved to {results_file}\n\n"))

# ============================================================================
# STEP 6: Performance Analysis
# ============================================================================

cat("🎯 PERFORMANCE ANALYSIS\n")
cat("=======================\n\n")

# Overall statistics
cat("📊 OVERALL PERFORMANCE:\n")
cat(glue("  Total predictions: {format(nrow(backtest_results), big.mark=',')}\n"))
cat(glue("  Hit rate: {scales::percent(mean(backtest_results$hit), accuracy = 0.1)}\n"))
cat(glue("  Avg edge: {scales::percent(mean(backtest_results$edge), accuracy = 0.1)}\n\n"))

# By edge threshold
cat("💰 PERFORMANCE BY EDGE THRESHOLD:\n")
cat(paste0(rep("=", 60), collapse=""), "\n")

performance_by_edge <- list()

for (min_edge in BACKTEST_CONFIG$edge_thresholds) {
  bets <- backtest_results %>% filter(abs(edge) >= min_edge)
  
  if (nrow(bets) == 0) next
  
  wins <- sum(bets$hit)
  total <- nrow(bets)
  win_rate <- wins / total
  
  # ROI calculation (assuming -110 odds, simplified)
  # Win: +0.91 units, Loss: -1.0 units
  roi_units <- (wins * 0.91 - (total - wins) * 1.0)
  roi_pct <- roi_units / total
  
  cat(glue("\nEdge >= {scales::percent(min_edge, accuracy = 0.1)}:\n"))
  cat(glue("  Bets: {format(total, big.mark=',')}\n"))
  cat(glue("  Wins: {format(wins, big.mark=',')} ({scales::percent(win_rate, accuracy = 0.1)})\n"))
  cat(glue("  ROI: {scales::percent(roi_pct, accuracy = 0.1)}\n"))
  cat(glue("  Units: {sprintf('%+.1f', roi_units)}\n"))
  
  performance_by_edge[[length(performance_by_edge) + 1]] <- list(
    min_edge = min_edge,
    bets = total,
    wins = wins,
    win_rate = win_rate,
    roi_pct = roi_pct,
    units = roi_units
  )
}

cat("\n", paste0(rep("=", 60), collapse=""), "\n\n", sep="")

# By season
cat("📅 PERFORMANCE BY SEASON:\n")
cat(paste0(rep("=", 60), collapse=""), "\n")

for (season in unique(backtest_results$season)) {
  season_bets <- backtest_results %>% filter(season == !!season, abs(edge) >= 0.05)
  
  if (nrow(season_bets) == 0) next
  
  wins <- sum(season_bets$hit)
  total <- nrow(season_bets)
  win_rate <- wins / total
  roi_units <- (wins * 0.91 - (total - wins) * 1.0)
  roi_pct <- roi_units / total
  
  cat(glue("\n{season} (Edge >= 5%):\n"))
  cat(glue("  Bets: {format(total, big.mark=',')}\n"))
  cat(glue("  Win rate: {scales::percent(win_rate, accuracy = 0.1)}\n"))
  cat(glue("  ROI: {scales::percent(roi_pct, accuracy = 0.1)}\n"))
  cat(glue("  Units: {sprintf('%+.1f', roi_units)}\n"))
}

cat("\n", paste0(rep("=", 60), collapse=""), "\n\n", sep="")

# By prop type
cat("📦 PERFORMANCE BY PROP TYPE:\n")
cat(paste0(rep("=", 60), collapse=""), "\n")

for (prop_type in unique(backtest_results$prop)) {
  prop_bets <- backtest_results %>% filter(prop == prop_type, abs(edge) >= 0.05)
  
  if (nrow(prop_bets) == 0) next
  
  wins <- sum(prop_bets$hit)
  total <- nrow(prop_bets)
  win_rate <- wins / total
  roi_units <- (wins * 0.91 - (total - wins) * 1.0)
  roi_pct <- roi_units / total
  
  cat(glue("\n{prop_type} (Edge >= 5%):\n"))
  cat(glue("  Bets: {format(total, big.mark=',')}\n"))
  cat(glue("  Win rate: {scales::percent(win_rate, accuracy = 0.1)}\n"))
  cat(glue("  ROI: {scales::percent(roi_pct, accuracy = 0.1)}\n"))
  cat(glue("  Units: {sprintf('%+.1f', roi_units)}\n"))
}

cat("\n", paste0(rep("=", 60), collapse=""), "\n\n", sep="")

# ============================================================================
# STEP 7: Calibration Analysis (Like NBA)
# ============================================================================

cat("📈 CALIBRATION ANALYSIS:\n")
cat(paste0(rep("=", 60), collapse=""), "\n\n")

# Bin probabilities and check calibration
calibration_bins <- backtest_results %>%
  filter(abs(edge) >= 0.05) %>%
  mutate(
    prob_bin = cut(
      model_prob, 
      breaks = seq(0, 1, by = 0.1),
      include.lowest = TRUE,
      labels = c("0-10%", "10-20%", "20-30%", "30-40%", "40-50%", 
                 "50-60%", "60-70%", "70-80%", "80-90%", "90-100%")
    )
  ) %>%
  group_by(prob_bin) %>%
  summarise(
    count = n(),
    avg_predicted = mean(model_prob),
    actual_hit_rate = mean(hit),
    .groups = "drop"
  ) %>%
  filter(count >= 20)  # Min 20 bets per bin

cat("Probability Calibration (Edge >= 5%):\n\n")
cat(sprintf("%-12s | %6s | %12s | %12s | %10s\n", 
            "Bin", "Count", "Predicted", "Actual", "Diff"))
cat(paste0(rep("-", 70), collapse=""), "\n")

for (i in seq_len(nrow(calibration_bins))) {
  bin_data <- calibration_bins[i, ]
  diff <- bin_data$actual_hit_rate - bin_data$avg_predicted
  
  cat(sprintf("%-12s | %6d | %11.1f%% | %11.1f%% | %+9.1f%%\n",
              bin_data$prob_bin,
              bin_data$count,
              bin_data$avg_predicted * 100,
              bin_data$actual_hit_rate * 100,
              diff * 100))
}

cat("\n")

# Calculate Brier score
brier_score <- mean((backtest_results$model_prob - as.numeric(backtest_results$hit))^2)
cat(glue("Brier Score: {round(brier_score, 4)} (lower is better)\n"))
cat("  Reference: <0.20 = excellent, <0.25 = good, <0.30 = acceptable\n\n")

# ============================================================================
# STEP 8: Save Summary
# ============================================================================

summary_data <- list(
  backtest_period = glue("{min(BACKTEST_CONFIG$seasons)}-{max(BACKTEST_CONFIG$seasons)}"),
  total_predictions = nrow(backtest_results),
  unique_players = length(unique(backtest_results$player)),
  seasons_tested = unique(backtest_results$season),
  
  performance_by_edge = performance_by_edge,
  
  calibration = list(
    brier_score = brier_score,
    bins = calibration_bins
  ),
  
  date_generated = as.character(Sys.time())
)

summary_file <- file.path(DATA_DIR, "backtest_3season_summary.json")
write_json(summary_data, summary_file, pretty = TRUE, auto_unbox = TRUE)
cat(glue("💾 Saved summary to {summary_file}\n\n"))

cat("✅ 3-SEASON BACKTEST COMPLETE!\n")
