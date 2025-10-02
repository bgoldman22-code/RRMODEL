# Extract defensive receiving metrics (what opponents allow)
# Outputs: defense_receiving_allow_2025.json

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
    !is.na(defteam)
  )

# Calculate what each defense allows by position
defense_allows <- receiving_plays %>%
  # Infer receiver position (simplified)
  mutate(
    receiver_pos = case_when(
      grepl("RB|FB", receiver_position, ignore.case = TRUE) ~ "RB",
      grepl("TE", receiver_position, ignore.case = TRUE) ~ "TE",
      TRUE ~ "WR"
    )
  ) %>%
  filter(!is.na(receiver_pos)) %>%
  group_by(
    season, week, defteam, receiver_pos
  ) %>%
  summarise(
    targets_allowed = n(),
    receptions_allowed = sum(complete_pass, na.rm = TRUE),
    yards_allowed = sum(yards_gained[complete_pass == 1], na.rm = TRUE),
    air_yards_allowed = sum(air_yards[complete_pass == 1], na.rm = TRUE),
    yac_allowed = sum(yards_after_catch[complete_pass == 1], na.rm = TRUE),
    explosive_allowed = sum(complete_pass == 1 & yards_gained >= 15, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  mutate(
    catch_rate_allowed = receptions_allowed / targets_allowed,
    ypr_allowed = ifelse(receptions_allowed > 0, yards_allowed / receptions_allowed, 0),
    adot_allowed = ifelse(receptions_allowed > 0, air_yards_allowed / receptions_allowed, 0),
    yac_per_rec_allowed = ifelse(receptions_allowed > 0, yac_allowed / receptions_allowed, 0),
    explosive_rate_allowed = explosive_allowed / targets_allowed
  )

# Calculate rolling defense metrics (last 3 games)
defense_rolling <- defense_allows %>%
  arrange(defteam, receiver_pos, season, week) %>%
  group_by(defteam, receiver_pos) %>%
  mutate(
    catch_rate_l3 = lag(zoo::rollmean(catch_rate_allowed, k = 3, fill = NA, align = "right"), 1),
    ypr_l3 = lag(zoo::rollmean(ypr_allowed, k = 3, fill = NA, align = "right"), 1),
    adot_l3 = lag(zoo::rollmean(adot_allowed, k = 3, fill = NA, align = "right"), 1),
    yac_per_rec_l3 = lag(zoo::rollmean(yac_per_rec_allowed, k = 3, fill = NA, align = "right"), 1),
    explosive_l3 = lag(zoo::rollmean(explosive_rate_allowed, k = 3, fill = NA, align = "right"), 1)
  ) %>%
  ungroup()

# Season aggregates
defense_season <- defense_allows %>%
  filter(season == 2025) %>%
  group_by(defteam, receiver_pos) %>%
  summarise(
    games = n_distinct(week),
    avg_catch_rate_allowed = mean(catch_rate_allowed, na.rm = TRUE),
    avg_ypr_allowed = mean(ypr_allowed, na.rm = TRUE),
    avg_adot_allowed = mean(adot_allowed, na.rm = TRUE),
    avg_yac_per_rec_allowed = mean(yac_per_rec_allowed, na.rm = TRUE),
    avg_explosive_rate_allowed = mean(explosive_rate_allowed, na.rm = TRUE),
    .groups = "drop"
  )

# Get latest rolling stats
latest_defense_rolling <- defense_rolling %>%
  filter(season == 2025) %>%
  group_by(defteam, receiver_pos) %>%
  filter(week == max(week)) %>%
  select(
    defteam, receiver_pos,
    catch_rate_l3, ypr_l3, adot_l3, yac_per_rec_l3, explosive_l3
  ) %>%
  ungroup()

# Combine season and rolling
final_defense <- defense_season %>%
  left_join(latest_defense_rolling, by = c("defteam", "receiver_pos")) %>%
  mutate(
    # Prefer rolling, fallback to season
    proj_catch_rate_allowed = coalesce(catch_rate_l3, avg_catch_rate_allowed),
    proj_ypr_allowed = coalesce(ypr_l3, avg_ypr_allowed),
    proj_adot_allowed = coalesce(adot_l3, avg_adot_allowed),
    proj_yac_per_rec_allowed = coalesce(yac_per_rec_l3, avg_yac_per_rec_allowed),
    proj_explosive_rate_allowed = coalesce(explosive_l3, avg_explosive_rate_allowed)
  ) %>%
  select(
    team = defteam, position = receiver_pos,
    games,
    proj_catch_rate_allowed, proj_ypr_allowed, proj_adot_allowed,
    proj_yac_per_rec_allowed, proj_explosive_rate_allowed
  )

# Export to JSON
write_json(final_defense, "data/defense_receiving_allow_2025.json", pretty = TRUE)

cat("Extracted defense metrics for", n_distinct(final_defense$team), "teams\n")
cat("Saved to: data/defense_receiving_allow_2025.json\n")
