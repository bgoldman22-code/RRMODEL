# Direct Export - Bypass Pipeline
library(dplyr)
library(readr)

cat("Loading cached data directly...\n")

# Check what cached files exist
cache_files <- list.files("data/nfl_r_pipeline/", pattern = "\\.rds$", full.names = TRUE)
cat("Available cache files:", paste(cache_files, collapse = ", "), "\n")

# Load processed data directly
pbp_file <- "data/nfl_r_pipeline/cache_pbp_2023_2025.rds"
roster_file <- "data/nfl_r_pipeline/rosters_2023_2025"

if (file.exists(pbp_file)) {
  pbp_data <- readRDS(pbp_file)
  cat("Loaded PBP data:", nrow(pbp_data), "plays\n")
} else {
  cat("PBP cache file not found at:", pbp_file, "\n")
  quit(status = 1)
}

if (file.exists(roster_file)) {
  roster_data <- readRDS(roster_file)
  cat("Loaded roster data:", nrow(roster_data), "entries\n")
} else {
  cat("Roster cache file not found at:", roster_file, "\n")
  quit(status = 1)
}

# Create basic player TD stats
cat("Creating TD statistics...\n")
td_stats <- pbp_data %>%
  filter(
    !is.na(player_id), 
    touchdown == 1
  ) %>%
  left_join(
    roster_data %>% select(player_id = gsis_id, position, full_name),
    by = "player_id"
  ) %>%
  group_by(player_id, full_name, posteam, position, season, week) %>%
  summarise(
    total_tds = n(),
    receiving_tds = sum(play_type == "pass", na.rm = TRUE),
    rushing_tds = sum(play_type == "run", na.rm = TRUE),
    .groups = 'drop'
  ) %>%
  arrange(desc(total_tds))

cat("Created TD stats for", nrow(td_stats), "player-week records\n")

# Export to Downloads
downloads_dir <- '~/Downloads'
current_date <- format(Sys.Date(), '%Y-%m-%d')
filename <- file.path(downloads_dir, paste0('nfl-touchdown-stats-', current_date, '.csv'))

write_csv(td_stats, filename)

cat('✅ Export successful!\n')
cat('File:', filename, '\n')
cat('Records:', nrow(td_stats), '\n')