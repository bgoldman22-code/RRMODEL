# Export NFL Player Features to Downloads
library(tidyverse)

# Load the data and create player features
source('scripts/nfl-td-r-pipeline/01_data_collection.R')
cat("Loading data collection...\n")
data_collection_result <- collect_all_data()

source('scripts/nfl-td-r-pipeline/02_feature_engineering.R')
cat("Creating player features...\n")
player_features <- create_player_features(
  data_collection_result$data$pbp, 
  data_collection_result$data$rosters, 
  weeks_lookback = 8
)

# Export to Downloads folder
downloads_dir <- '~/Downloads'
current_date <- format(Sys.Date(), '%Y-%m-%d')

# Export full player features
write.csv(player_features, file.path(downloads_dir, paste0('nfl-player-features-', current_date, '.csv')), row.names = FALSE)
cat('Exported player features to:', file.path(downloads_dir, paste0('nfl-player-features-', current_date, '.csv')), '\n')

# Also create simplified prediction-ready format (current week only)
prediction_ready <- player_features %>%
  filter(week == max(week, na.rm = TRUE)) %>%  # Current week only
  select(
    player_id, posteam, position, total_tds, 
    td_rate_2wk, td_rate_4wk, td_rate_8wk,
    receiving_tds, rushing_tds, passing_tds,
    rz_tds, deep_tds, slot_tds
  ) %>%
  arrange(desc(total_tds))

write.csv(prediction_ready, file.path(downloads_dir, paste0('nfl-td-predictions-ready-', current_date, '.csv')), row.names = FALSE)
cat('Exported prediction-ready data to:', file.path(downloads_dir, paste0('nfl-td-predictions-ready-', current_date, '.csv')), '\n')

cat('Export completed successfully!\n')
cat('Files exported:\n')
cat('1. Full features:', file.path(downloads_dir, paste0('nfl-player-features-', current_date, '.csv')), '\n')
cat('2. Prediction ready:', file.path(downloads_dir, paste0('nfl-td-predictions-ready-', current_date, '.csv')), '\n')