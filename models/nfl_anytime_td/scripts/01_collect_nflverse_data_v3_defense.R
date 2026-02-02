#!/usr/bin/env Rscript
# ============================================================================
# NFL Anytime TD Data Collection - V3 WITH OPPONENT DEFENSE FEATURES
# ============================================================================
# This is a TEST version that adds opponent defensive stats to see if
# it improves model accuracy. Kept separate from production v2.
# ============================================================================

suppressPackageStartupMessages({
  library(nflreadr)
  library(dplyr)
  library(tidyr)
  library(zoo)
})

cat("=" , rep("=", 69), "\n", sep = "")
cat("NFL Anytime TD Data Collection V3 - WITH DEFENSE FEATURES\n")
cat("=" , rep("=", 69), "\n", sep = "")

# ----------------------------------------------------------------------------
# 1. Load play-by-play and player stats (2022-2025)
# ----------------------------------------------------------------------------
seasons <- 2022:2025
cat("Loading PBP for seasons:", paste(seasons, collapse = ", "), "\n")

pbp <- load_pbp(seasons) %>%
  filter(!is.na(posteam), play_type %in% c("run", "pass"))

cat("PBP rows:", nrow(pbp), "\n")

# Load player stats
cat("Loading player stats...\n")
player_stats <- load_player_stats(seasons)

# Load snap counts for participation data
cat("Loading snap counts...\n")
snaps <- load_snap_counts(seasons)

# Load schedules for home/away
cat("Loading schedules...\n")
schedules <- load_schedules(seasons)

# ----------------------------------------------------------------------------
# 2. Extract TDs from PBP (for defense calculations)
# ----------------------------------------------------------------------------
cat("Extracting TDs from play-by-play...\n")

rushing_tds <- pbp %>%
  filter(rush_touchdown == 1, !is.na(rusher_player_id)) %>%
  select(game_id, season, week, posteam, defteam, rusher_player_id) %>%
  rename(player_id = rusher_player_id, team = posteam, opponent = defteam) %>%
  mutate(td_type = "rush")

receiving_tds <- pbp %>%
  filter(pass_touchdown == 1, !is.na(receiver_player_id)) %>%
  select(game_id, season, week, posteam, defteam, receiver_player_id) %>%
  rename(player_id = receiver_player_id, team = posteam, opponent = defteam) %>%
  mutate(td_type = "rec")

all_tds <- bind_rows(rushing_tds, receiving_tds)
cat("TD records extracted:", nrow(all_tds), "\n")

# ----------------------------------------------------------------------------
# 3. Build player-game dataset from player_stats
# ----------------------------------------------------------------------------
cat("Building player-game dataset...\n")

player_games <- player_stats %>%
  filter(position %in% c("RB", "WR", "TE", "QB")) %>%
  select(
    player_id, player_name, player_display_name,
    season, week, team, position,
    opponent_team,
    carries, targets, receptions,
    rushing_yards, receiving_yards,
    rushing_tds, receiving_tds
  ) %>%
  rename(recent_team = team, opponent = opponent_team) %>%
  mutate(
    carries = as.numeric(carries),
    targets = as.numeric(targets),
    receptions = as.numeric(receptions),
    rushing_yards = as.numeric(rushing_yards),
    receiving_yards = as.numeric(receiving_yards),
    rushing_tds = as.numeric(rushing_tds),
    receiving_tds = as.numeric(receiving_tds),
    touches = coalesce(carries, 0) + coalesce(receptions, 0),
    total_tds = coalesce(rushing_tds, 0) + coalesce(receiving_tds, 0),
    scored_td = as.integer(total_tds > 0)
  )

cat("Player-game records:", nrow(player_games), "\n")

# ----------------------------------------------------------------------------
# 4. Add home/away from schedules
# ----------------------------------------------------------------------------
cat("Adding home/away info...\n")

home_games <- schedules %>%
  select(season, week, home_team) %>%
  distinct() %>%
  mutate(is_home = TRUE)

player_games <- player_games %>%
  left_join(home_games, by = c("season", "week", "recent_team" = "home_team")) %>%
  mutate(is_home = coalesce(is_home, FALSE))

# ----------------------------------------------------------------------------
# 5. Add snap percentage
# ----------------------------------------------------------------------------
cat("Adding snap percentages...\n")

snap_pct <- snaps %>%
  filter(game_type == "REG") %>%
  select(player, team, season, week, offense_pct) %>%
  rename(player_name = player, recent_team = team) %>%
  mutate(offense_pct = as.numeric(offense_pct))

player_games <- player_games %>%
  left_join(snap_pct, by = c("player_name", "recent_team", "season", "week"))

# Deduplicate (in case join created duplicates)
player_games <- player_games %>%
  distinct(player_id, season, week, .keep_all = TRUE)

cat("After dedup:", nrow(player_games), "\n")

# ----------------------------------------------------------------------------
# 6. Calculate rolling player features (L5, L10) - using lag + rollmean
# ----------------------------------------------------------------------------
cat("Calculating rolling player features...\n")

# Sort and calculate per player
player_games <- player_games %>%
  arrange(player_id, season, week)

# Calculate rolling features using base R to avoid dplyr issues
player_ids <- unique(player_games$player_id)
cat("Processing", length(player_ids), "players...\n")

# Initialize columns
player_games$use_carries_L5 <- NA_real_
player_games$use_targets_L5 <- NA_real_
player_games$use_touches_L5 <- NA_real_
player_games$use_explosive_plays_L5 <- NA_real_
player_games$snap_offense_pct_L5 <- NA_real_
player_games$ply_scored_td_L5 <- NA_real_
player_games$ply_scored_td_L10 <- NA_real_

for (pid in player_ids) {
  idx <- which(player_games$player_id == pid)
  n <- length(idx)
  
  if (n < 2) next
  
  carries <- coalesce(player_games$carries[idx], 0)
  targets <- coalesce(player_games$targets[idx], 0)
  touches <- player_games$touches[idx]
  explosive <- as.numeric(coalesce(player_games$rushing_yards[idx], 0) > 20 | 
                          coalesce(player_games$receiving_yards[idx], 0) > 20)
  snap_pct <- coalesce(player_games$offense_pct[idx], 0.5)
  scored <- player_games$scored_td[idx]
  
  for (i in 2:n) {
    start5 <- max(1, i - 5)
    start10 <- max(1, i - 10)
    end <- i - 1
    
    player_games$use_carries_L5[idx[i]] <- sum(carries[start5:end])
    player_games$use_targets_L5[idx[i]] <- sum(targets[start5:end])
    player_games$use_touches_L5[idx[i]] <- sum(touches[start5:end])
    player_games$use_explosive_plays_L5[idx[i]] <- sum(explosive[start5:end])
    player_games$snap_offense_pct_L5[idx[i]] <- mean(snap_pct[start5:end])
    player_games$ply_scored_td_L5[idx[i]] <- mean(scored[start5:end])
    player_games$ply_scored_td_L10[idx[i]] <- mean(scored[start10:end])
  }
}

cat("Rolling player features calculated.\n")

# ----------------------------------------------------------------------------
# 7. Calculate Red Zone features from PBP
# ----------------------------------------------------------------------------
cat("Calculating red zone features...\n")

rz_plays <- pbp %>%
  filter(yardline_100 <= 20) %>%
  mutate(
    player_id = coalesce(rusher_player_id, receiver_player_id),
    inside_10 = yardline_100 <= 10
  ) %>%
  filter(!is.na(player_id)) %>%
  group_by(season, week, player_id) %>%
  summarise(
    rz_touches = n(),
    rz_touches_inside10 = sum(inside_10),
    .groups = "drop"
  )

# Team RZ opportunities
team_rz <- pbp %>%
  filter(yardline_100 <= 20) %>%
  group_by(season, week, posteam) %>%
  summarise(team_rz_plays = n(), .groups = "drop")

player_games <- player_games %>%
  left_join(rz_plays, by = c("player_id", "season", "week")) %>%
  left_join(team_rz, by = c("season", "week", "recent_team" = "posteam")) %>%
  mutate(
    rz_touches = coalesce(rz_touches, 0),
    rz_touches_inside10 = coalesce(rz_touches_inside10, 0),
    rz_opportunity_share = ifelse(team_rz_plays > 0, rz_touches / team_rz_plays, 0)
  ) %>%
  select(-team_rz_plays)

# Rolling RZ features (simple approach)
player_games$rz_touches_L5 <- NA_real_
player_games$rz_touches_inside10_L5 <- NA_real_
player_games$rz_opportunity_share_L5 <- NA_real_

for (pid in player_ids) {
  idx <- which(player_games$player_id == pid)
  n <- length(idx)
  
  if (n < 2) next
  
  rz <- player_games$rz_touches[idx]
  rz10 <- player_games$rz_touches_inside10[idx]
  rz_share <- player_games$rz_opportunity_share[idx]
  
  for (i in 2:n) {
    start5 <- max(1, i - 5)
    end <- i - 1
    
    player_games$rz_touches_L5[idx[i]] <- sum(rz[start5:end])
    player_games$rz_touches_inside10_L5[idx[i]] <- sum(rz10[start5:end])
    player_games$rz_opportunity_share_L5[idx[i]] <- mean(rz_share[start5:end])
  }
}

# Fill NAs
player_games <- player_games %>%
  mutate(
    rz_touches_L5 = coalesce(rz_touches_L5, 0),
    rz_touches_inside10_L5 = coalesce(rz_touches_inside10_L5, 0),
    rz_opportunity_share_L5 = coalesce(rz_opportunity_share_L5, 0.1)
  )

# ============================================================================
# 8. NEW: OPPONENT DEFENSE FEATURES
# ============================================================================
cat("\n", "=" , rep("=", 69), "\n", sep = "")
cat("CALCULATING OPPONENT DEFENSE FEATURES (NEW IN V3)\n")
cat("=" , rep("=", 69), "\n", sep = "")

# 8a. TDs allowed by each defense per game
cat("Calculating TDs allowed by defense per game...\n")

def_tds_allowed <- all_tds %>%
  group_by(season, week, opponent) %>%
  summarise(tds_allowed = n(), .groups = "drop") %>%
  rename(defense = opponent)

# 8b. TDs allowed by position
cat("Calculating TDs allowed by position...\n")

td_with_pos <- all_tds %>%
  left_join(
    player_stats %>% select(player_id, season, week, position) %>% distinct(),
    by = c("player_id", "season", "week")
  ) %>%
  filter(!is.na(position))

def_tds_by_pos <- td_with_pos %>%
  group_by(season, week, opponent, position) %>%
  summarise(tds_allowed_to_pos = n(), .groups = "drop") %>%
  rename(defense = opponent)

# 8c. Red zone TD rate allowed by defense
cat("Calculating red zone TD rate allowed by defense...\n")

rz_def <- pbp %>%
  filter(yardline_100 <= 20) %>%
  group_by(season, week, defteam) %>%
  summarise(
    rz_plays_against = n(),
    rz_tds_allowed = sum(rush_touchdown == 1 | pass_touchdown == 1, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  mutate(rz_td_rate_allowed = ifelse(rz_plays_against > 0, rz_tds_allowed / rz_plays_against, 0)) %>%
  rename(defense = defteam)

# 8d. Calculate ROLLING defense stats (L5)
cat("Calculating rolling defense stats (L5)...\n")

# Defense total TDs allowed L5
def_weekly <- def_tds_allowed %>%
  arrange(defense, season, week)

defenses <- unique(def_weekly$defense)
def_weekly$opp_tds_allowed_L5 <- NA_real_

for (def in defenses) {
  idx <- which(def_weekly$defense == def)
  n <- length(idx)
  if (n < 2) next
  
  tds <- def_weekly$tds_allowed[idx]
  for (i in 2:n) {
    start5 <- max(1, i - 5)
    end <- i - 1
    def_weekly$opp_tds_allowed_L5[idx[i]] <- sum(tds[start5:end])
  }
}

# Position-specific defense stats
def_pos_weekly <- def_tds_by_pos %>%
  arrange(defense, position, season, week)

def_pos_weekly$opp_tds_allowed_to_pos_L5 <- NA_real_

for (def in defenses) {
  for (pos in c("RB", "WR", "TE", "QB")) {
    idx <- which(def_pos_weekly$defense == def & def_pos_weekly$position == pos)
    n <- length(idx)
    if (n < 2) next
    
    tds <- def_pos_weekly$tds_allowed_to_pos[idx]
    for (i in 2:n) {
      start5 <- max(1, i - 5)
      end <- i - 1
      def_pos_weekly$opp_tds_allowed_to_pos_L5[idx[i]] <- sum(tds[start5:end])
    }
  }
}

# RZ defense stats
rz_def_weekly <- rz_def %>%
  arrange(defense, season, week)

rz_def_weekly$opp_rz_td_rate_L5 <- NA_real_

for (def in defenses) {
  idx <- which(rz_def_weekly$defense == def)
  n <- length(idx)
  if (n < 2) next
  
  rates <- rz_def_weekly$rz_td_rate_allowed[idx]
  for (i in 2:n) {
    start5 <- max(1, i - 5)
    end <- i - 1
    rz_def_weekly$opp_rz_td_rate_L5[idx[i]] <- mean(rates[start5:end])
  }
}

# 8e. Join defense features to player_games
cat("Joining defense features to player games...\n")

player_games <- player_games %>%
  left_join(
    def_weekly %>% select(defense, season, week, opp_tds_allowed_L5),
    by = c("opponent" = "defense", "season", "week")
  ) %>%
  left_join(
    def_pos_weekly %>% select(defense, position, season, week, opp_tds_allowed_to_pos_L5),
    by = c("opponent" = "defense", "position", "season", "week")
  ) %>%
  left_join(
    rz_def_weekly %>% select(defense, season, week, opp_rz_td_rate_L5),
    by = c("opponent" = "defense", "season", "week")
  )

# Fill NAs with league averages
player_games <- player_games %>%
  mutate(
    opp_tds_allowed_L5 = coalesce(opp_tds_allowed_L5, 2.5),
    opp_tds_allowed_to_pos_L5 = coalesce(opp_tds_allowed_to_pos_L5, 0.6),
    opp_rz_td_rate_L5 = coalesce(opp_rz_td_rate_L5, 0.55)
  )

cat("Defense features added!\n")

# ----------------------------------------------------------------------------
# 9. Final cleanup and save
# ----------------------------------------------------------------------------
cat("\nFinal cleanup...\n")

# Remove rows with missing key rolling features (first game per player)
player_games <- player_games %>%
  filter(!is.na(use_carries_L5) | !is.na(use_targets_L5))

# Select final columns
final_data <- player_games %>%
  select(
    player_id, player_name, player_display_name,
    season, week, recent_team, position, opponent, is_home,
    carries, targets, touches,
    rushing_yards, receiving_yards,
    rushing_tds, receiving_tds, total_tds, scored_td,
    # Player rolling features
    use_carries_L5, use_targets_L5, use_touches_L5,
    use_explosive_plays_L5, snap_offense_pct_L5,
    ply_scored_td_L5, ply_scored_td_L10,
    rz_touches_L5, rz_touches_inside10_L5, rz_opportunity_share_L5,
    # NEW: Opponent defense features
    opp_tds_allowed_L5, opp_tds_allowed_to_pos_L5, opp_rz_td_rate_L5
  )

# Save to CSV
output_path <- "models/nfl_anytime_td/data/player_td_core_v3_defense.csv"
write.csv(final_data, output_path, row.names = FALSE)

cat("\n", "=" , rep("=", 69), "\n", sep = "")
cat("V3 DATA COLLECTION COMPLETE (WITH DEFENSE)\n")
cat("=" , rep("=", 69), "\n", sep = "")
cat("Output:", output_path, "\n")
cat("Records:", nrow(final_data), "\n")
cat("TD rate:", round(mean(final_data$scored_td) * 100, 1), "%\n")
cat("\nNEW DEFENSE FEATURES:\n")
cat("  - opp_tds_allowed_L5: TDs opponent allowed in last 5 games\n")
cat("  - opp_tds_allowed_to_pos_L5: TDs allowed to this position (RB/WR/TE/QB)\n")
cat("  - opp_rz_td_rate_L5: Opponent's red zone TD rate allowed\n")
cat("=" , rep("=", 69), "\n", sep = "")
