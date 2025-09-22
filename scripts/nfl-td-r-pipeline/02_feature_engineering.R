# NFL Touchdown Prediction - Advanced Feature Engineering
# Enhanced player performance, situational analysis, and matchup context

suppressPackageStartupMessages({
  library(tidyverse)
  library(zoo)
  library(glue)
})

## Enhanced Player Performance Features with Usage Context
create_player_features <- function(pbp_data, roster_data, weeks_lookback = 8) {
  cat("🎯 Creating Enhanced Player Features...\n")
  # Join pbp with roster to get position for each player_id/season
  get_position <- function(player_id, season) {
    pos <- roster_data$position[roster_data$player_id == player_id & roster_data$season == season]
    if (length(pos) > 0) pos[1] else NA_character_
  }
  # Enhanced touchdown scoring features with context
  player_td_stats <- pbp_data %>%
    filter(!is.na(any_td)) %>%
    # Passing TD features
    {bind_rows(
      filter(., !is.na(passer_player_id)) %>%
        group_by(player_id = passer_player_id, season, week, posteam) %>%
        summarise(
          position = get_position(first(player_id), first(season)),
          passing_tds = sum(passing_td, na.rm = TRUE),
          total_tds = sum(passing_td, na.rm = TRUE),
          rz_passing_tds = sum(passing_td == 1 & field_position_value %in% 
                              c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
          deep_passing_tds = sum(passing_td == 1 & air_yards >= 20, na.rm = TRUE),
          goal_line_passing_tds = sum(passing_td == 1 & field_position_value == "goal_line", na.rm = TRUE),
          .groups = "drop"
        ),
      # Rushing TD features  
      filter(., !is.na(rusher_player_id)) %>%
        group_by(player_id = rusher_player_id, season, week, posteam) %>%
        summarise(
          position = get_position(first(player_id), first(season)),
          rushing_tds = sum(rushing_td, na.rm = TRUE),
          total_tds = sum(rushing_td, na.rm = TRUE), 
          goal_line_tds = sum(rushing_td == 1 & field_position_value == "goal_line", na.rm = TRUE),
          long_rush_tds = sum(rushing_td == 1 & yards_gained >= 15, na.rm = TRUE),
          short_yardage_tds = sum(rushing_td == 1 & situation == "short_yardage", na.rm = TRUE),
          .groups = "drop"
        ),
      # Receiving TD features
      filter(., !is.na(receiver_player_id)) %>%
        group_by(player_id = receiver_player_id, season, week, posteam) %>%
        summarise(
          position = get_position(first(player_id), first(season)),
          receiving_tds = sum(receiving_td, na.rm = TRUE),
          total_tds = sum(receiving_td, na.rm = TRUE),
          slot_tds = tryCatch({
            sum(receiving_td == 1 & !is.na(pass_location) & str_detect(pass_location, "middle"), na.rm = TRUE)
          }, error = function(e) 0L),
          yac_tds = sum(receiving_td == 1 & air_yards <= 5, na.rm = TRUE),
          contested_tds = sum(receiving_td == 1 & air_yards >= 15, na.rm = TRUE),
          rz_receiving_tds = sum(receiving_td == 1 & field_position_value %in%
                               c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
          deep_receiving_tds = sum(receiving_td == 1 & air_yards >= 20, na.rm = TRUE),
          .groups = "drop"
        )
    )} %>%
    # Combine duplicate player entries (e.g., QB who also runs)
    group_by(player_id, season, week, posteam) %>%
    summarise(
      position = first(position[!is.na(position)]),
      total_tds = sum(total_tds, na.rm = TRUE),
      passing_tds = sum(passing_tds, na.rm = TRUE),
      rushing_tds = sum(rushing_tds, na.rm = TRUE), 
      receiving_tds = sum(receiving_tds, na.rm = TRUE),
      rz_tds = sum(c(rz_passing_tds, rz_receiving_tds, goal_line_tds), na.rm = TRUE),
      deep_tds = sum(c(deep_passing_tds, deep_receiving_tds, long_rush_tds), na.rm = TRUE),
      yac_tds = sum(yac_tds, na.rm = TRUE),
      .groups = "drop"
    )
  
  # Enhanced usage and efficiency metrics
  player_usage_stats <- pbp_data %>%
    
    # Receiving usage stats
    {bind_rows(
      filter(., !is.na(receiver_player_id)) %>%
        group_by(player_id = receiver_player_id, season, week, posteam) %>%
        summarise(
          # Basic receiving usage
          targets = sum(!is.na(receiver_player_id), na.rm = TRUE),
          receptions = sum(complete_pass == 1, na.rm = TRUE),
          receiving_yards = sum(yards_gained[complete_pass == 1], na.rm = TRUE),
          
          # Advanced usage metrics
          red_zone_targets = sum(field_position_value %in% 
                                c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
          goal_line_targets = sum(field_position_value == "goal_line", na.rm = TRUE),
          third_down_targets = sum(down == 3, na.rm = TRUE),
          
          # Route type approximation
          short_targets = sum(air_yards <= 5, na.rm = TRUE),
          intermediate_targets = sum(air_yards > 5 & air_yards <= 15, na.rm = TRUE),
          deep_targets = sum(air_yards > 15, na.rm = TRUE),
          
          # Efficiency metrics
          yards_per_target = receiving_yards / pmax(targets, 1),
          yac_per_reception = sum(yards_after_catch, na.rm = TRUE) / pmax(receptions, 1),
          contested_catch_rate = sum(complete_pass == 1 & air_yards >= 10, na.rm = TRUE) / 
                                pmax(sum(air_yards >= 10, na.rm = TRUE), 1),
          
          # Explosiveness
          explosive_catches = sum(yards_gained >= 20 & complete_pass == 1, na.rm = TRUE),
          explosive_catch_rate = explosive_catches / pmax(receptions, 1),
          
          # Team context
          team_pass_attempts = n(),
          
          .groups = "drop"
        ),
      
      # Rushing usage stats
      filter(., !is.na(rusher_player_id)) %>%
        group_by(player_id = rusher_player_id, season, week, posteam) %>%
        summarise(
          # Basic rushing usage
          carries = sum(!is.na(rusher_player_id), na.rm = TRUE),
          rushing_yards = sum(yards_gained, na.rm = TRUE),
          
          # Situational usage
          red_zone_carries = sum(field_position_value %in%
                               c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
          goal_line_carries = sum(field_position_value == "goal_line", na.rm = TRUE),
          short_yardage_carries = sum(situation == "short_yardage", na.rm = TRUE),
          
          # Efficiency
          yards_per_carry = rushing_yards / pmax(carries, 1),
          explosive_runs = sum(yards_gained >= 15, na.rm = TRUE),
          explosive_run_rate = explosive_runs / pmax(carries, 1),
          
          # Receiving work (for RBs)
          rb_targets = sum(!is.na(receiver_player_id) & 
                          receiver_player_id == rusher_player_id, na.rm = TRUE),
          rb_receptions = sum(complete_pass == 1 & 
                             receiver_player_id == rusher_player_id, na.rm = TRUE),
          
          # Team context
          team_rush_attempts = n(),
          
          .groups = "drop"
        )
    )} %>%
    # Combine usage stats
    group_by(player_id, season, week, posteam) %>%
    summarise(across(everything(), ~sum(.x, na.rm = TRUE)), .groups = "drop")
  
  # Calculate team totals for share metrics
  team_totals <- pbp_data %>%
    group_by(posteam, season, week) %>%
    summarise(
      team_total_plays = n(),
      team_pass_plays = sum(play_type == "pass", na.rm = TRUE),
      team_rush_plays = sum(play_type == "run", na.rm = TRUE),
      team_rz_plays = sum(field_position_value %in% 
                         c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
      team_goal_line_plays = sum(field_position_value == "goal_line", na.rm = TRUE),
      .groups = "drop"
    )
  
  # Combine TD stats with usage stats
  player_base_stats <- player_td_stats %>%
    full_join(player_usage_stats, 
              by = c("player_id", "season", "week", "posteam")) %>%
    left_join(team_totals, by = c("posteam", "season", "week")) %>%
    replace_na(list(
      total_tds = 0, passing_tds = 0, rushing_tds = 0, receiving_tds = 0,
      targets = 0, receptions = 0, carries = 0
    )) %>%
    mutate(
      # Calculate share metrics
      target_share = targets / pmax(team_pass_plays, 1),
      carry_share = carries / pmax(team_rush_plays, 1),
      rz_usage_rate = (red_zone_targets + red_zone_carries) / pmax(team_rz_plays, 1),
      goal_line_usage_rate = (goal_line_targets + goal_line_carries) / 
                            pmax(team_goal_line_plays, 1),
      
      # Overall usage
      total_touches = targets + carries,
      touch_share = total_touches / pmax(team_total_plays, 1),
      
      # Position-specific features handled via roster join above
    )
  
  # Rolling averages and advanced trends
  cat("   Calculating rolling averages and trends...\n")
  
  player_rolling_stats <- player_base_stats %>%
    arrange(player_id, season, week) %>%
    group_by(player_id) %>%
    mutate(
      # Rolling TD rates with different windows
      td_rate_2wk = zoo::rollmean(total_tds, k = 2, fill = NA, align = "right"),
      td_rate_4wk = zoo::rollmean(total_tds, k = 4, fill = NA, align = "right"),
      td_rate_8wk = zoo::rollmean(total_tds, k = 8, fill = NA, align = "right"),
      
      # Context-specific TD rates
      rz_td_rate_4wk = zoo::rollmean(rz_tds, k = 4, fill = NA, align = "right"),
      deep_td_rate_4wk = zoo::rollmean(deep_tds, k = 4, fill = NA, align = "right"),
      
      # Usage trends
      target_share_4wk = zoo::rollmean(target_share, k = 4, fill = NA, align = "right"),
      carry_share_4wk = zoo::rollmean(carry_share, k = 4, fill = NA, align = "right"),
      rz_usage_4wk = zoo::rollmean(rz_usage_rate, k = 4, fill = NA, align = "right"),
      touch_share_4wk = zoo::rollmean(touch_share, k = 4, fill = NA, align = "right"),
      
      # Efficiency trends
      explosive_rate_4wk = zoo::rollmean((explosive_catches + explosive_runs) / 
                                        pmax(total_touches, 1), k = 4, fill = NA, align = "right"),
      yac_trend_4wk = zoo::rollmean(yac_per_reception, k = 4, fill = NA, align = "right"),
      ypc_trend_4wk = zoo::rollmean(yards_per_carry, k = 4, fill = NA, align = "right"),
      
      # Volatility and consistency metrics
      td_volatility = zoo::rollapply(total_tds, width = 4, FUN = sd, fill = NA, align = "right"),
      target_consistency = 1 / (zoo::rollapply(targets, width = 4, 
                               FUN = function(x) sd(x)/pmax(mean(x), 1), 
                               fill = NA, align = "right") + 0.01),
      
      # Trend directions
      td_trend = total_tds - lag(total_tds, 2),
      usage_trend = touch_share - lag(touch_share, 2),
      efficiency_trend = (yards_per_target + yards_per_carry) - 
                        lag(yards_per_target + yards_per_carry, 2),
      
      # Season progression
      games_played = row_number(),
      season_td_pace = total_tds * (17 / games_played),
      
      # Clutch performance (approximated) - skip if score_differential not available
      clutch_tds = tryCatch({
        zoo::rollmean(total_tds * (abs(score_differential) <= 7), 
                      k = 6, fill = NA, align = "right")
      }, error = function(e) NA_real_),
      
      # Recent form weight (more recent games weighted higher)
      recent_form_tds = (lag(total_tds, 1) * 0.5 + 
                        lag(total_tds, 2) * 0.3 + 
                        lag(total_tds, 3) * 0.2),
      
      # Position ranking within team
      team_position_rank = dense_rank(desc(td_rate_4wk))
    ) %>%
    ungroup()
  
  cat(glue("✅ Player Features created: {nrow(player_rolling_stats)} player-weeks\n"))
  
  return(player_rolling_stats)
}

# Advanced Situational Features with Playcalling & Explosiveness
create_situational_features <- function(pbp_data) {
  cat("🎮 Creating Situational and Playcalling Features...\n")
  
  # Enhanced situational stats by team
  situational_stats <- pbp_data %>%
    mutate(
      # Enhanced game script features
      score_differential_binned = case_when(
        score_differential > 14 ~ "large_lead",
        score_differential > 7 ~ "moderate_lead", 
        score_differential >= -7 ~ "close_game",
        score_differential > -14 ~ "moderate_deficit",
        TRUE ~ "large_deficit"
      ),
      
      # Time context
      time_context = case_when(
        qtr == 1 ~ "first_quarter",
        qtr == 2 & time_remaining_game > 2 ~ "second_quarter",
        qtr == 2 & time_remaining_game <= 2 ~ "two_minute_drill",
        qtr == 3 ~ "third_quarter", 
        qtr == 4 & time_remaining_game > 5 ~ "fourth_quarter",
        qtr == 4 & time_remaining_game <= 5 ~ "crunch_time",
        TRUE ~ "overtime"
      ),
      
      # Enhanced down and distance
      leverage_situation = case_when(
        down == 3 & ydstogo > 7 ~ "high_leverage_pass",
        down == 3 & ydstogo <= 3 ~ "high_leverage_short", 
        down == 4 ~ "fourth_down",
        down == 1 & field_position_value == "goal_line" ~ "goal_line_opportunity",
        field_position_value %in% c("red_zone_inner", "red_zone_outer") ~ "red_zone",
        TRUE ~ "standard"
      )
    ) %>%
    
    # Team-level situational analysis
    group_by(posteam, season, week) %>%
    summarise(
      # Basic playcalling tendencies
      pass_rate = mean(play_type == "pass", na.rm = TRUE),
      run_rate = mean(play_type == "run", na.rm = TRUE),
      
      # Situational tendencies with context
      red_zone_pass_rate = mean(play_type == "pass" & 
                               field_position_value %in% 
                               c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
      goal_line_run_rate = mean(play_type == "run" & 
                              field_position_value == "goal_line", na.rm = TRUE),
      short_yardage_run_rate = mean(play_type == "run" & 
                                  situation == "short_yardage", na.rm = TRUE),
      
      # Formation and tempo preferences
      shotgun_rate = mean(shotgun == 1, na.rm = TRUE),
      no_huddle_rate = mean(no_huddle == 1, na.rm = TRUE),
      
      # Aggressiveness metrics
      deep_shot_rate = mean(air_yards >= 20 & play_type == "pass", na.rm = TRUE),
      fourth_down_attempt_rate = mean(down == 4, na.rm = TRUE),
      
      # Pace and efficiency
      plays_per_drive = mean(drive, na.rm = TRUE),
      seconds_per_play = mean(30 - (game_seconds_remaining %% 40), na.rm = TRUE), # Approximation
      
      # Red zone creativity and personnel usage
      rz_wr_usage = sum(play_type == "pass" & 
                       field_position_value %in% c("red_zone_inner", "red_zone_outer") & 
                       !is.na(receiver_player_id), na.rm = TRUE) / 
                    pmax(sum(field_position_value %in% c("red_zone_inner", "red_zone_outer"), na.rm = TRUE), 1),
      
      rz_rb_usage = sum(play_type == "run" & 
                       field_position_value %in% c("red_zone_inner", "red_zone_outer"), na.rm = TRUE) /
                    pmax(sum(field_position_value %in% c("red_zone_inner", "red_zone_outer"), na.rm = TRUE), 1),
      
      # Game script adaptation
      positive_script_pass_rate = mean(play_type == "pass" & score_differential > 7, na.rm = TRUE),
      negative_script_pass_rate = mean(play_type == "pass" & score_differential < -7, na.rm = TRUE),
      
      # Explosiveness generation
      explosive_play_rate = mean(explosive_play == 1, na.rm = TRUE),
      yac_generation_rate = mean(yac_opportunity == 1, na.rm = TRUE),
      
      .groups = "drop"
    ) %>%
    
    # Rolling playcalling trends
    arrange(posteam, season, week) %>%
    group_by(posteam) %>%
    mutate(
      # Trend analysis
      pass_rate_trend = pass_rate - lag(pass_rate, 4),
      red_zone_pass_trend = red_zone_pass_rate - lag(red_zone_pass_rate, 4),
      pace_trend = seconds_per_play - lag(seconds_per_play, 4),
      explosive_trend = explosive_play_rate - lag(explosive_play_rate, 4),
      
      # Stability metrics
      playcalling_consistency = 1 / (zoo::rollapply(pass_rate, width = 4, 
                                     FUN = sd, fill = NA, align = "right") + 0.01),
      
      # Context adaptation
      script_adaptability = abs(positive_script_pass_rate - negative_script_pass_rate)
    ) %>%
    ungroup()
  
  cat(glue("✅ Situational Features created: {nrow(situational_stats)} team-weeks\n"))
  
  return(situational_stats)
}

# YAC and Explosiveness Analysis
create_explosiveness_features <- function(pbp_data) {
  cat("💥 Creating Explosiveness and YAC Features...\n")
  
  explosiveness_stats <- pbp_data %>%
    filter(!is.na(yards_gained)) %>%
    group_by(posteam, defteam, season, week) %>%
    summarise(
      # Offensive explosiveness by position
      rb_explosive_rate = sum(play_type == "run" & yards_gained >= 15, na.rm = TRUE) /
                         pmax(sum(play_type == "run"), 1),
      wr_explosive_rate = sum(play_type == "pass" & !is.na(receiver_player_id) &
                             yards_gained >= 20, na.rm = TRUE) /
                         pmax(sum(play_type == "pass" & !is.na(receiver_player_id)), 1),
      
      # YAC ability
      avg_yac = mean(yards_after_catch, na.rm = TRUE),
      yac_efficiency = sum(yards_after_catch, na.rm = TRUE) / 
                      pmax(sum(air_yards, na.rm = TRUE), 1),
      
      # Broken play ability
      scramble_rate = sum(qb_scramble == 1, na.rm = TRUE) /
                     pmax(sum(play_type == "pass"), 1),
      
      # Situation-specific explosiveness
      early_down_explosive = mean(explosive_play & down <= 2, na.rm = TRUE),
      third_down_explosive = mean(explosive_play & down == 3, na.rm = TRUE),
      red_zone_explosive = mean(explosive_play & 
                               field_position_value %in% 
                               c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
      
      .groups = "drop"
    ) %>%
    
    # Rolling explosiveness trends
    arrange(posteam, season, week) %>%
    group_by(posteam) %>%
    mutate(
      explosive_trend_4wk = zoo::rollmean(rb_explosive_rate + wr_explosive_rate, 
                                         k = 4, fill = NA, align = "right"),
      yac_trend_4wk = zoo::rollmean(avg_yac, k = 4, fill = NA, align = "right"),
      consistency_explosive = 1 / (zoo::rollapply(rb_explosive_rate + wr_explosive_rate, 
                                                 width = 4, FUN = sd, 
                                                 fill = NA, align = "right") + 0.01)
    ) %>%
    ungroup()
  
  cat(glue("✅ Explosiveness Features created: {nrow(explosiveness_stats)} matchups\n"))
  
  return(explosiveness_stats)
}

# Advanced Defensive Matchup Analysis  
create_defense_features <- function(pbp_data) {
  cat("🛡️ Creating Advanced Defensive Features...\n")
  
  defense_stats <- pbp_data %>%
    group_by(defteam, season, week) %>%
    summarise(
      # Basic TD defense
      tds_allowed_per_game = sum(any_td, na.rm = TRUE),
      passing_tds_allowed = sum(passing_td, na.rm = TRUE),
      rushing_tds_allowed = sum(rushing_td, na.rm = TRUE),
      
      # Red zone defense with context
      red_zone_attempts = sum(field_position_value %in%
                             c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
      red_zone_tds_allowed = sum(any_td == 1 & 
                                field_position_value %in%
                                c("red_zone_inner", "red_zone_outer"), na.rm = TRUE),
      red_zone_td_rate_allowed = red_zone_tds_allowed / pmax(red_zone_attempts, 1),
      
      # Goal line defense
      goal_line_attempts = sum(field_position_value == "goal_line", na.rm = TRUE),
      goal_line_tds_allowed = sum(any_td == 1 & field_position_value == "goal_line", na.rm = TRUE),
      goal_line_stop_rate = 1 - (goal_line_tds_allowed / pmax(goal_line_attempts, 1)),
      
      # Position-specific defense with context
      rb_tds_allowed = sum(rushing_td == 1, na.rm = TRUE) +
                      sum(receiving_td == 1 & !is.na(receiver_player_id), na.rm = TRUE), # RB receiving TDs
      wr_tds_allowed = sum(receiving_td == 1, na.rm = TRUE), # Approximate WR TDs
      
      # Coverage vulnerabilities
      deep_tds_allowed = sum(any_td == 1 & air_yards >= 20, na.rm = TRUE),
      short_yac_tds_allowed = sum(receiving_td == 1 & air_yards <= 5, na.rm = TRUE),
      
      # Explosive play defense
      explosive_passes_allowed = sum(play_type == "pass" & yards_gained >= 20, na.rm = TRUE),
      explosive_runs_allowed = sum(play_type == "run" & yards_gained >= 15, na.rm = TRUE),
      
      # YAC defense
      avg_yac_allowed = mean(yards_after_catch, na.rm = TRUE),
      yac_rate_allowed = sum(yac_opportunity == 1, na.rm = TRUE) / 
                        pmax(sum(play_type == "pass"), 1),
      
      # Situational defense
      third_down_td_rate_allowed = sum(any_td == 1 & down == 3, na.rm = TRUE) /
                                  pmax(sum(down == 3), 1),
      
      # Pressure metrics (approximated)
      sack_rate = sum(sack == 1, na.rm = TRUE) / pmax(sum(play_type == "pass"), 1),
      
      .groups = "drop"
    ) %>%
    
    # Rolling defensive performance
    arrange(defteam, season, week) %>%
    group_by(defteam) %>%
    mutate(
      # Rolling averages
      def_td_rate_4wk = zoo::rollmean(tds_allowed_per_game, k = 4, fill = NA, align = "right"),
      def_rz_rate_4wk = zoo::rollmean(red_zone_td_rate_allowed, k = 4, fill = NA, align = "right"),
      
      # Position-specific trends
      rb_td_allowed_trend = zoo::rollmean(rb_tds_allowed, k = 4, fill = NA, align = "right"),
      wr_td_allowed_trend = zoo::rollmean(wr_tds_allowed, k = 4, fill = NA, align = "right"),
      
      # Advanced trends
      explosive_defense_trend = zoo::rollmean(explosive_passes_allowed + explosive_runs_allowed,
                                            k = 4, fill = NA, align = "right"),
      yac_allowed_trend = zoo::rollmean(avg_yac_allowed, k = 4, fill = NA, align = "right"),
      
      # Defense ranking approximation
      def_rank_approx = dense_rank(def_td_rate_4wk),
      
      # Improvement/decline trends
      def_trend = def_td_rate_4wk - lag(def_td_rate_4wk, 4),
      explosive_def_trend = explosive_defense_trend - lag(explosive_defense_trend, 4)
    ) %>%
    ungroup()
  
  cat(glue("✅ Defensive Features created: {nrow(defense_stats)} team-weeks\n"))
  
  return(defense_stats)
}

# Detailed Matchup Analysis
create_matchup_features <- function(offensive_features, defensive_features, schedule_data) {
  cat("⚔️ Creating Advanced Matchup Features...\n")
  
  # Get current week matchups
  current_matchups <- schedule_data %>%
    filter(week == max(week)) %>%
    select(game_id, week, home_team, away_team) %>%
    pivot_longer(cols = c(home_team, away_team), names_to = "home_away", values_to = "team") %>%
    mutate(opponent = ifelse(home_away == "home_team", 
                           schedule_data$away_team[match(game_id, schedule_data$game_id)],
                           schedule_data$home_team[match(game_id, schedule_data$game_id)]))
  
  matchup_analysis <- current_matchups %>%
    left_join(offensive_features %>% filter(week == max(week)), 
              by = c("team" = "posteam", "week")) %>%
    left_join(defensive_features %>% filter(week == max(week)),
              by = c("opponent" = "defteam", "week")) %>%
    mutate(
      # Explosive play matchups
      explosive_advantage = case_when(
        explosive_trend_4wk > explosive_defense_trend * 1.2 ~ "major_advantage",
        explosive_trend_4wk > explosive_defense_trend * 1.1 ~ "advantage", 
        explosive_trend_4wk < explosive_defense_trend * 0.9 ~ "disadvantage",
        explosive_trend_4wk < explosive_defense_trend * 0.8 ~ "major_disadvantage",
        TRUE ~ "neutral"
      ),
      
      # YAC matchups
      yac_matchup = case_when(
        yac_trend_4wk > yac_allowed_trend * 1.15 ~ "yac_advantage",
        yac_trend_4wk < yac_allowed_trend * 0.85 ~ "yac_disadvantage", 
        TRUE ~ "yac_neutral"
      ),
      
      # Red zone matchups
      red_zone_matchup = case_when(
        red_zone_pass_rate > 0.6 & def_rz_rate_4wk > 0.15 ~ "pass_vs_weak_rz_def",
        goal_line_run_rate > 0.7 & goal_line_stop_rate < 0.3 ~ "run_vs_weak_gl_def",
        red_zone_pass_rate > 0.6 & def_rz_rate_4wk < 0.1 ~ "pass_vs_strong_rz_def",
        TRUE ~ "standard_rz_matchup"
      ),
      
      # Pace advantages
      pace_advantage = case_when(
        no_huddle_rate > 0.3 & explosive_defense_trend > 3 ~ "pace_vs_tired_def",
        seconds_per_play < 25 & def_trend > 0 ~ "pace_vs_declining_def",
        TRUE ~ "standard_pace"
      ),
      
      # Overall matchup rating
      matchup_rating = case_when(
        explosive_advantage %in% c("major_advantage", "advantage") &
        yac_matchup == "yac_advantage" ~ "excellent",
        explosive_advantage %in% c("major_advantage", "advantage") |
        yac_matchup == "yac_advantage" ~ "good",
        explosive_advantage %in% c("major_disadvantage", "disadvantage") &
        yac_matchup == "yac_disadvantage" ~ "poor",
        explosive_advantage %in% c("major_disadvantage", "disadvantage") |
        yac_matchup == "yac_disadvantage" ~ "below_average",
        TRUE ~ "average"
      )
    ) %>%
    select(
      game_id, team, opponent, week,
      explosive_advantage, yac_matchup, red_zone_matchup, 
      pace_advantage, matchup_rating
    )
  
  cat(glue("✅ Matchup Features created: {nrow(matchup_analysis)} team matchups\n"))
  
  return(matchup_analysis)
}

# Master feature combination function
combine_all_features <- function(pbp_data, roster_data, schedule_data, weeks_lookback = 8) {
  cat("🔄 Combining All Advanced Features...\n")
  
  # Create all feature sets
  player_features <- create_player_features(pbp_data, roster_data, weeks_lookback)
  situational_features <- create_situational_features(pbp_data)  
  explosiveness_features <- create_explosiveness_features(pbp_data)
  defense_features <- create_defense_features(pbp_data)
  matchup_features <- create_matchup_features(situational_features, defense_features, schedule_data)
  
  # Combine player features with team context
  master_features <- player_features %>%
    left_join(situational_features, by = c("posteam", "season", "week")) %>%
    left_join(explosiveness_features, by = c("posteam", "season", "week")) %>%
    left_join(defense_features, by = c("posteam" = "defteam", "season", "week")) %>%
    
    # Add current matchup context for latest week
    left_join(matchup_features, by = c("posteam" = "team", "week")) %>%
    
    # Feature engineering and cleanup
    mutate(
      # Position standardization
      position_group = case_when(
        position == "QB" ~ "QB",
        position %in% c("RB", "FB") ~ "RB",
        position %in% c("WR", "FL", "SE") ~ "WR", 
        position %in% c("TE") ~ "TE",
        TRUE ~ "OTHER"
      ),
      
      # Usage tier classification
      usage_tier = case_when(
        touch_share_4wk >= 0.15 ~ "featured",
        touch_share_4wk >= 0.10 ~ "significant", 
        touch_share_4wk >= 0.05 ~ "rotational",
        TRUE ~ "limited"
      ),
      
      # Talent tier (based on recent performance)
      talent_tier = case_when(
        td_rate_4wk >= 1.0 ~ "elite",
        td_rate_4wk >= 0.6 ~ "very_good",
        td_rate_4wk >= 0.3 ~ "good", 
        td_rate_4wk >= 0.1 ~ "average",
        TRUE ~ "below_average"
      ),
      
      # Composite scores
      red_zone_opportunity_score = rz_usage_4wk * (1 - def_rz_rate_4wk),
      explosive_opportunity_score = explosive_rate_4wk * 
                                   case_when(explosive_advantage == "major_advantage" ~ 1.3,
                                           explosive_advantage == "advantage" ~ 1.15,
                                           explosive_advantage == "disadvantage" ~ 0.85,
                                           explosive_advantage == "major_disadvantage" ~ 0.7,
                                           TRUE ~ 1.0),
      
      # Context flags
      is_current_week = week == max(week, na.rm = TRUE),
      has_recent_data = !is.na(td_rate_4wk),
      
      # Player key for tracking
      player_key = paste(player_id, posteam, sep = "_")
    ) %>%
    
    # Filter for relevant players (significant usage or recent TD production)
    filter(
      position_group %in% c("QB", "RB", "WR", "TE"),
      (touch_share_4wk >= 0.03 | total_tds > 0 | is.na(touch_share_4wk))
    ) %>%
    
    # Clean up columns
    select(
      # Identifiers
      player_id, player_key, posteam, season, week, position_group,
      game_id, opponent,
      
      # Core performance metrics
      total_tds, td_rate_2wk, td_rate_4wk, td_rate_8wk, recent_form_tds,
      passing_tds, rushing_tds, receiving_tds, rz_tds, deep_tds,
      
      # Usage metrics
      targets, carries, total_touches, target_share_4wk, carry_share_4wk, 
      touch_share_4wk, rz_usage_4wk, usage_tier,
      
      # Efficiency metrics
      yards_per_target, yards_per_carry, yac_trend_4wk, explosive_rate_4wk,
      
      # Consistency and trends
      td_volatility, target_consistency, td_trend, usage_trend, talent_tier,
      
      # Team context
      pass_rate, red_zone_pass_rate, explosive_trend_4wk, pace_trend,
      
      # Defensive matchup
      def_td_rate_4wk, def_rz_rate_4wk, explosive_defense_trend, 
      yac_allowed_trend,
      
      # Matchup advantages
      explosive_advantage, yac_matchup, red_zone_matchup, matchup_rating,
      
      # Composite scores
      red_zone_opportunity_score, explosive_opportunity_score,
      
      # Context flags
      is_current_week, has_recent_data
    )
  
  cat(glue("✅ Master Features Combined: {nrow(master_features)} player-week records\n"))
  cat(glue("   Current week records: {sum(master_features$is_current_week, na.rm = TRUE)}\n"))
  cat(glue("   Players with recent data: {sum(master_features$has_recent_data, na.rm = TRUE)}\n"))
  
  return(master_features)
}

# Feature validation and quality check
validate_features <- function(features_data) {
  cat("🔍 Validating Feature Quality...\n")
  
  validation_results <- list(
    total_records = nrow(features_data),
    players_current_week = length(unique(features_data$player_id[features_data$is_current_week])),
    position_distribution = table(features_data$position_group[features_data$is_current_week]),
    missing_data_rate = colMeans(is.na(features_data)),
    td_rate_distribution = summary(features_data$td_rate_4wk[!is.na(features_data$td_rate_4wk)])
  )
  
  # Quality flags
  quality_issues <- list(
    high_missing_features = names(validation_results$missing_data_rate)[validation_results$missing_data_rate > 0.5],
    players_no_recent_data = sum(!features_data$has_recent_data & features_data$is_current_week),
    extreme_td_rates = sum(features_data$td_rate_4wk > 3, na.rm = TRUE)
  )
  
  # Print validation summary
  cat("📊 Feature Validation Results:\n")
  cat(glue("   Total records: {validation_results$total_records:,}\n"))
  cat(glue("   Current week players: {validation_results$players_current_week}\n"))
  
  cat("\n   Position distribution (current week):\n")
  print(validation_results$position_distribution)
  
  cat(glue("\n⚠️  Quality Issues:\n"))
  cat(glue("   Players without recent data: {quality_issues$players_no_recent_data}\n"))
  cat(glue("   Features with >50% missing: {length(quality_issues$high_missing_features)}\n"))
  cat(glue("   Extreme TD rates (>3): {quality_issues$extreme_td_rates}\n"))
  
  return(validation_results)
}

# Main feature engineering pipeline
if (!interactive()) {
  cat("🚀 Starting Feature Engineering Pipeline...\n")
  
  # This would be called with the data from the collection script
  # features <- combine_all_features(pbp_data, schedule_data)
  # validation <- validate_features(features)
}