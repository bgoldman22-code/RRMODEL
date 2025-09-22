# Final Export - NFL TD Statistics
library(dplyr)
library(readr)

cat("Loading cached data directly...\n")

# Load data
pbp_data <- readRDS("data/nfl_r_pipeline/cache_pbp_2023_2025.rds")
roster_data <- readRDS("data/nfl_r_pipeline/rosters_2023_2025")

cat("Loaded", nrow(pbp_data), "plays and", nrow(roster_data), "roster entries\n")

# Create TD statistics
cat("Creating touchdown statistics...\n")

# Filter for touchdown plays and extract relevant data
td_plays <- pbp_data %>%
  filter(
    touchdown == 1,
    !is.na(td_player_id),
    !is.na(posteam)
  ) %>%
  select(
    season, week, posteam, play_type, 
    td_player_id, td_player_name,
    passer_player_id, rusher_player_id, receiver_player_id,
    pass_touchdown, rush_touchdown, 
    yards_gained, yardline_100
  )

cat("Found", nrow(td_plays), "touchdown plays\n")

# Create player TD statistics
player_td_stats <- td_plays %>%
  left_join(
    roster_data %>% 
    select(gsis_id, position, full_name, team) %>%
    distinct(),
    by = c("td_player_id" = "gsis_id")
  ) %>%
  group_by(season, week, td_player_id, td_player_name, position, posteam) %>%
  summarise(
    total_tds = n(),
    receiving_tds = sum(pass_touchdown == 1, na.rm = TRUE),
    rushing_tds = sum(rush_touchdown == 1, na.rm = TRUE),
    avg_yards = round(mean(yards_gained, na.rm = TRUE), 1),
    long_td = max(yards_gained, na.rm = TRUE),
    .groups = 'drop'
  ) %>%
  arrange(desc(total_tds), desc(avg_yards))

cat("Created statistics for", nrow(player_td_stats), "player-week records\n")

# Create season totals
season_totals <- player_td_stats %>%
  group_by(season, td_player_id, td_player_name, position) %>%
  summarise(
    weeks_played = n(),
    total_tds = sum(total_tds),
    receiving_tds = sum(receiving_tds),
    rushing_tds = sum(rushing_tds),
    avg_tds_per_week = round(total_tds / weeks_played, 2),
    best_week = max(total_tds),
    .groups = 'drop'
  ) %>%
  arrange(desc(total_tds), desc(avg_tds_per_week))

# Export both datasets
downloads_dir <- '~/Downloads'
current_date <- format(Sys.Date(), '%Y-%m-%d')

# Weekly stats
weekly_file <- file.path(downloads_dir, paste0('nfl-td-weekly-stats-', current_date, '.csv'))
write_csv(player_td_stats, weekly_file)

# Season totals  
season_file <- file.path(downloads_dir, paste0('nfl-td-season-totals-', current_date, '.csv'))
write_csv(season_totals, season_file)

cat('✅ Export completed successfully!\n')
cat('\nFiles created:\n')
cat('1. Weekly TD Stats:', weekly_file, '\n')
cat('   Records:', nrow(player_td_stats), '\n')
cat('2. Season Totals:', season_file, '\n') 
cat('   Records:', nrow(season_totals), '\n')

# Show top performers
cat('\nTop TD Scorers (Season Totals):\n')
print(head(season_totals %>% select(season, td_player_name, position, total_tds, avg_tds_per_week), 10))