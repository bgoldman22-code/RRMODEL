# NFL Receiving Props - Master Pipeline
# Orchestrates: Data Collection → Model Building → Projections → Backtest
# Author: RR Model
# Date: 2025-10-16

suppressPackageStartupMessages({
  library(glue)
})

cat("🏈 NFL RECEIVING PROPS - Master Pipeline\n")
cat("=========================================\n\n")

START_TIME <- Sys.time()

# ============================================================================
# CONFIGURATION
# ============================================================================

CONFIG <- list(
  mode = "development",  # "development" or "production"
  run_backtest = TRUE,   # Run backtest validation?
  current_week = 7,
  current_season = 2025
)

cat(glue("⚙️  Mode: {CONFIG$mode}\n"))
cat(glue("📅 Target: {CONFIG$current_season} Week {CONFIG$current_week}\n"))
cat(glue("🧪 Backtest: {if (CONFIG$run_backtest) 'YES' else 'NO'}\n\n"))

# ============================================================================
# STEP 1: DATA COLLECTION
# ============================================================================

cat(paste0(strrep("=", 60), "\n"))
cat("STEP 1: DATA COLLECTION\n")
cat(paste0(strrep("=", 60), "\n\n"))

step1_start <- Sys.time()

tryCatch({
  source("scripts/nfl-receiving-props/01_collect_receiving_data.R")
  step1_status <- "✅ SUCCESS"
}, error = function(e) {
  cat(glue("❌ ERROR: {e$message}\n"))
  step1_status <- "❌ FAILED"
  stop("Data collection failed")
})

step1_elapsed <- round(as.numeric(difftime(Sys.time(), step1_start, units = "secs")), 1)
cat(glue("\n{step1_status} - Elapsed: {step1_elapsed}s\n\n"))

# ============================================================================
# STEP 2: MODEL BUILDING
# ============================================================================

cat(paste0(strrep("=", 60), "\n"))
cat("STEP 2: MODEL BUILDING\n")
cat(paste0(strrep("=", 60), "\n\n"))

step2_start <- Sys.time()

tryCatch({
  source("scripts/nfl-receiving-props/02_build_prediction_models.R")
  step2_status <- "✅ SUCCESS"
}, error = function(e) {
  cat(glue("❌ ERROR: {e$message}\n"))
  step2_status <- "❌ FAILED"
  stop("Model building failed")
})

step2_elapsed <- round(as.numeric(difftime(Sys.time(), step2_start, units = "secs")), 1)
cat(glue("\n{step2_status} - Elapsed: {step2_elapsed}s\n\n"))

# ============================================================================
# STEP 3: GENERATE PROJECTIONS
# ============================================================================

  cat(paste0(strrep("=", 60), "\n"))
  cat("STEP 3: GENERATE PROJECTIONS\n")
  cat(paste0(strrep("=", 60), "\n\n"))

step3_start <- Sys.time()

tryCatch({
  source("scripts/nfl-receiving-props/03_simulate_projections.R")
  step3_status <- "✅ SUCCESS"
}, error = function(e) {
  cat(glue("❌ ERROR: {e$message}\n"))
  step3_status <- "❌ FAILED"
  stop("Projection generation failed")
})

step3_elapsed <- round(as.numeric(difftime(Sys.time(), step3_start, units = "secs")), 1)
cat(glue("\n{step3_status} - Elapsed: {step3_elapsed}s\n\n"))

# ============================================================================
# STEP 4: BACKTEST (Optional)
# ============================================================================

if (CONFIG$run_backtest) {
  cat(paste0(strrep("=", 60), "\n"))
  cat("STEP 4: BACKTESTING\n")
  cat(paste0(strrep("=", 60), "\n\n"))
  
  step4_start <- Sys.time()
  
  tryCatch({
    source("scripts/nfl-receiving-props/04_backtest.R")
    step4_status <- "✅ SUCCESS"
  }, error = function(e) {
    cat(glue("⚠️  WARNING: {e$message}\n"))
    step4_status <- "⚠️  PARTIAL"
  })
  
  step4_elapsed <- round(as.numeric(difftime(Sys.time(), step4_start, units = "secs")), 1)
  cat(glue("\n{step4_status} - Elapsed: {step4_elapsed}s\n\n"))
}

# ============================================================================
# SUMMARY
# ============================================================================

total_elapsed <- round(as.numeric(difftime(Sys.time(), START_TIME, units = "secs")), 1)

cat(paste0("\n", strrep("=", 60), "\n"))
cat("🎯 PIPELINE COMPLETE\n")
cat(paste0(strrep("=", 60), "\n\n"))

cat("📊 Summary:\n")
cat(glue("  Step 1 (Data Collection):   {step1_status} ({step1_elapsed}s)\n"))
cat(glue("  Step 2 (Model Building):    {step2_status} ({step2_elapsed}s)\n"))
cat(glue("  Step 3 (Projections):       {step3_status} ({step3_elapsed}s)\n"))
if (CONFIG$run_backtest) {
  cat(glue("  Step 4 (Backtest):          {step4_status} ({step4_elapsed}s)\n"))
}
cat(glue("\n⏱️  Total elapsed: {total_elapsed} seconds\n\n"))

cat("📁 Output files:\n")
cat("  - data/nfl_receiving_props/pbp_receiving.rds\n")
cat("  - data/nfl_receiving_props/player_season_stats.json\n")
cat("  - data/nfl_receiving_props/prediction_models.rds\n")
cat("  - data/nfl_receiving_props/week7_projections.json\n")
cat("  - data/nfl_receiving_props/week7_projections_simple.csv\n\n")

cat("✅ Ready for production integration!\n")
cat("\n🔜 Next steps:\n")
cat("  1. Integrate with The Odds API (player_receptions, player_receiving_yards)\n")
cat("  2. Add injury adjustments (target redistribution from elite system)\n")
cat("  3. Build JavaScript scanner (Netlify function)\n")
cat("  4. Create frontend display (/nfl-receiving-props page)\n")
cat("  5. Set up GitHub Actions (daily automation)\n\n")
