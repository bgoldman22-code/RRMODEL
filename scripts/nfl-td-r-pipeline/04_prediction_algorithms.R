# NFL Touchdown Prediction - Enhanced Prediction Algorithms
# Anytime TD, 2+ TD, and First TD Scorer with advanced context

suppressPackageStartupMessages({
  library(tidyverse)
  library(jsonlite)
  library(glue)
})

# Prediction configuration
PREDICTION_CONFIG <- list(
  # Base rates by position (market-calibrated)
  base_rates = list(
    anytime_td = list(QB = 0.18, RB = 0.35, WR = 0.28, TE = 0.22),
    multiple_td = list(QB = 0.05, RB = 0.15, WR = 0.10, TE = 0.08),
    first_td = list(QB = 0.08, RB = 0.12, WR = 0.10, TE = 0.09)
  ),
  
  # Probability bounds
  min_prob = 0.01,
  max_prob_anytime = 0.85,
  max_prob_multiple = 0.65,
  max_prob_first = 0.25,
  
  # Market calibration factors
  market_factors = list(
    home_advantage = 1.05,
    divisional_game = 0.98,
    primetime = 1.03,
    weather_dome = 1.02
  ),
  
  # Confidence thresholds
  confidence_levels = list(
    high = 0.15,    # 15% edge over market
    medium = 0.08,  # 8% edge
    low = 0.04      # 4% edge
  )
)

# Enhanced Anytime Touchdown Prediction
predict_anytime_td <- function(ensemble_models, player_data, current_week_data) {
  cat("🎯 Generating Anytime TD Predictions...\n")
  
  # Get base ensemble predictions
  base_predictions <- generate_ensemble_predictions(ensemble_models, player_data)
  
  # Enhanced predictions with context
  anytime_predictions <- player_data %>%
    filter(is_current_week) %>%
    mutate(
      # Base ensemble probability
      base_prob = base_predictions,
      
      # Position-specific base rate adjustment
      position_base_rate = case_when(
        position_group == "QB" ~ PREDICTION_CONFIG$base_rates$anytime_td$QB,
        position_group == "RB" ~ PREDICTION_CONFIG$base_rates$anytime_td$RB,
        position_group == "WR" ~ PREDICTION_CONFIG$base_rates$anytime_td$WR,
        position_group == "TE" ~ PREDICTION_CONFIG$base_rates$anytime_td$TE,
        TRUE ~ 0.15
      ),
      
      # Enhanced position multipliers with context
      position_multiplier = case_when(
        # Quarterback adjustments
        position_group == "QB" & rz_usage_4wk > 0.2 ~ 1.3,  # Goal line specialists
        position_group == "QB" & explosive_rate_4wk > 0.1 ~ 1.2,  # Mobile QBs
        position_group == "QB" ~ 1.0,
        
        # Running back adjustments  
        position_group == "RB" & usage_tier == "featured" & rz_usage_4wk > 0.3 ~ 1.4,  # Bell cow RBs
        position_group == "RB" & explosive_rate_4wk > 0.15 ~ 1.25,  # Explosive RBs
        position_group == "RB" & usage_tier == "featured" ~ 1.2,
        position_group == "RB" ~ 1.0,
        
        # Wide receiver adjustments
        position_group == "WR" & talent_tier == "elite" ~ 1.15,  # Elite WRs
        position_group == "WR" & target_share_4wk > 0.25 ~ 1.1,   # Alpha WRs
        position_group == "WR" & rz_usage_4wk > 0.15 ~ 1.08,     # Red zone targets
        position_group == "WR" ~ 1.0,
        
        # Tight end adjustments
        position_group == "TE" & rz_usage_4wk > 0.2 ~ 1.2,   # Red zone specialists
        position_group == "TE" & target_share_4wk > 0.15 ~ 1.1, # Featured TEs
        position_group == "TE" ~ 0.95,
        
        TRUE ~ 0.8
      ),
      
      # Advanced matchup multipliers
      matchup_multiplier = case_when(
        # Elite explosive matchup advantage
        explosive_advantage == "major_advantage" & explosive_rate_4wk > 0.12 ~ 1.35,
        explosive_advantage == "major_advantage" ~ 1.25,
        explosive_advantage == "advantage" & explosive_rate_4wk > 0.10 ~ 1.20,
        explosive_advantage == "advantage" ~ 1.15,
        
        # YAC advantages
        yac_matchup == "yac_advantage" & position_group %in% c("WR", "RB") ~ 1.18,
        yac_matchup == "yac_advantage" ~ 1.12,
        
        # Position-specific matchup advantages
        red_zone_matchup == "pass_vs_weak_rz_def" & position_group %in% c("WR", "TE") ~ 1.22,
        red_zone_matchup == "run_vs_weak_gl_def" & position_group == "RB" ~ 1.28,
        
        # Disadvantages
        explosive_advantage == "major_disadvantage" ~ 0.75,
        explosive_advantage == "disadvantage" ~ 0.85,
        yac_matchup == "yac_disadvantage" ~ 0.88,
        
        TRUE ~ 1.0
      ),
      
      # Enhanced usage context multipliers
      usage_multiplier = case_when(
        # High usage with quality matchup
        usage_tier == "featured" & matchup_rating %in% c("excellent", "good") ~ 1.20,
        usage_tier == "featured" ~ 1.12,
        usage_tier == "significant" & matchup_rating == "excellent" ~ 1.15,
        usage_tier == "significant" ~ 1.05,
        usage_tier == "rotational" ~ 0.90,
        usage_tier == "limited" ~ 0.75,
        TRUE ~ 1.0
      ),
      
      # Game environment multipliers
      game_environment_multiplier = case_when(
        # High-scoring game environments
        matchup_rating == "excellent" & explosive_trend_4wk > 0.10 ~ 1.15,
        matchup_rating %in% c("excellent", "good") ~ 1.08,
        matchup_rating %in% c("poor", "below_average") ~ 0.92,
        pace_advantage == "pace_vs_tired_def" ~ 1.12,
        TRUE ~ 1.0
      ),
      
      # Recent form and trend multipliers
      form_multiplier = case_when(
        # Hot streaks
        recent_form_tds > td_rate_4wk * 1.5 & td_trend > 0 ~ 1.20,
        recent_form_tds > td_rate_4wk & td_trend > 0 ~ 1.12,
        td_trend > 0.5 ~ 1.08,
        
        # Cold streaks
        recent_form_tds < td_rate_4wk * 0.5 & td_trend < 0 ~ 0.80,
        td_trend < -0.5 ~ 0.88,
        
        TRUE ~ 1.0
      ),
      
      # Consistency and volatility adjustments
      consistency_multiplier = case_when(
        # Consistent performers in good matchups
        target_consistency > 0.8 & matchup_rating %in% c("excellent", "good") ~ 1.08,
        
        # Volatile players (higher upside in favorable spots)
        td_volatility > 1.2 & matchup_rating == "excellent" ~ 1.15,
        td_volatility > 1.0 & explosive_advantage %in% c("major_advantage", "advantage") ~ 1.10,
        
        # Very consistent but low upside
        target_consistency > 0.9 & td_volatility < 0.3 ~ 0.95,
        
        TRUE ~ 1.0
      )
    ) %>%
    
    # Calculate final anytime TD probability
    mutate(
      # Combine all multipliers
      combined_multiplier = position_multiplier * matchup_multiplier * usage_multiplier * 
                          game_environment_multiplier * form_multiplier * consistency_multiplier,
      
      # Apply to base probability with calibration
      adjusted_prob = pmax(
        position_base_rate * combined_multiplier * (base_prob / mean(base_prob, na.rm = TRUE)),
        base_prob * 0.5  # Don't adjust too far from ensemble
      ),
      
      # Final bounds and calibration
      anytime_td_prob = pmax(PREDICTION_CONFIG$min_prob, 
                           pmin(PREDICTION_CONFIG$max_prob_anytime, adjusted_prob)),
      
      # Confidence level
      confidence = case_when(
        anytime_td_prob > position_base_rate * (1 + PREDICTION_CONFIG$confidence_levels$high) ~ "high",
        anytime_td_prob > position_base_rate * (1 + PREDICTION_CONFIG$confidence_levels$medium) ~ "medium",
        anytime_td_prob > position_base_rate * (1 + PREDICTION_CONFIG$confidence_levels$low) ~ "low",
        TRUE ~ "neutral"
      ),
      
      # Convert to American odds
      implied_odds_american = case_when(
        anytime_td_prob >= 0.5 ~ round(-(anytime_td_prob / (1 - anytime_td_prob)) * 100),
        TRUE ~ round(((1 - anytime_td_prob) / anytime_td_prob) * 100)
      )
    ) %>%
    
    select(
      player_id, posteam, position_group, game_id, opponent,
      anytime_td_prob, confidence, implied_odds_american,
      # Context for analysis
      usage_tier, matchup_rating, explosive_advantage, yac_matchup,
      td_rate_4wk, recent_form_tds, combined_multiplier
    )
  
  cat(glue("✅ Anytime TD predictions: {nrow(anytime_predictions)} players\n"))
  
  return(anytime_predictions)
}

# Enhanced Multiple Touchdown (2+) Prediction
predict_multiple_tds <- function(anytime_predictions, player_data) {
  cat("🔥 Generating 2+ TD Predictions...\n")
  
  multiple_predictions <- anytime_predictions %>%
    left_join(
      player_data %>% 
        filter(is_current_week) %>%
        select(player_id, position_group, explosive_rate_4wk, yac_trend_4wk, 
               td_volatility, usage_tier, talent_tier, matchup_rating),
      by = c("player_id", "position_group")
    ) %>%
    mutate(
      # Enhanced base multiple TD rates with context
      base_multiple_rate = case_when(
        # Elite RBs with heavy usage
        position_group == "RB" & usage_tier == "featured" & talent_tier %in% c("elite", "very_good") ~ 0.32,
        position_group == "RB" & usage_tier == "featured" ~ 0.28,
        position_group == "RB" & explosive_rate_4wk > 0.15 ~ 0.25,
        position_group == "RB" ~ 0.22,
        
        # Elite WRs with high usage
        position_group == "WR" & talent_tier == "elite" ~ 0.25,
        position_group == "WR" & usage_tier == "featured" & explosive_rate_4wk > 0.12 ~ 0.22,
        position_group == "WR" & explosive_rate_4wk > 0.12 ~ 0.18,
        position_group == "WR" ~ 0.15,
        
        # TEs in favorable matchups
        position_group == "TE" & matchup_rating %in% c("excellent", "good") ~ 0.20,
        position_group == "TE" ~ 0.16,
        
        # Mobile/goal line QBs
        position_group == "QB" & explosive_rate_4wk > 0.08 ~ 0.15,
        position_group == "QB" ~ 0.12,
        
        TRUE ~ 0.10
      ),
      
      # Explosiveness multiplier (critical for multiple TDs)
      explosiveness_multiplier = case_when(
        explosive_rate_4wk > 0.20 ~ 1.50,  # Extremely explosive
        explosive_rate_4wk > 0.15 ~ 1.35,  # Very explosive
        explosive_rate_4wk > 0.12 ~ 1.20,  # Above average explosive
        explosive_rate_4wk > 0.08 ~ 1.10,  # Decent explosive ability
        explosive_rate_4wk < 0.05 ~ 0.75,  # Low explosive ability
        TRUE ~ 1.0
      ),
      
      # YAC ability (creates multiple scoring opportunities)
      yac_multiplier = case_when(
        yac_trend_4wk > 8 & position_group %in% c("WR", "RB", "TE") ~ 1.30,
        yac_trend_4wk > 6 & position_group %in% c("WR", "RB") ~ 1.18,
        yac_matchup == "yac_advantage" & yac_trend_4wk > 4 ~ 1.25,
        yac_matchup == "yac_advantage" ~ 1.15,
        yac_trend_4wk < 2 ~ 0.85,
        TRUE ~ 1.0
      ),
      
      # Enhanced matchup multiplier for multiple scores
      multiple_matchup_multiplier = case_when(
        # Perfect storm scenarios
        explosive_advantage == "major_advantage" & matchup_rating == "excellent" ~ 1.45,
        explosive_advantage == "major_advantage" & explosive_rate_4wk > 0.15 ~ 1.35,
        explosive_advantage == "advantage" & matchup_rating == "excellent" ~ 1.25,
        explosive_advantage == "major_advantage" ~ 1.20,
        explosive_advantage == "advantage" ~ 1.12,
        
        # Defensive mismatches for specific play types
        yac_matchup == "yac_advantage" & explosive_advantage != "disadvantage" ~ 1.20,
        
        TRUE ~ 1.0
      ),
      
      # Game environment factors (high-scoring games favor multiple TDs)
      game_environment_multiple = case_when(
        matchup_rating == "excellent" & explosive_rate_4wk > 0.10 ~ 1.25,
        matchup_rating %in% c("excellent", "good") ~ 1.15,
        TRUE ~ 1.0
      ),
      
      # Player volatility (boom/bust players more likely for multiple TDs)
      volatility_multiplier = case_when(
        td_volatility > 1.4 & talent_tier %in% c("elite", "very_good") ~ 1.20,  # High variance stars
        td_volatility > 1.2 & explosive_rate_4wk > 0.10 ~ 1.15,  # Boom/bust with ability
        td_volatility > 1.0 ~ 1.08,  # Above average variance
        td_volatility < 0.4 ~ 0.88,  # Very consistent (less multiple TD upside)
        TRUE ~ 1.0
      ),
      
      # Calculate lambda for Poisson approximation
      lambda_multiple = anytime_td_prob * base_multiple_rate * explosiveness_multiplier * 
                       yac_multiplier * multiple_matchup_multiplier * 
                       game_environment_multiple * volatility_multiplier,
      
      # P(X >= 2) = 1 - P(X = 0) - P(X = 1) using Poisson
      multiple_td_prob_raw = 1 - dpois(0, lambda_multiple) - dpois(1, lambda_multiple),
      
      # Cap and bound the probability
      multiple_td_prob = pmax(PREDICTION_CONFIG$min_prob,
                            pmin(PREDICTION_CONFIG$max_prob_multiple, multiple_td_prob_raw)),
      
      # Confidence assessment for multiple TDs
      multiple_confidence = case_when(
        multiple_td_prob > PREDICTION_CONFIG$base_rates$multiple_td[[position_group]] * 1.5 ~ "high",
        multiple_td_prob > PREDICTION_CONFIG$base_rates$multiple_td[[position_group]] * 1.25 ~ "medium",
        multiple_td_prob > PREDICTION_CONFIG$base_rates$multiple_td[[position_group]] * 1.1 ~ "low",
        TRUE ~ "neutral"
      ),
      
      # American odds for multiple TDs
      multiple_odds_american = case_when(
        multiple_td_prob >= 0.5 ~ round(-(multiple_td_prob / (1 - multiple_td_prob)) * 100),
        TRUE ~ round(((1 - multiple_td_prob) / multiple_td_prob) * 100)
      )
    ) %>%
    
    select(
      player_id, posteam, position_group, game_id, opponent,
      anytime_td_prob, multiple_td_prob, multiple_confidence, multiple_odds_american,
      # Analysis context
      explosive_rate_4wk, yac_trend_4wk, td_volatility, lambda_multiple,
      explosiveness_multiplier, yac_multiplier, volatility_multiplier
    )
  
  cat(glue("✅ Multiple TD predictions: {nrow(multiple_predictions)} players\n"))
  
  return(multiple_predictions)
}

# First Touchdown Scorer Prediction  
predict_first_td <- function(anytime_predictions, player_data, game_schedule) {
  cat("🥇 Generating First TD Predictions...\n")
  
  # Calculate first TD adjustments by game
  first_td_predictions <- anytime_predictions %>%
    left_join(
      player_data %>%
        filter(is_current_week) %>%
        select(player_id, position_group, usage_tier, talent_tier, td_rate_4wk),
      by = c("player_id", "position_group")
    ) %>%
    group_by(game_id) %>%
    mutate(
      # First TD context adjustments
      first_td_factor = case_when(
        # Early-game workhorses
        position_group == "RB" & usage_tier == "featured" ~ 1.15,
        position_group == "RB" ~ 1.10,
        
        # Goal line specialists get early opportunities
        position_group == "TE" & matchup_rating %in% c("excellent", "good") ~ 1.12,
        position_group == "TE" ~ 1.05,
        
        # Alpha receivers
        position_group == "WR" & talent_tier %in% c("elite", "very_good") ~ 1.08,
        position_group == "WR" & usage_tier == "featured" ~ 1.05,
        position_group == "WR" ~ 1.0,
        
        # Mobile QBs less likely for first TD (more likely later in game)
        position_group == "QB" ~ 0.90,
        
        TRUE ~ 1.0
      ),
      
      # Adjust anytime probability for first TD context
      first_td_raw_prob = anytime_td_prob * first_td_factor,
      
      # Game-level normalization (ensure reasonable total probability per game)
      game_total_prob = sum(first_td_raw_prob, na.rm = TRUE),
      normalized_prob = first_td_raw_prob / game_total_prob * 0.85,  # 85% chance someone scores first TD
      
      # Apply position-specific caps
      first_td_prob = pmax(
        PREDICTION_CONFIG$min_prob,
        pmin(
          case_when(
            position_group == "RB" ~ 0.20,
            position_group == "WR" ~ 0.15, 
            position_group == "TE" ~ 0.12,
            position_group == "QB" ~ 0.10,
            TRUE ~ 0.08
          ),
          normalized_prob
        )
      ),
      
      # Confidence for first TD
      first_confidence = case_when(
        first_td_prob > 0.12 ~ "high",
        first_td_prob > 0.08 ~ "medium", 
        first_td_prob > 0.05 ~ "low",
        TRUE ~ "neutral"
      ),
      
      # American odds for first TD
      first_odds_american = case_when(
        first_td_prob >= 0.5 ~ round(-(first_td_prob / (1 - first_td_prob)) * 100),
        TRUE ~ round(((1 - first_td_prob) / first_td_prob) * 100)
      )
    ) %>%
    ungroup() %>%
    
    select(
      player_id, posteam, position_group, game_id, opponent,
      anytime_td_prob, first_td_prob, first_confidence, first_odds_american,
      first_td_factor, normalized_prob
    )
  
  cat(glue("✅ First TD predictions: {nrow(first_td_predictions)} players\n"))
  
  return(first_td_predictions)
}

# Generate ensemble predictions (helper function)
generate_ensemble_predictions <- function(ensemble_models, player_data) {
  if (is.null(ensemble_models) || !("validation_performance" %in% names(ensemble_models))) {
    # Fallback: use simple heuristic based on recent performance
    fallback_preds <- player_data %>%
      filter(is_current_week) %>%
      mutate(
        base_prob = pmax(0.05, pmin(0.75, 
          (td_rate_4wk * 0.4 + recent_form_tds * 0.3 + rz_usage_4wk * 0.3) * 
          case_when(
            position_group == "RB" ~ 1.2,
            position_group == "WR" ~ 1.0,
            position_group == "TE" ~ 0.9,
            position_group == "QB" ~ 0.8,
            TRUE ~ 0.7
          )
        ))
      ) %>%
      pull(base_prob)
    
    return(fallback_preds)
  }
  
  # Use actual ensemble model predictions
  feature_cols <- ensemble_models$metadata$feature_columns
  current_data <- player_data %>% filter(is_current_week)
  
  # Generate predictions from ensemble (this would use the actual models)
  # For now, return heuristic-based predictions
  ensemble_preds <- current_data %>%
    mutate(
      ensemble_prob = pmax(0.02, pmin(0.80,
        (td_rate_4wk * 0.35 + touch_share_4wk * 2.5 + rz_usage_4wk * 1.8 + 
         explosive_rate_4wk * 0.8) * 
        case_when(
          position_group == "RB" ~ 1.1,
          position_group == "WR" ~ 1.0, 
          position_group == "TE" ~ 0.95,
          TRUE ~ 0.85
        )
      ))
    ) %>%
    pull(ensemble_prob)
  
  return(ensemble_preds)
}

# Master prediction function
generate_comprehensive_td_predictions <- function(ensemble_models, features_data, schedule_data) {
  cat("🏈 Generating Comprehensive TD Predictions...\n")
  cat("=============================================\n")
  
  # Filter to current week data
  current_week_data <- features_data %>%
    filter(is_current_week, has_recent_data) %>%
    # Only include players with meaningful usage or recent production
    filter(touch_share_4wk >= 0.03 | total_tds > 0 | usage_tier != "limited")
  
  cat(glue("Players for prediction: {nrow(current_week_data)}\n"))
  
  # Step 1: Anytime TD predictions
  anytime_preds <- predict_anytime_td(ensemble_models, current_week_data, current_week_data)
  
  # Step 2: Multiple TD predictions
  multiple_preds <- predict_multiple_tds(anytime_preds, current_week_data)
  
  # Step 3: First TD predictions
  first_preds <- predict_first_td(anytime_preds, current_week_data, schedule_data)
  
  # Combine all predictions
  comprehensive_predictions <- anytime_preds %>%
    left_join(
      multiple_preds %>% 
        select(player_id, multiple_td_prob, multiple_confidence, multiple_odds_american),
      by = "player_id"
    ) %>%
    left_join(
      first_preds %>%
        select(player_id, first_td_prob, first_confidence, first_odds_american),
      by = "player_id"
    ) %>%
    # Add player context
    left_join(
      current_week_data %>%
        select(player_id, td_rate_4wk, target_share_4wk, carry_share_4wk, 
               explosive_rate_4wk, yac_trend_4wk, recent_form_tds),
      by = "player_id"
    ) %>%
    # Final ranking and sorting
    mutate(
      # Overall value score (combination of probability and matchup)
      anytime_value_score = anytime_td_prob * 
                           case_when(confidence == "high" ~ 1.3,
                                   confidence == "medium" ~ 1.1,
                                   confidence == "low" ~ 1.05,
                                   TRUE ~ 1.0),
      
      multiple_value_score = multiple_td_prob *
                           case_when(multiple_confidence == "high" ~ 1.4,
                                   multiple_confidence == "medium" ~ 1.2,  
                                   multiple_confidence == "low" ~ 1.1,
                                   TRUE ~ 1.0),
      
      first_value_score = first_td_prob *
                        case_when(first_confidence == "high" ~ 1.3,
                                first_confidence == "medium" ~ 1.15,
                                first_confidence == "low" ~ 1.05, 
                                TRUE ~ 1.0)
    ) %>%
    arrange(desc(anytime_value_score))
  
  # Summary statistics
  summary_stats <- list(
    total_players = nrow(comprehensive_predictions),
    by_position = table(comprehensive_predictions$position_group),
    anytime_avg = round(mean(comprehensive_predictions$anytime_td_prob) * 100, 1),
    multiple_avg = round(mean(comprehensive_predictions$multiple_td_prob) * 100, 1),
    first_avg = round(mean(comprehensive_predictions$first_td_prob) * 100, 1),
    high_confidence_anytime = sum(comprehensive_predictions$confidence == "high"),
    high_confidence_multiple = sum(comprehensive_predictions$multiple_confidence == "high"),
    high_confidence_first = sum(comprehensive_predictions$first_confidence == "high")
  )
  
  cat("\n📊 Prediction Summary:\n")
  cat(glue("Total players: {summary_stats$total_players}\n"))
  cat("Position distribution:\n")
  print(summary_stats$by_position)
  cat(glue("Average probabilities: Anytime {summary_stats$anytime_avg}%, Multiple {summary_stats$multiple_avg}%, First {summary_stats$first_avg}%\n"))
  cat(glue("High confidence picks: Anytime {summary_stats$high_confidence_anytime}, Multiple {summary_stats$high_confidence_multiple}, First {summary_stats$high_confidence_first}\n"))
  
  return(list(
    predictions = comprehensive_predictions,
    summary = summary_stats,
    metadata = list(
      generated_at = Sys.time(),
      model_version = "enhanced_v1.0",
      week = max(current_week_data$week),
      season = max(current_week_data$season)
    )
  ))
}

# Export predictions to JSON for Node.js consumption
export_predictions_json <- function(predictions_result, output_path = "data/nfl_r_pipeline/predictions.json") {
  cat("💾 Exporting predictions to JSON...\n")
  
  # Structure for Node.js consumption
  json_export <- list(
    metadata = list(
      version = predictions_result$metadata$model_version,
      generated_at = format(predictions_result$metadata$generated_at, "%Y-%m-%dT%H:%M:%SZ"),
      week = predictions_result$metadata$week,
      season = predictions_result$metadata$season,
      total_players = predictions_result$summary$total_players
    ),
    
    predictions = predictions_result$predictions %>%
      select(
        player_id, posteam, position_group, game_id, opponent,
        anytime_td_prob, multiple_td_prob, first_td_prob,
        confidence, multiple_confidence, first_confidence,
        implied_odds_american, multiple_odds_american, first_odds_american,
        anytime_value_score, multiple_value_score, first_value_score,
        td_rate_4wk, target_share_4wk, explosive_rate_4wk
      ) %>%
      # Round probabilities for cleaner JSON
      mutate(
        across(c(anytime_td_prob, multiple_td_prob, first_td_prob), ~round(.x, 4)),
        across(c(td_rate_4wk, target_share_4wk, explosive_rate_4wk), ~round(.x, 3))
      ),
    
    summary = predictions_result$summary
  )
  
  # Write JSON
  write_json(json_export, output_path, pretty = TRUE, auto_unbox = TRUE)
  
  cat(glue("✅ Predictions exported to: {output_path}\n"))
  
  return(output_path)
}

# Main prediction pipeline
if (!interactive()) {
  cat("🚀 Starting Prediction Generation Pipeline...\n")
  
  # This would be called with the ensemble models and features
  # predictions_result <- generate_comprehensive_td_predictions(ensemble_models, features_data, schedule_data)
  # export_predictions_json(predictions_result)
}