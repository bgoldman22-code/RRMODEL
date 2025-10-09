# Convert R Pipeline Output to React Component Format
# Updated for cloud processing - uses R pipeline JSON output instead of CSV

library(dplyr)
library(jsonlite)
library(glue)

cat("🔄 Converting R pipeline output to React-compatible format...\n")

# Check if comprehensive predictions exist from R pipeline
comprehensive_file <- "data/nfl-td-comprehensive-latest.json"

if (!file.exists(comprehensive_file)) {
  cat("❌ No comprehensive predictions found. Running R pipeline first...\n")
  source("scripts/nfl-td-r-pipeline/cloud-pipeline.R")
}

if (file.exists(comprehensive_file)) {
  cat("✅ Loading R pipeline output...\n")
  
  # The cloud pipeline already outputs in React-compatible format
  # Just verify structure and copy to final locations
  
  comprehensive_data <- fromJSON(comprehensive_file)
  
  cat(glue("📊 Loaded {length(comprehensive_data$predictions)} player predictions\n"))
  
  # Copy to public data directory for web access
  public_comprehensive <- "public/data/nfl-td-comprehensive-latest.json"
  dir.create(dirname(public_comprehensive), showWarnings = FALSE, recursive = TRUE)
  file.copy(comprehensive_file, public_comprehensive, overwrite = TRUE)
  
  # Copy to src data directory for component access
  src_comprehensive <- "src/data/nfl-td-comprehensive-latest.json"
  dir.create(dirname(src_comprehensive), showWarnings = FALSE, recursive = TRUE)
  file.copy(comprehensive_file, src_comprehensive, overwrite = TRUE)
  
  # Copy to netlify functions directory
  netlify_comprehensive <- "netlify/functions/_data/nfl-td-comprehensive-latest.json"
  dir.create(dirname(netlify_comprehensive), showWarnings = FALSE, recursive = TRUE)
  file.copy(comprehensive_file, netlify_comprehensive, overwrite = TRUE)
  
  cat("✅ Copied comprehensive predictions to all required locations\n")
  
  # Also ensure schedule data is in the right places
  schedule_file <- "public/data/nfl-schedule-2025.json"
  if (file.exists(schedule_file)) {
    src_schedule <- "src/data/nfl-schedule-2025.json"
    netlify_schedule <- "netlify/functions/_data/nfl-schedule-2025.json"
    
    dir.create(dirname(src_schedule), showWarnings = FALSE, recursive = TRUE)
    dir.create(dirname(netlify_schedule), showWarnings = FALSE, recursive = TRUE)
    
    file.copy(schedule_file, src_schedule, overwrite = TRUE)
    file.copy(schedule_file, netlify_schedule, overwrite = TRUE)
    
    cat("✅ Copied schedule data to all required locations\n")
  }
  
  cat("🎉 React conversion completed successfully!\n")
  cat(glue("📄 Files ready:\n"))
  cat(glue("  - {public_comprehensive}\n"))
  cat(glue("  - {src_comprehensive}\n"))
  cat(glue("  - {netlify_comprehensive}\n"))
  
} else {
  cat("❌ Could not generate or find comprehensive predictions\n")
  quit(status = 1)
}