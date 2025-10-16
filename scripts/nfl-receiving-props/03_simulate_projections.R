# NFL Receiving Props - Simulation & Prediction Engine
# Monte Carlo simulation: Targets → Receptions → Yards
# Author: RR Model
# Date: 2025-10-16

suppressPackageStartupMessages({
  library(tidyverse)
  library(glue)
  library(jsonlite)
})

cat("🎲 NFL RECEIVING PROPS - Simulation Engine\n")
cat("===========================================\n\n")

# Load models and data
DATA_DIR <- "data/nfl_receiving_props"

models <- readRDS(file.path(DATA_DIR, "prediction_models.rds"))
player_stats <- readRDS(file.path(DATA_DIR, "player_season_stats.rds"))
rolling_stats <- readRDS(file.path(DATA_DIR, "player_rolling_stats.rds"))

target_model <- models$target_model
catch_rate_model <- models$catch_rate_model
yards_model <- models$yards_model

cat("✅ Loaded prediction models\n\n")

# ============================================================================
# PLAYER PROJECTION FUNCTION
# ============================================================================

project_player_receiving <- function(
  player_id,
  player_data,
  n_sims = 10000,
  opponent_defense_adj = 1.0,
  injury_target_adj = 1.0,
  game_script_factor = 1.0
) {
  
  # Step 1: Project targets (Poisson/NB)
  # Use player's L10 rolling average as baseline
  baseline_targets <- player_data$targets_l10
  baseline_catch_rate <- player_data$catch_rate_l10
  baseline_yards <- player_data$yards_l10
  
  # Predict mean targets using fitted model
  pred_df <- data.frame(
    baseline_targets = baseline_targets,
    catch_rate_l10 = baseline_catch_rate,
    yards_l10 = baseline_yards
  )
  
  mean_targets <- predict(target_model, newdata = pred_df, type = "response")
  
  # Apply adjustments
  mean_targets <- mean_targets * opponent_defense_adj * injury_target_adj * game_script_factor
  
  # Simulate targets
  if (class(target_model)[1] == "negbin") {
    # Negative binomial
    theta <- target_model$theta
    targets_sim <- rnbinom(n_sims, size = theta, mu = mean_targets)
  } else {
    # Poisson
    targets_sim <- rpois(n_sims, lambda = mean_targets)
  }
  
  # Step 2: For each simulated target count, simulate receptions
  # Use average catch rate from logistic model
  # Simplified: use player's historical catch rate (can enhance with game context)
  catch_rate <- baseline_catch_rate
  receptions_sim <- rbinom(n_sims, size = targets_sim, prob = catch_rate)
  
  # Step 3: For each reception, simulate yards
  # Use Gamma distribution parameters from model
  # Simplified: use player's historical yards per reception
  ypr <- baseline_yards / max(baseline_catch_rate * baseline_targets, 1)  # Yards per reception
  
  # Gamma parameters (method of moments from yards model)
  yards_shape <- 2.0  # Typical shape for receiving yards
  yards_rate <- yards_shape / ypr
  
  yards_sim <- sapply(receptions_sim, function(recs) {
    if (recs == 0) return(0)
    sum(rgamma(recs, shape = yards_shape, rate = yards_rate))
  })
  
  # Calculate probabilities for various lines
  calculate_line_probs <- function(sims, lines) {
    sapply(lines, function(line) mean(sims > line))
  }
  
  # Standard prop lines
  reception_lines <- seq(1.5, 10.5, by = 1)
  yards_lines <- seq(9.5, 149.5, by = 10)
  
  return(list(
    player_id = player_id,
    player_name = player_data$receiver_player_name,
    team = player_data$posteam,
    
    # Projected means
    projected_targets = mean(targets_sim),
    projected_receptions = mean(receptions_sim),
    projected_yards = mean(yards_sim),
    
    # Distributions (for downstream analysis)
    targets_dist = targets_sim,
    receptions_dist = receptions_sim,
    yards_dist = yards_sim,
    
    # Line probabilities
    reception_probs = data.frame(
      line = reception_lines,
      prob_over = calculate_line_probs(receptions_sim, reception_lines)
    ),
    
    yards_probs = data.frame(
      line = yards_lines,
      prob_over = calculate_line_probs(yards_sim, yards_lines)
    ),
    
    # Metadata
    n_sims = n_sims,
    baseline_data = list(
      targets_l10 = baseline_targets,
      catch_rate_l10 = baseline_catch_rate,
      yards_l10 = baseline_yards
    )
  ))
}

# ============================================================================
# BATCH PROJECTION FOR ALL PLAYERS
# ============================================================================

project_week_receiving_props <- function(current_week = 7, season = 2025) {
  cat(glue("🎯 Projecting Week {current_week} receiving props...\n\n"))
  
  # Get players with recent activity (L10 games available)
  active_players <- rolling_stats %>%
    filter(
      season == !!season,
      week == !!current_week - 1,  # Use prior week's data
      !is.na(targets_l10),
      targets_l10 >= 2  # At least 2 targets/game average
    )
  
  cat(glue("📊 Found {nrow(active_players)} active players to project\n"))
  
  # Project each player
  projections <- list()
  
  pb <- txtProgressBar(min = 0, max = nrow(active_players), style = 3)
  
  for (i in 1:nrow(active_players)) {
    player_data <- active_players[i, ]
    
    proj <- tryCatch({
      project_player_receiving(
        player_id = player_data$receiver_player_id,
        player_data = player_data,
        n_sims = 10000
      )
    }, error = function(e) {
      NULL
    })
    
    if (!is.null(proj)) {
      projections[[i]] <- proj
    }
    
    setTxtProgressBar(pb, i)
  }
  
  close(pb)
  
  cat(glue("\n✅ Projected {length(projections)} players successfully\n\n"))
  
  return(projections)
}

# ============================================================================
# CONVERT TO SIMPLIFIED OUTPUT FORMAT
# ============================================================================

format_projections_for_export <- function(projections) {
  
  props_export <- map_dfr(projections, function(proj) {
    
    # Find best line for receptions (closest to 50% probability)
    best_rec_line <- proj$reception_probs %>%
      mutate(distance_from_50 = abs(prob_over - 0.5)) %>%
      filter(distance_from_50 == min(distance_from_50)) %>%
      slice(1)
    
    # Find best line for yards
    best_yards_line <- proj$yards_probs %>%
      mutate(distance_from_50 = abs(prob_over - 0.5)) %>%
      filter(distance_from_50 == min(distance_from_50)) %>%
      slice(1)
    
    data.frame(
      player_id = proj$player_id,
      player_name = proj$player_name,
      team = proj$team,
      
      # Projections
      proj_targets = round(proj$projected_targets, 2),
      proj_receptions = round(proj$projected_receptions, 2),
      proj_yards = round(proj$projected_yards, 1),
      
      # Best lines
      rec_line = best_rec_line$line,
      rec_prob_over = round(best_rec_line$prob_over, 3),
      
      yards_line = best_yards_line$line,
      yards_prob_over = round(best_yards_line$prob_over, 3),
      
      stringsAsFactors = FALSE
    )
  })
  
  return(props_export)
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main <- function() {
  start_time <- Sys.time()
  
  # Project Week 7 props
  projections <- project_week_receiving_props(current_week = 7, season = 2025)
  
  # Format for export
  props_export <- format_projections_for_export(projections)
  
  # Save full projections (with distributions)
  saveRDS(projections, file.path(DATA_DIR, "week7_projections_full.rds"))
  
  # Save simplified CSV
  write_csv(props_export, file.path(DATA_DIR, "week7_projections_simple.csv"))
  
  # Save JSON for JavaScript
  write_json(props_export, file.path(DATA_DIR, "week7_projections.json"), pretty = TRUE)
  
  cat("\n💾 Saved projections:\n")
  cat(glue("  - {DATA_DIR}/week7_projections_full.rds (full distributions)\n"))
  cat(glue("  - {DATA_DIR}/week7_projections_simple.csv (summary)\n"))
  cat(glue("  - {DATA_DIR}/week7_projections.json (for JS)\n\n"))
  
  # Summary stats
  cat("📊 Projection Summary:\n")
  cat(strrep("=", 50) , "\n")
  cat(glue("  Players projected: {nrow(props_export)}\n"))
  cat(glue("  Avg proj receptions: {round(mean(props_export$proj_receptions), 2)}\n"))
  cat(glue("  Avg proj yards: {round(mean(props_export$proj_yards), 1)}\n\n"))
  
  # Top projected players
  cat("🌟 Top 10 Projected Receptions:\n")
  top_rec <- props_export %>%
    arrange(desc(proj_receptions)) %>%
    head(10) %>%
    select(player_name, team, proj_receptions, rec_line, rec_prob_over)
  
  print(top_rec, row.names = FALSE)
  
  cat("\n🌟 Top 10 Projected Yards:\n")
  top_yards <- props_export %>%
    arrange(desc(proj_yards)) %>%
    head(10) %>%
    select(player_name, team, proj_yards, yards_line, yards_prob_over)
  
  print(top_yards, row.names = FALSE)
  
  # Timing
  end_time <- Sys.time()
  elapsed <- round(as.numeric(difftime(end_time, start_time, units = "secs")), 1)
  
  cat("\n" , strrep("=", 50) , "\n")
  cat("✅ PROJECTIONS COMPLETE\n")
  cat(strrep("=", 50) , "\n")
  cat(glue("⏱️  Elapsed time: {elapsed} seconds\n\n"))
  
  return(invisible(props_export))
}

# Run if executed directly
if (!interactive()) {
  main()
}
