# Minimal Export - Just Core Player Features
library(tidyverse)

cat("Loading cached data...\n")

# Load processed PBP data directly
pbp_data <- readRDS("data/nfl_r_pipeline/processed_pbp_data.rds")
roster_data <- readRDS("data/nfl_r_pipeline/rosters_2023_2025.rds")

cat("Loaded", nrow(pbp_data), "plays and", nrow(roster_data), "roster entries\n")

# Create basic player TD stats (simplified version)
player_td_stats <- pbp_data %>%
  filter(
    !is.na(player_id), 
    !is.na(posteam),
    (touchdown == 1 | 
     (play_type %in% c("run", "pass") & yards_gained > 0))
  ) %>%
  left_join(
    roster_data %>% select(player_id = gsis_id, position, full_name),
    by = "player_id"
  ) %>%
  group_by(player_id, full_name, posteam, position, season, week) %>%
  summarise(
    total_tds = sum(touchdown == 1, na.rm = TRUE),
    receiving_tds = sum(touchdown == 1 & play_type == "pass", na.rm = TRUE),
    rushing_tds = sum(touchdown == 1 & play_type == "run", na.rm = TRUE),
    total_plays = n(),
    total_yards = sum(yards_gained, na.rm = TRUE),
    .groups = 'drop'
  ) %>%
  filter(total_tds > 0 | total_plays >= 5) %>%  # Only players with TDs or significant usage
  arrange(desc(total_tds), desc(total_yards))

cat("Created features for", nrow(player_td_stats), "player-week records\n")

# Export to Downloads
downloads_dir <- '~/Downloads'
current_date <- format(Sys.Date(), '%Y-%m-%d')

filename <- file.path(downloads_dir, paste0('nfl-player-td-stats-', current_date, '.csv'))
write.csv(player_td_stats, filename, row.names = FALSE)

cat('✅ Export completed!\n')
cat('File saved to:', filename, '\n')
cat('Records exported:', nrow(player_td_stats), '\n')