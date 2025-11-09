#!/usr/bin/env Rscript
# Weekly Performance Tracker for NFL Receiving Props
# Stores predictions and checks results after games complete

suppressPackageStartupMessages({
  library(tidyverse)
  library(jsonlite)
  library(glue)
})

cat("\n📊 NFL RECEIVING PROPS - WEEKLY PERFORMANCE TRACKER\n")
cat(paste0(rep("=", 60), collapse=""), "\n\n")

# Configuration
LOGS_DIR <- "logs/receiving-props"
PREDICTIONS_DIR <- file.path(LOGS_DIR, "predictions")
RESULTS_DIR <- file.path(LOGS_DIR, "results")

# Create directories
dir.create(LOGS_DIR, showWarnings = FALSE, recursive = TRUE)
dir.create(PREDICTIONS_DIR, showWarnings = FALSE, recursive = TRUE)
dir.create(RESULTS_DIR, showWarnings = FALSE, recursive = TRUE)

# Get current week
get_current_week <- function() {
  season_start <- as.Date("2025-09-04")
  today <- Sys.Date()
  days_since_start <- as.numeric(today - season_start)
  week <- floor(days_since_start / 7) + 1
  return(week)
}

WEEK <- get_current_week()
SEASON <- 2025

cat(glue("📅 Current: Week {WEEK}, {SEASON}\n\n"))

# Function: Save current predictions
save_predictions <- function(week, season) {
  cat(glue("💾 Saving predictions for Week {week}...\n"))
  
  # Fetch from production
  url <- "https://bgroundrobin.com/.netlify/functions/nfl-receiving-scanner-elite"
  
  tryCatch({
    response <- jsonlite::fromJSON(url)
    
    if (length(response$predictions) > 0) {
      predictions <- response$predictions %>%
        as_tibble() %>%
        mutate(
          week = week,
          season = season,
          fetched_at = Sys.time(),
          prediction_id = paste0(player, "_", prop, "_", line, "_", side)
        )
      
      # Save to file
      output_file <- file.path(PREDICTIONS_DIR, glue("week_{week}_{season}.rds"))
      saveRDS(predictions, output_file)
      
      cat(glue("✅ Saved {nrow(predictions)} predictions to {output_file}\n"))
      
      # Summary
      cat(glue("   Top 5 edges:\n"))
      top5 <- predictions %>%
        arrange(desc(edge)) %>%
        head(5)
      
      for (i in 1:min(5, nrow(top5))) {
        p <- top5[i, ]
        cat(glue("     {i}. {p$player} - {p$prop} {p$line} {p$side}: {scales::percent(p$edge, accuracy=0.1)}\n"))
      }
      
      return(TRUE)
    } else {
      cat("⚠️  No predictions returned\n")
      return(FALSE)
    }
  }, error = function(e) {
    cat(glue("❌ Error fetching predictions: {e$message}\n"))
    return(FALSE)
  })
}

# Function: Check results after games complete
check_results <- function(week, season) {
  cat(glue("\n🔍 Checking results for Week {week}...\n"))
  
  pred_file <- file.path(PREDICTIONS_DIR, glue("week_{week}_{season}.rds"))
  
  if (!file.exists(pred_file)) {
    cat("⚠️  No predictions file found. Run save mode first.\n")
    return(FALSE)
  }
  
  predictions <- readRDS(pred_file)
  cat(glue("   Loaded {nrow(predictions)} predictions\n"))
  
  # TODO: Fetch actual results from nflfastR after week completes
  # For now, just save the structure
  
  cat("\n💡 Result checking requires nflfastR data after games complete.\n")
  cat("   This is a placeholder for future enhancement.\n")
  cat("   Manual tracking recommended for now.\n\n")
  
  return(TRUE)
}

# Command line args
args <- commandArgs(trailingOnly = TRUE)

if (length(args) == 0) {
  # Default: save current week
  cat("📌 Mode: SAVE current week predictions\n\n")
  save_predictions(WEEK, SEASON)
  
  cat("\n💡 Usage:\n")
  cat("   Save predictions:  Rscript weekly-tracker.R save [week] [season]\n")
  cat("   Check results:     Rscript weekly-tracker.R check [week] [season]\n")
  cat("   View history:      Rscript weekly-tracker.R history\n\n")
  
} else if (args[1] == "save") {
  week_arg <- if (length(args) >= 2) as.integer(args[2]) else WEEK
  season_arg <- if (length(args) >= 3) as.integer(args[3]) else SEASON
  save_predictions(week_arg, season_arg)
  
} else if (args[1] == "check") {
  week_arg <- if (length(args) >= 2) as.integer(args[2]) else WEEK
  season_arg <- if (length(args) >= 3) as.integer(args[3]) else SEASON
  check_results(week_arg, season_arg)
  
} else if (args[1] == "history") {
  cat("📜 PREDICTION HISTORY\n\n")
  
  pred_files <- list.files(PREDICTIONS_DIR, pattern = "^week_.*\\.rds$", full.names = TRUE)
  
  if (length(pred_files) == 0) {
    cat("   No predictions saved yet.\n\n")
  } else {
    for (file in sort(pred_files, decreasing = TRUE)) {
      preds <- readRDS(file)
      filename <- basename(file)
      
      cat(glue("   {filename}\n"))
      cat(glue("     Predictions: {nrow(preds)}\n"))
      cat(glue("     Avg edge: {scales::percent(mean(preds$edge), accuracy=0.1)}\n"))
      cat(glue("     Top edge: {scales::percent(max(preds$edge), accuracy=0.1)}\n"))
      cat(glue("     Saved: {format(preds$fetched_at[1], '%Y-%m-%d %H:%M')}\n\n"))
    }
  }
  
} else {
  cat("❌ Unknown command. Use: save, check, or history\n\n")
}
