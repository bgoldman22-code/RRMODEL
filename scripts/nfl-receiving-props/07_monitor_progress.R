#!/usr/bin/env Rscript
# Live Progress Monitor for NFL Receiving Props Backtest
# Run this while backtest is running to see current results

suppressPackageStartupMessages({
  library(tidyverse)
  library(glue)
})

cat("\n🔍 NFL RECEIVING PROPS - LIVE PROGRESS MONITOR\n")
cat(paste0(rep("=", 60), collapse=""), "\n\n")

# Check if backtest is running
DATA_DIR <- "data/nfl_receiving_props"
results_file <- file.path(DATA_DIR, "backtest_3season_2022_2024.rds")
log_file <- file.path(DATA_DIR, "backtest_output.log")

# Read log file to see progress
if (file.exists(log_file)) {
  cat("📊 CURRENT PROGRESS:\n")
  log_lines <- readLines(log_file, warn = FALSE)
  
  # Find last "Testing" line
  test_lines <- grep("Testing", log_lines, value = TRUE)
  if (length(test_lines) > 0) {
    last_test <- tail(test_lines, 1)
    cat(glue("  {last_test}\n\n"))
    
    # Count completed weeks
    completed <- length(test_lines)
    total <- 42  # 14 weeks * 3 seasons
    pct <- completed / total * 100
    
    cat(glue("  Completed: {completed}/{total} weeks ({round(pct, 1)}%)\n"))
    cat(glue("  Remaining: {total - completed} weeks\n\n"))
  }
}

# Check if partial results exist
if (file.exists(results_file)) {
  cat("📈 PARTIAL RESULTS AVAILABLE:\n\n")
  
  results <- readRDS(results_file)
  
  cat(glue("  Total predictions so far: {format(nrow(results), big.mark=',')}\n"))
  cat(glue("  Unique players: {format(length(unique(results$player)), big.mark=',')}\n"))
  cat(glue("  Seasons tested: {paste(unique(results$season), collapse=', ')}\n\n"))
  
  # Quick performance stats (5% edge threshold)
  filtered <- results %>%
    filter(
      abs(edge) >= 0.05,
      model_prob_over >= 0.25,
      model_prob_over <= 0.75,
      games_history >= 4
    )
  
  if (nrow(filtered) > 0) {
    wins <- sum(filtered$hit_over)
    total <- nrow(filtered)
    win_rate <- wins / total
    roi_units <- (wins * 0.91 - (total - wins) * 1.0)
    roi_pct <- roi_units / total
    
    cat("🎯 EARLY PERFORMANCE (5%+ Edge, Filtered):\n")
    cat(glue("  Bets: {format(total, big.mark=',')}\n"))
    cat(glue("  Wins: {format(wins, big.mark=',')} ({scales::percent(win_rate, accuracy = 0.1)})\n"))
    cat(glue("  ROI: {scales::percent(roi_pct, accuracy = 0.1)}\n"))
    cat(glue("  Units: {sprintf('%+.1f', roi_units)}\n\n"))
    
    # By prop type
    cat("📦 BY PROP TYPE:\n")
    for (prop_type in unique(filtered$prop)) {
      prop_bets <- filtered %>% filter(prop == prop_type)
      
      wins_prop <- sum(prop_bets$hit_over)
      total_prop <- nrow(prop_bets)
      win_rate_prop <- wins_prop / total_prop
      
      cat(glue("  {prop_type}: {format(total_prop, big.mark=',')} bets, {scales::percent(win_rate_prop, accuracy = 0.1)} win rate\n"))
    }
    cat("\n")
    
    # By season (if multiple)
    if (length(unique(filtered$season)) > 1) {
      cat("📅 BY SEASON:\n")
      for (season in sort(unique(filtered$season))) {
        season_bets <- filtered %>% filter(season == !!season)
        
        wins_season <- sum(season_bets$hit_over)
        total_season <- nrow(season_bets)
        win_rate_season <- wins_season / total_season
        
        cat(glue("  {season}: {format(total_season, big.mark=',')} bets, {scales::percent(win_rate_season, accuracy = 0.1)} win rate\n"))
      }
      cat("\n")
    }
  }
  
  cat("💡 NOTE: These are PARTIAL results. Final numbers may differ.\n\n")
  
} else {
  cat("⏳ Backtest still initializing...\n")
  cat("   Results file will appear once first season completes.\n\n")
}

cat("🔄 To check again, re-run this script:\n")
cat("   Rscript scripts/nfl-receiving-props/07_monitor_progress.R\n\n")
