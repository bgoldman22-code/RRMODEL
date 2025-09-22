# Smart Opponent Analysis - Simple But Effective
# 80/20 rule: capture 95% of matchup edge with 20% of the complexity

suppressPackageStartupMessages({
  library(tidyverse)
  library(jsonlite)
  library(glue)
})

# Generate position-specific opponent adjustments (large sample, high confidence)
create_opponent_adjustments <- function(pbp_data, current_season, current_week) {
  
  cat("🎯 Creating smart opponent adjustments (avoiding overcomplication)...\n")
  
  # Basic team defensive efficiency by position (high-value, low-noise)
  team_defense_efficiency <- pbp_data %>%
    filter(season >= current_season - 1, week <= current_week) %>%
    filter(!is.na(td_player_name), !is.na(td_player_position)) %>%
    group_by(defteam, season) %>%
    summarise(
      # Position-specific TD rates allowed (vs league average)
      rb_tds_allowed = sum(td_player_position == "RB", na.rm = TRUE),
      wr_tds_allowed = sum(td_player_position == "WR", na.rm = TRUE),
      te_tds_allowed = sum(td_player_position == "TE", na.rm = TRUE),
      total_games = n_distinct(game_id),
      
      # Red zone defense (meaningful sample)
      rz_attempts = sum(yardline_100 <= 20, na.rm = TRUE),
      rz_tds_allowed = sum(yardline_100 <= 20 & touchdown == 1, na.rm = TRUE),
      
      # Goal line defense (simple but effective)
      goal_line_attempts = sum(yardline_100 <= 5, na.rm = TRUE),
      goal_line_tds_allowed = sum(yardline_100 <= 5 & touchdown == 1, na.rm = TRUE),
      
      .groups = "drop"
    ) %>%
    
    # Calculate per-game rates
    mutate(
      rb_tds_per_game = rb_tds_allowed / total_games,
      wr_tds_per_game = wr_tds_allowed / total_games,
      te_tds_per_game = te_tds_allowed / total_games,
      rz_conversion_rate_allowed = rz_tds_allowed / pmax(rz_attempts, 1),
      goal_line_conversion_rate_allowed = goal_line_tds_allowed / pmax(goal_line_attempts, 1)
    )
  
  # Calculate league averages for normalization
  league_averages <- team_defense_efficiency %>%
    summarise(
      avg_rb_tds_per_game = mean(rb_tds_per_game, na.rm = TRUE),
      avg_wr_tds_per_game = mean(wr_tds_per_game, na.rm = TRUE),
      avg_te_tds_per_game = mean(te_tds_per_game, na.rm = TRUE),
      avg_rz_conversion_rate = mean(rz_conversion_rate_allowed, na.rm = TRUE),
      avg_goal_line_conversion_rate = mean(goal_line_conversion_rate_allowed, na.rm = TRUE)
    )
  
  # Create position multipliers (vs league average)
  opponent_multipliers <- team_defense_efficiency %>%
    mutate(
      rb_td_multiplier = rb_tds_per_game / league_averages$avg_rb_tds_per_game,
      wr_td_multiplier = wr_tds_per_game / league_averages$avg_wr_tds_per_game,
      te_td_multiplier = te_tds_per_game / league_averages$avg_te_tds_per_game,
      rz_defense_multiplier = rz_conversion_rate_allowed / league_averages$avg_rz_conversion_rate,
      goal_line_multiplier = goal_line_conversion_rate_allowed / league_averages$avg_goal_line_conversion_rate
    ) %>%
    select(defteam, season, rb_td_multiplier, wr_td_multiplier, te_td_multiplier, 
           rz_defense_multiplier, goal_line_multiplier)
  
  return(opponent_multipliers)
}

# Elite defender impact (only obvious cases, avoid overcomplication)
create_elite_defender_impact <- function(pbp_data, roster_data, current_season) {
  
  cat("🛡️ Identifying elite defender impacts (high-confidence only)...\n")
  
  # Only track defenders with clear, measurable impact (avoid rabbit holes)
  elite_defenders <- tribble(
    ~player_name, ~team, ~position, ~primary_impact, ~impact_magnitude,
    
    # Elite CBs (only clear shutdown corners)
    "Sauce Gardner", "NYJ", "CB", "wr1_reduction", -0.15,
    "Jalen Ramsey", "MIA", "CB", "wr1_reduction", -0.12,
    "Tre'Davious White", "BUF", "CB", "wr1_reduction", -0.10,
    
    # Elite Safeties (clear TE/slot impact)
    "Minkah Fitzpatrick", "PIT", "S", "te_reduction", -0.08,
    "Derwin James", "LAC", "S", "te_reduction", -0.10,
    
    # Elite Pass Rush (QB rushing TD impact)
    "T.J. Watt", "PIT", "LB", "qb_rush_reduction", -0.20,
    "Myles Garrett", "CLE", "DE", "qb_rush_reduction", -0.15,
    
    # Elite Run Defense (RB TD impact in specific situations)
    "Aaron Donald", "LAR", "DT", "goal_line_rb_reduction", -0.12
  ) %>%
  mutate(season = current_season)
  
  cat(glue("📋 Tracking {nrow(elite_defenders)} elite defenders with proven impact\n"))
  
  return(elite_defenders)
}

# Simple situational adjustments (avoid overengineering)
create_situational_adjustments <- function() {
  
  cat("🌦️ Creating situational adjustments (weather, venue, basic factors)...\n")
  
  situational_factors <- list(
    # Weather impact (simple but effective)
    weather_adjustments = list(
      outdoor_wind_15plus = -0.08,  # Passing TDs reduced in high wind
      outdoor_rain_heavy = -0.06,   # All TDs slightly reduced
      dome_game = 0.02              # Slight boost for controlled environment
    ),
    
    # Venue type impact (basic but reliable)
    venue_adjustments = list(
      outdoor_cold = -0.05,         # Cold weather games
      altitude_high = 0.03,         # Denver effect
      retractable_roof = 0.01       # Slight controlled environment boost
    ),
    
    # Game situation (don't overcomplicate)
    game_script_adjustments = list(
      heavy_favorite = list(rb_boost = 0.05, wr_reduction = -0.02), # More running
      heavy_underdog = list(wr_boost = 0.05, rb_reduction = -0.02), # More passing
      divisional_game = 0.02        # Slight unpredictability boost
    )
  )
  
  return(situational_factors)
}

# Apply opponent adjustments (smart but simple)
apply_opponent_adjustments <- function(player_prediction, opponent_team, game_context) {
  
  # Load opponent data
  opponent_file <- "data/nfl_r_pipeline/opponent_adjustments.json"
  if (!file.exists(opponent_file)) {
    cat("⚠️ No opponent adjustment data found, using neutral adjustments\n")
    return(player_prediction)
  }
  
  opponent_data <- fromJSON(opponent_file)
  elite_defenders <- fromJSON("data/nfl_r_pipeline/elite_defenders.json")
  
  # Get team-specific multipliers
  team_multipliers <- opponent_data %>%
    filter(defteam == opponent_team) %>%
    slice_tail(n = 1)  # Most recent season
  
  if (nrow(team_multipliers) == 0) {
    cat(glue("⚠️ No data for opponent {opponent_team}, using league average\n"))
    position_multiplier <- 1.0
    rz_multiplier <- 1.0
  } else {
    # Get position-specific multiplier
    position_multiplier <- case_when(
      player_prediction$position == "RB" ~ team_multipliers$rb_td_multiplier,
      player_prediction$position == "WR" ~ team_multipliers$wr_td_multiplier,
      player_prediction$position == "TE" ~ team_multipliers$te_td_multiplier,
      TRUE ~ 1.0
    )
    
    rz_multiplier <- team_multipliers$rz_defense_multiplier
  }
  
  # Elite defender impact (only clear cases)
  elite_impact <- 0
  if (player_prediction$position == "WR" && player_prediction$depth_chart_position == 1) {
    elite_cb_present <- elite_defenders %>%
      filter(team == opponent_team, position == "CB") %>%
      nrow() > 0
    
    if (elite_cb_present) {
      elite_impact <- elite_defenders %>%
        filter(team == opponent_team, position == "CB") %>%
        pull(impact_magnitude) %>%
        first()
    }
  }
  
  # Apply adjustments
  adjusted_probability <- player_prediction$base_probability * 
                         position_multiplier * 
                         (1 + elite_impact)
  
  # Confidence adjustment based on matchup clarity
  confidence_adjustment <- case_when(
    abs(position_multiplier - 1.0) > 0.2 ~ 5,   # Clear good/bad matchup
    elite_impact < -0.1 ~ -8,                   # Elite defender impact
    abs(position_multiplier - 1.0) < 0.1 ~ 0,   # Neutral matchup
    TRUE ~ 2
  )
  
  return(list(
    adjusted_probability = pmax(0.01, pmin(0.95, adjusted_probability)),
    confidence_adjustment = confidence_adjustment,
    matchup_notes = generate_matchup_summary(position_multiplier, elite_impact, opponent_team)
  ))
}

# Generate simple matchup summary (avoid over-analysis)
generate_matchup_summary <- function(position_multiplier, elite_impact, opponent_team) {
  
  summary_parts <- c()
  
  if (position_multiplier > 1.15) {
    summary_parts <- c(summary_parts, "Favorable matchup")
  } else if (position_multiplier < 0.85) {
    summary_parts <- c(summary_parts, "Tough matchup")
  }
  
  if (elite_impact < -0.05) {
    summary_parts <- c(summary_parts, "Elite defender impact")
  }
  
  if (length(summary_parts) == 0) {
    return("Neutral matchup")
  } else {
    return(paste(summary_parts, collapse = ", "))
  }
}

cat("✅ Smart opponent analysis loaded - simple but effective approach!\n")