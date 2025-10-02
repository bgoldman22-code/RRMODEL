# Extract player receiving stats from NFLverse pbp data
# Outputs: player_receiving_stats_2025.json

library(dplyr)
library(jsonlite)

# Load processed pbp data
pbp_2024 <- readRDS("pbp_2024_processed.rds")
pbp_2025 <- readRDS("pbp_2025_processed.rds")

# Combine seasons
pbp <- bind_rows(pbp_2024, pbp_2025)

# Filter to pass plays with valid receiver data
receiving_plays <- pbp %>%
  filter(
    play_type == "pass",
    !is.na(receiver_player_name),
    !is.na(receiver_player_id)
  )

# Calculate per-player, per-game stats
player_game_stats <- receiving_plays %>%
  group_by(
    season, week, game_id,
    player_id = receiver_player_id,
    player_name = receiver_player_name,
    posteam
  ) %>%
  summarise(
    targets = n(),
    receptions = sum(complete_pass, na.rm = TRUE),
    receiving_yards = sum(yards_gained[complete_pass == 1], na.rm = TRUE),
    air_yards = sum(air_yards[complete_pass == 1], na.rm = TRUE),
    yards_after_catch = sum(yards_after_catch[complete_pass == 1], na.rm = TRUE),
    explosive_receptions = sum(complete_pass == 1 & yards_gained >= 15, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  mutate(
    catch_rate = receptions / targets,
    yards_per_reception = ifelse(receptions > 0, receiving_yards / receptions, 0),
    adot = ifelse(receptions > 0, air_yards / receptions, 0),
    yac_per_reception = ifelse(receptions > 0, yards_after_catch / receptions, 0),
    explosive_rate = explosive_receptions / targets
  )

# Calculate rolling averages (last 3 games)
player_rolling <- player_game_stats %>%
  arrange(player_id, season, week) %>%
  group_by(player_id, player_name) %>%
  mutate(
    targets_l3 = lag(zoo::rollmean(targets, k = 3, fill = NA, align = "right"), 1),
    receptions_l3 = lag(zoo::rollmean(receptions, k = 3, fill = NA, align = "right"), 1),
    yards_l3 = lag(zoo::rollmean(receiving_yards, k = 3, fill = NA, align = "right"), 1),
    catch_rate_l3 = lag(zoo::rollmean(catch_rate, k = 3, fill = NA, align = "right"), 1),
    ypr_l3 = lag(zoo::rollmean(yards_per_reception, k = 3, fill = NA, align = "right"), 1),
    adot_l3 = lag(zoo::rollmean(adot, k = 3, fill = NA, align = "right"), 1),
    yac_per_rec_l3 = lag(zoo::rollmean(yac_per_reception, k = 3, fill = NA, align = "right"), 1),
    explosive_rate_l3 = lag(zoo::rollmean(explosive_rate, k = 3, fill = NA, align = "right"), 1)
  ) %>%
  ungroup()

# Season-to-date aggregates
player_season_stats <- player_game_stats %>%
  group_by(season, player_id, player_name, posteam) %>%
  summarise(
    games_played = n(),
    total_targets = sum(targets),
    total_receptions = sum(receptions),
    total_yards = sum(receiving_yards),
    avg_catch_rate = mean(catch_rate, na.rm = TRUE),
    avg_ypr = mean(yards_per_reception, na.rm = TRUE),
    avg_adot = mean(adot, na.rm = TRUE),
    avg_yac_per_rec = mean(yac_per_reception, na.rm = TRUE),
    avg_explosive_rate = mean(explosive_rate, na.rm = TRUE),
    .groups = "drop"
  )

# Get position from roster data (if available)
# Fallback: infer from play data
positions <- receiving_plays %>%
  group_by(player_id = receiver_player_id, player_name = receiver_player_name) %>%
  summarise(
    # Try to get position from multiple sources
    position = first(na.omit(c(receiver_position, receiver_jersey_number))),
    .groups = "drop"
  ) %>%
  mutate(
    # Simple heuristic: if we don't have position, mark as WR (most common)
    position = ifelse(is.na(position), "WR", position)
  )

# Merge position into season stats
player_season_stats <- player_season_stats %>%
  left_join(positions, by = c("player_id", "player_name"))

# Filter to 2025 season and players with meaningful volume
player_2025 <- player_season_stats %>%
  filter(
    season == 2025,
    games_played >= 2,
    total_targets >= 8
  ) %>%
  select(
    player_id, player_name, team = posteam, position,
    games_played, total_targets, total_receptions, total_yards,
    avg_catch_rate, avg_ypr, avg_adot, avg_yac_per_rec, avg_explosive_rate
  )

# Get most recent rolling stats (latest week available)
latest_rolling <- player_rolling %>%
  filter(season == 2025) %>%
  group_by(player_id) %>%
  filter(week == max(week)) %>%
  select(
    player_id, 
    targets_l3, receptions_l3, yards_l3,
    catch_rate_l3, ypr_l3, adot_l3, yac_per_rec_l3, explosive_rate_l3
  ) %>%
  ungroup()

# Combine season and rolling stats
final_stats <- player_2025 %>%
  left_join(latest_rolling, by = "player_id") %>%
  mutate(
    # Use rolling if available, else season average
    proj_catch_rate = coalesce(catch_rate_l3, avg_catch_rate),
    proj_ypr = coalesce(ypr_l3, avg_ypr),
    proj_adot = coalesce(adot_l3, avg_adot),
    proj_yac_per_rec = coalesce(yac_per_rec_l3, avg_yac_per_rec),
    proj_explosive_rate = coalesce(explosive_rate_l3, avg_explosive_rate)
  ) %>%
  select(
    player_id, player_name, team, position,
    games_played, total_targets, total_receptions, total_yards,
    proj_catch_rate, proj_ypr, proj_adot, proj_yac_per_rec, proj_explosive_rate
  )

# Export to JSON
write_json(final_stats, "data/player_receiving_stats_2025.json", pretty = TRUE)

cat("Extracted", nrow(final_stats), "players\n")
cat("Saved to: data/player_receiving_stats_2025.json\n")
