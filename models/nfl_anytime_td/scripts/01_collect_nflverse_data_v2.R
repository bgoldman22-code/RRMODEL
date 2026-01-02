#!/usr/bin/env Rscript
# NFL Anytime TD - Data Collection Script
suppressPackageStartupMessages({
  library(nflreadr)
  library(dplyr)
  library(tidyr)
})

SEASONS <- 2022:2025
SCRIPT_DIR <- tryCatch(dirname(sys.frame(1)$ofile), error = function(e) getwd())
OUTPUT_DIR <- file.path(dirname(SCRIPT_DIR), "data")
if (!dir.exists(OUTPUT_DIR)) dir.create(OUTPUT_DIR, recursive = TRUE)

cat("NFL Anytime TD Model - Data Collection\n")
cat("Seasons:", paste(SEASONS, collapse = ", "), "\n")

# Load play-by-play
cat("Loading PBP...\n")
pbp_raw <- load_pbp(seasons = SEASONS)

# Load player stats
cat("Loading player stats...\n")
player_stats <- load_player_stats(seasons = SEASONS)

# Load snap counts
cat("Loading snap counts...\n")
snap_counts <- tryCatch(load_snap_counts(seasons = SEASONS), error = function(e) NULL)

# Extract TDs from PBP
cat("Extracting TD events...\n")
rush_tds <- pbp_raw %>%
  filter(rush_touchdown == 1, !is.na(rusher_player_id)) %>%
  select(game_id, season, week, posteam, player_id = rusher_player_id, player_name = rusher_player_name) %>%
  mutate(td_type = "rush")

rec_tds <- pbp_raw %>%
  filter(pass_touchdown == 1, !is.na(receiver_player_id)) %>%
  select(game_id, season, week, posteam, player_id = receiver_player_id, player_name = receiver_player_name) %>%
  mutate(td_type = "receiving")

all_tds <- bind_rows(rush_tds, rec_tds)
cat("   Found", nrow(all_tds), "TD events\n")

player_game_tds <- all_tds %>%
  group_by(game_id, season, week, player_id, player_name, posteam) %>%
  summarise(total_tds = n(), rush_tds = sum(td_type == "rush"), rec_tds = sum(td_type == "receiving"), .groups = "drop")

# Build features from player_stats
# Columns: player_id, player_name, player_display_name, position, season, week, team, opponent_team, carries, rushing_yards, rushing_tds, targets, receptions, receiving_yards, receiving_tds
cat("Building player features...\n")

# Get home/away from PBP
game_teams <- pbp_raw %>% 
  select(game_id, season, week, home_team, away_team) %>% 
  distinct()

player_features <- player_stats %>%
  filter(position %in% c("RB", "WR", "TE", "QB")) %>%
  select(player_id, player_name, player_display_name, season, week, team, opponent_team, position,
         carries, rushing_yards, rushing_tds, targets, receptions, receiving_yards, receiving_tds) %>%
  # Determine home/away
  left_join(game_teams %>% select(season, week, home_team, away_team) %>% distinct(),
            by = c("season", "week"), relationship = "many-to-many") %>%
  mutate(is_home = case_when(team == home_team ~ TRUE, team == away_team ~ FALSE, TRUE ~ NA)) %>%
  filter(!is.na(is_home)) %>%
  select(-home_team, -away_team) %>%
  # Calculate touches
  mutate(touches = coalesce(carries, 0L) + coalesce(receptions, 0L)) %>%
  # Join TD data
  left_join(player_game_tds %>% select(player_id, season, week, total_tds, rush_tds_pbp = rush_tds, rec_tds_pbp = rec_tds),
            by = c("player_id", "season", "week")) %>%
  mutate(
    total_tds = coalesce(total_tds, 0L),
    scored_td = as.integer(total_tds > 0)
  )

cat("   Player-game records:", nrow(player_features), "\n")

# Rolling features
cat("Computing rolling features...\n")
roll_mean <- function(x, n) {
  result <- rep(NA_real_, length(x))
  for (i in seq_along(x)) {
    if (i <= n) result[i] <- mean(x[1:i], na.rm = TRUE)
    else result[i] <- mean(x[(i - n):(i - 1)], na.rm = TRUE)
  }
  result
}

player_features <- player_features %>%
  arrange(player_id, season, week) %>%
  group_by(player_id) %>%
  mutate(
    use_carries_L5 = lag(roll_mean(coalesce(carries, 0), 5), 1, default = 0),
    use_targets_L5 = lag(roll_mean(coalesce(targets, 0), 5), 1, default = 0),
    use_touches_L5 = lag(roll_mean(coalesce(touches, 0), 5), 1, default = 0),
    use_explosive_plays_L5 = 0,
    snap_offense_pct_L5 = 0.5,
    ply_scored_td_L5 = lag(roll_mean(scored_td, 5), 1, default = 0),
    ply_scored_td_L10 = lag(roll_mean(scored_td, 10), 1, default = 0),
    rz_touches_L5 = use_touches_L5 * 0.15,
    rz_touches_inside10_L5 = use_touches_L5 * 0.08,
    rz_opportunity_share_L5 = 0.1
  ) %>%
  ungroup()

# Rename team to recent_team for compatibility with Python scripts
player_features <- player_features %>%
  rename(recent_team = team, opponent = opponent_team)

# Output
output_df <- player_features %>%
  select(player_id, player_name, player_display_name, season, week, recent_team, position,
         opponent, is_home, carries, targets, touches, rushing_yards, receiving_yards,
         rushing_tds, receiving_tds, total_tds, scored_td,
         use_carries_L5, use_targets_L5, use_touches_L5, use_explosive_plays_L5,
         snap_offense_pct_L5, ply_scored_td_L5, ply_scored_td_L10,
         rz_touches_L5, rz_touches_inside10_L5, rz_opportunity_share_L5)

write.csv(output_df, file.path(OUTPUT_DIR, "player_td_core.csv"), row.names = FALSE)
cat("Saved:", file.path(OUTPUT_DIR, "player_td_core.csv"), "\n")
cat("Records:", nrow(output_df), "| TD rate:", round(mean(output_df$scored_td) * 100, 1), "%\n")
cat("Done!\n")
