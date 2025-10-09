#!/usr/bin/env Rscript

# Test the cloud pipeline locally
cat("🧪 Testing cloud-optimized R pipeline...\n")

# Set test environment
Sys.setenv(NFL_WEEK = "3")
Sys.setenv(NFL_SEASON = "2025")

# Source and run the pipeline
tryCatch({
  source("scripts/nfl-td-r-pipeline/cloud-pipeline.R")
  cat("✅ Cloud pipeline test successful!\n")
}, error = function(e) {
  cat("❌ Pipeline test failed:", e$message, "\n")
  quit(status = 1)
})

# Test the conversion script
tryCatch({
  source("convert_for_react.R")
  cat("✅ React conversion test successful!\n")
}, error = function(e) {
  cat("❌ Conversion test failed:", e$message, "\n")
  quit(status = 1)
})

cat("🎉 All tests passed! Ready for cloud deployment.\n")