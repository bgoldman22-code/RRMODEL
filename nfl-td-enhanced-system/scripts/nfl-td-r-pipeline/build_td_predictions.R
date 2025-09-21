# scripts/nfl-td-r-pipeline/build_td_predictions.R
# Build Anytime TD predictions (lite + enhanced) from NFL play-by-play.
# Usage: Rscript scripts/nfl-td-r-pipeline/build_td_predictions.R --season 2025 --weeks 1:4
# Requires: setup.R executed at least once.

suppressPackageStartupMessages({
  library(tidyverse)
  library(nflreadr)
  library(jsonlite)
  library(lubridate)
  library(dplyr)
})

args <- commandArgs(trailingOnly = TRUE)
# defaults: current season (approx) and last 4 weeks window
season <- as.integer(gsub("--season=", "", args[grepl("^--season=", args)]))
if (is.na(season)) season <- year(Sys.Date())

weeks_arg <- gsub("--weeks=", "", args[grepl("^--weeks=", args)])
if (weeks_arg == "") weeks <- NULL else weeks <- eval(parse(text=weeks_arg))

message(sprintf("Building TD predictions for season %d", season))
if (!is.null(weeks)) message(sprintf("Weeks filter: %s", paste(weeks, collapse=",")))

# Load pbp for the season
pbp <- load_pbp(seasons = season, fast = TRUE)

if (!is.null(weeks)) {
  pbp <- pbp %>% filter(week %in% weeks)
}

# Identify touchdowns and red-zone opportunities by player
# rusher/receiver TDs only; pass TD goes to receiver, rush TD goes to rusher.
pbp_players <- pbp %>%
  filter(!is.na(play_type), play_type %in% c("run", "pass")) %>%
  mutate(
    is_ttd = if_else(touchdown == 1 & !is.na(receiver_player_name), 1, 0),
    is_rtd = if_else(touchdown == 1 & is.na(receiver_player_name), 1, 0),
    ball_carrier = if_else(play_type == "run", rusher_player_name, receiver_player_name),
    team = posteam,
    in_rz = if_else(!is.na(yardline_100) & yardline_100 <= 20, 1, 0),
    in_g2g = if_else(!is.na(yardline_100) & yardline_100 <= 10, 1, 0)
  ) %>%
  filter(!is.na(ball_carrier), !is.na(team))

# Aggregate player stats
player_agg <- pbp_players %>%
  group_by(season, team, ball_carrier) %>%
  summarize(
    plays = n(),
    rz_plays = sum(in_rz, na.rm = TRUE),
    g2g_plays = sum(in_g2g, na.rm = TRUE),
    rec_tds = sum(is_ttd, na.rm = TRUE),
    rush_tds = sum(is_rtd, na.rm = TRUE),
    tds = rec_tds + rush_tds,
    .groups = "drop"
  )

# Team totals for share calculation
team_totals <- player_agg %>%
  group_by(season, team) %>%
  summarize(
    team_plays = sum(plays),
    team_rz_plays = sum(rz_plays),
    team_tds = sum(tds),
    .groups = "drop"
  )

player_metrics <- player_agg %>%
  left_join(team_totals, by = c("season", "team")) %>%
  mutate(
    rz_share = if_else(team_rz_plays > 0, rz_plays / team_rz_plays, 0),
    td_share = if_else(team_tds > 0, tds / team_tds, 0)
  )

# Recent form: last 3 weeks TDs (if available)
recent_cutoff <- if (is.null(weeks)) max(pbp$week, na.rm=TRUE) - 2 else max(weeks) - 2
recent_pbp <- pbp_players %>% filter(week >= recent_cutoff)

recent_agg <- recent_pbp %>%
  group_by(season, team, ball_carrier) %>%
  summarize(recent_tds = sum(is_ttd + is_rtd, na.rm = TRUE), .groups = "drop")

player_metrics <- player_metrics %>% left_join(recent_agg, by = c("season", "team", "ball_carrier")) %>%
  mutate(recent_tds = replace_na(recent_tds, 0))

# Opponent red-zone defense (simple): TDs allowed per game
opp_def <- pbp %>%
  filter(touchdown == 1) %>%
  group_by(season, defteam) %>%
  summarize(td_allowed = n(), games = n_distinct(game_id), .groups = "drop") %>%
  mutate(td_allowed_pg = td_allowed / pmax(games, 1))

# Baseline team TD expectation (simple): average offensive TDs per game
off_td_pg <- pbp %>%
  filter(touchdown == 1) %>%
  group_by(season, posteam) %>%
  summarize(td_for = n(), games = n_distinct(game_id), .groups = "drop") %>%
  mutate(td_for_pg = td_for / pmax(games, 1))

# Merge simple opponent effect by next game opponent if available (approximation)
# For this static build we assume average opponent; for weekly you can join schedules.
team_context <- off_td_pg %>%
  transmute(season, team = posteam, td_for_pg)

# Probability model (heuristic):
# Player TD probability per game = sigmoid( a*td_share + b*rz_share + c*recent_tds + d*(td_for_pg-2.2) )
sigmoid <- function(x) { 1/(1+exp(-x)) }

a <- 2.2; b <- 1.8; c <- 0.6; d <- 0.9

df <- player_metrics %>%
  left_join(team_context, by = c("season", "team")) %>%
  mutate(
    td_for_pg = replace_na(td_for_pg, 2.2),
    score = a*td_share + b*rz_share + c*recent_tds + d*(td_for_pg - 2.2),
    td_prob = pmax(pmin(sigmoid(score), 0.95), 0.01)
  ) %>%
  arrange(desc(td_prob))

# Build output structures
players <- df %>% transmute(
  player = ball_carrier,
  team = team,
  pos = NA, # position can be added by joining roster data if needed
  td_prob = round(td_prob, 4),
  red_zone_share = round(rz_share, 4),
  recent_form = paste0(recent_tds, " TDs last 3 wks"),
  note = NA
)

# Lite = top 200 with minimal fields
lite <- list(
  meta = list(season = season),
  players = players %>% select(player, team, td_prob) %>% head(200)
)

# Enhanced = richer fields
enhanced <- list(
  meta = list(season = season),
  players = players %>% head(1000)
)

# Write files
out_dir <- file.path("data", "nfl_r_pipeline", "output")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

ts <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
lite_wrapped <- list(source="r-pipeline", updated_at=ts, payload=lite)
enh_wrapped <- list(source="r-pipeline", updated_at=ts, payload=enhanced)

write(jsonlite::toJSON(lite_wrapped, auto_unbox = TRUE, pretty = TRUE),
      file.path(out_dir, "nfl_td_predictions_lite.json"))
write(jsonlite::toJSON(enh_wrapped, auto_unbox = TRUE, pretty = TRUE),
      file.path(out_dir, "nfl_td_predictions_enhanced.json"))

message("Wrote: ", file.path(out_dir, "nfl_td_predictions_lite.json"))
message("Wrote: ", file.path(out_dir, "nfl_td_predictions_enhanced.json"))
