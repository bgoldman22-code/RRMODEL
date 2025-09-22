# Miss Analysis System - Signal vs Noise Detection
# Analyzes failed predictions to improve model without overfitting

suppressPackageStartupMessages({
  library(tidyverse)
  library(jsonlite)
  library(glue)
})

# Miss Attribution Framework
analyze_prediction_misses <- function(week_predictions, actual_results, week_num) {
  
  cat(glue("🔍 Analyzing Week {week_num} prediction misses...\n"))
  
  # Join predictions with actual results
  results_comparison <- week_predictions %>%
    left_join(actual_results, by = c("player_id", "week")) %>%
    mutate(
      # Define what constitutes a "miss" for each market
      anytime_miss = predicted_anytime_td > 0.25 & actual_anytime_td == 0,
      first_miss = predicted_first_td > 0.10 & actual_first_td == 0,
      multiple_miss = predicted_multiple_td > 0.15 & actual_multiple_td == 0,
      
      # Calculate prediction gaps
      usage_gap = actual_snap_share - predicted_snap_share,
      opportunity_gap = actual_rz_opportunities - predicted_rz_opportunities,
      conversion_gap = actual_conversion_rate - predicted_conversion_rate
    )
  
  # Categorize misses into SIGNAL vs NOISE
  miss_analysis <- results_comparison %>%
    filter(anytime_miss | first_miss | multiple_miss) %>%
    mutate(
      miss_category = case_when(
        # SIGNAL: Systematic model issues (fix these)
        abs(usage_gap) > 0.3 ~ "usage_model_error",
        abs(opportunity_gap) > 2 ~ "opportunity_model_error", 
        actual_injury_occurred == TRUE ~ "injury_impact",
        abs(actual_game_script - predicted_game_script) > 14 ~ "game_script_miss",
        actual_weather_impact > 0.2 & predicted_weather_impact < 0.1 ~ "weather_underestimate",
        
        # NOISE: Random variance (don't overreact)
        actual_rz_opportunities >= 2 & actual_conversion_rate < 0.3 ~ "conversion_variance",
        actual_rz_opportunities == 0 ~ "opportunity_variance", 
        abs(usage_gap) < 0.15 & abs(opportunity_gap) < 1 ~ "execution_variance",
        fumble_at_goal_line == TRUE ~ "bad_luck_event",
        
        # EDGE CASES: Rare but identifiable
        defensive_td_occurred == TRUE ~ "defensive_score_impact",
        game_had_weather_delay == TRUE ~ "weather_delay_impact",
        
        TRUE ~ "unclear_miss"
      ),
      
      # Classify as signal vs noise
      miss_type = case_when(
        miss_category %in% c("usage_model_error", "opportunity_model_error", 
                            "game_script_miss", "weather_underestimate") ~ "SIGNAL",
        miss_category %in% c("conversion_variance", "opportunity_variance", 
                            "execution_variance", "bad_luck_event") ~ "NOISE",
        TRUE ~ "UNCLEAR"
      )
    )
  
  # Generate miss summary
  miss_summary <- miss_analysis %>%
    count(miss_type, miss_category) %>%
    arrange(desc(n))
  
  # Calculate model adjustment factors based on SIGNAL misses only
  signal_adjustments <- miss_analysis %>%
    filter(miss_type == "SIGNAL") %>%
    group_by(position, miss_category) %>%
    summarise(
      miss_count = n(),
      avg_usage_gap = mean(usage_gap, na.rm = TRUE),
      avg_opportunity_gap = mean(opportunity_gap, na.rm = TRUE),
      avg_game_script_gap = mean(actual_game_script - predicted_game_script, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    filter(miss_count >= 3) # Only adjust if we have enough signal
  
  # Output analysis
  cat(glue("📊 Miss Analysis Summary for Week {week_num}:\n"))
  cat(glue("  SIGNAL misses (fix model): {sum(miss_summary$n[miss_summary$miss_type == 'SIGNAL'])}\n"))
  cat(glue("  NOISE misses (don't overreact): {sum(miss_summary$n[miss_summary$miss_type == 'NOISE'])}\n"))
  cat(glue("  UNCLEAR misses: {sum(miss_summary$n[miss_summary$miss_type == 'UNCLEAR'])}\n\n"))
  
  # Save analysis for learning
  analysis_output <- list(
    week = week_num,
    miss_summary = miss_summary,
    signal_adjustments = signal_adjustments,
    detailed_misses = miss_analysis
  )
  
  # Write to file for learning pipeline
  output_file <- glue("data/nfl_r_pipeline/miss_analysis_week_{week_num}.json")
  write_json(analysis_output, output_file, pretty = TRUE, auto_unbox = TRUE)
  
  cat(glue("✅ Miss analysis saved to {output_file}\n"))
  
  return(analysis_output)
}

# Apply learning from signal misses (don't chase noise!)
update_model_from_misses <- function(historical_miss_data) {
  
  cat("🧠 Updating model parameters from historical SIGNAL misses...\n")
  
  # Load all historical miss analyses
  miss_files <- list.files("data/nfl_r_pipeline/", 
                          pattern = "miss_analysis_week_.*\\.json", 
                          full.names = TRUE)
  
  if (length(miss_files) == 0) {
    cat("ℹ️ No historical miss data found - first run\n")
    return(list())
  }
  
  # Combine all signal adjustments
  all_adjustments <- map_dfr(miss_files, ~{
    data <- fromJSON(.x)
    data$signal_adjustments
  })
  
  # Calculate persistent model biases (only from signal misses)
  model_updates <- all_adjustments %>%
    group_by(position, miss_category) %>%
    summarise(
      total_signal_misses = sum(miss_count),
      avg_usage_bias = mean(avg_usage_gap, na.rm = TRUE),
      avg_opportunity_bias = mean(avg_opportunity_gap, na.rm = TRUE),
      avg_game_script_bias = mean(avg_game_script_gap, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    filter(total_signal_misses >= 5) %>% # Only update with strong signal
    mutate(
      # Calculate adjustment factors
      usage_adjustment = pmin(pmax(avg_usage_bias * 0.5, -0.1), 0.1),
      opportunity_adjustment = pmin(pmax(avg_opportunity_bias * 0.3, -0.5), 0.5),
      game_script_adjustment = pmin(pmax(avg_game_script_bias * 0.2, -3), 3)
    )
  
  cat(glue("📈 Found {nrow(model_updates)} model adjustments from signal misses\n"))
  
  # Save model updates
  write_json(model_updates, "data/nfl_r_pipeline/model_updates.json", 
             pretty = TRUE, auto_unbox = TRUE)
  
  return(model_updates)
}

# Export functions for use in main pipeline
cat("✅ Miss analysis system loaded - ready to distinguish signal from noise!\n")