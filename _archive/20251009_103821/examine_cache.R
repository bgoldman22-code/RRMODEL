# Examine Cache Data Structure
library(dplyr)

cat("Loading and examining cache data...\n")

# Load PBP data
pbp_data <- readRDS("data/nfl_r_pipeline/cache_pbp_2023_2025.rds")
cat("PBP data structure:\n")
cat("Dimensions:", nrow(pbp_data), "x", ncol(pbp_data), "\n")
cat("Columns:", paste(head(colnames(pbp_data), 20), collapse = ", "), "...\n")

# Check for player-related columns
player_cols <- colnames(pbp_data)[grepl("player|id", colnames(pbp_data), ignore.case = TRUE)]
cat("Player-related columns:", paste(player_cols, collapse = ", "), "\n")

# Check for TD-related columns
td_cols <- colnames(pbp_data)[grepl("td|touchdown", colnames(pbp_data), ignore.case = TRUE)]
cat("TD-related columns:", paste(td_cols, collapse = ", "), "\n")

# Sample data
cat("\nFirst few rows:\n")
print(head(pbp_data[, 1:min(10, ncol(pbp_data))]))

cat("\n", paste(rep("=", 50), collapse=""), "\n")

# Load roster data
roster_data <- readRDS("data/nfl_r_pipeline/rosters_2023_2025")
cat("Roster data structure:\n")
cat("Dimensions:", nrow(roster_data), "x", ncol(roster_data), "\n")
cat("Columns:", paste(colnames(roster_data), collapse = ", "), "\n")

cat("\nFirst few roster rows:\n")
print(head(roster_data))