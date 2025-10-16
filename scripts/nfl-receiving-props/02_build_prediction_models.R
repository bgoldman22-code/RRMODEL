# NFL Receiving Props - Prediction Models
# Three-stage cascade: Targets → Receptions → Yards
# Author: RR Model
# Date: 2025-10-16

suppressPackageStartupMessages({
  library(tidyverse)
  library(glue)
  library(MASS)  # For negative binomial
})

cat("🎯 NFL RECEIVING PROPS - Building Prediction Models\n")
cat("====================================================\n\n")

# Load processed data
DATA_DIR <- "data/nfl_receiving_props"

pbp_data <- readRDS(file.path(DATA_DIR, "pbp_receiving.rds"))
player_stats <- readRDS(file.path(DATA_DIR, "player_season_stats.rds"))
rolling_stats <- readRDS(file.path(DATA_DIR, "player_rolling_stats.rds"))
defense_stats <- readRDS(file.path(DATA_DIR, "defense_stats.rds"))

cat(glue("✅ Loaded {nrow(pbp_data):,} passing plays\n"))
cat(glue("✅ Loaded {nrow(player_stats)} player-seasons\n\n"))

# ============================================================================
# MODEL 1: TARGET PROJECTION (Poisson)
# ============================================================================

cat("📊 MODEL 1: Target Projection\n")
cat(strrep("-", 50) , "\n")

# Prepare player-game level data for target modeling
target_model_data <- rolling_stats %>%
  filter(!is.na(targets_l10)) %>%  # Need at least 10 games of history
  mutate(
    # Features
    is_home = 1,  # Placeholder, will add game context later
    
    # Rolling baselines (use L10 as primary)
    baseline_targets = targets_l10,
    baseline_catch_rate = catch_rate_l10,
    baseline_yards = yards_l10
  )

# Fit Poisson GLM for targets
target_model <- glm(
  targets ~ baseline_targets + 
            I(baseline_targets^2) +  # Non-linear relationship
            catch_rate_l10 +          # High catch rate = more targets
            yards_l10,                # Productive players get more looks
  data = target_model_data,
  family = poisson(link = "log")
)

cat("✅ Target model fitted\n")
cat(glue("   Formula: Targets ~ baseline_targets + baseline_targets² + catch_rate + yards\n"))
cat(glue("   AIC: {round(AIC(target_model), 1)}\n"))
cat(glue("   Dispersion: {round(summary(target_model)$deviance / summary(target_model)$df.residual, 3)}\n\n"))

# Check if overdispersed (dispersion > 2 → use negative binomial)
target_dispersion <- summary(target_model)$deviance / summary(target_model)$df.residual
if (target_dispersion > 2) {
  cat("⚠️  Overdispersion detected, fitting negative binomial model...\n")
  target_model_nb <- glm.nb(
    targets ~ baseline_targets + 
              I(baseline_targets^2) +
              catch_rate_l10 +
              yards_l10,
    data = target_model_data
  )
  cat(glue("   AIC (NB): {round(AIC(target_model_nb), 1)} (better!)\n\n"))
  target_model <- target_model_nb  # Use NB model
}

# ============================================================================
# MODEL 2: CATCH RATE (Binomial/Logistic)
# ============================================================================

cat("📊 MODEL 2: Catch Rate\n")
cat(strrep("-", 50) , "\n")

# Prepare play-level data for catch rate modeling
catch_rate_model_data <- pbp_data %>%
  mutate(
    # Target depth categories
    target_depth = case_when(
      air_yards <= 0 ~ "behind_los",
      air_yards <= 5 ~ "short",
      air_yards <= 15 ~ "intermediate",
      air_yards <= 25 ~ "deep",
      TRUE ~ "bomb"
    ),
    
    # Pressure indicators
    under_pressure = qb_hit | qb_scramble,
    
    # Field position
    in_red_zone = yardline_100 <= 20
  ) %>%
  filter(!is.na(complete_pass), !is.na(air_yards))

# Fit logistic regression for completion probability
catch_rate_model <- glm(
  complete_pass ~ air_yards + 
                  I(air_yards^2) +          # Quadratic (harder at extremes)
                  under_pressure +          # Pressure lowers completion %
                  in_red_zone +             # Red zone different dynamics
                  score_differential,       # Game script effect
  data = catch_rate_model_data,
  family = binomial(link = "logit")
)

cat("✅ Catch rate model fitted\n")
cat(glue("   Formula: P(Catch) ~ air_yards + air_yards² + pressure + red_zone + game_script\n"))
cat(glue("   AIC: {round(AIC(catch_rate_model), 1)}\n\n"))

# ============================================================================
# MODEL 3: YARDS PER RECEPTION (Gamma)
# ============================================================================

cat("📊 MODEL 3: Yards Per Reception\n")
cat(strrep("-", 50) , "\n")

# Prepare completed pass data for yards modeling
yards_model_data <- pbp_data %>%
  filter(
    complete_pass == 1,
    yards_gained >= 0,    # Remove negative (sacks on screen passes)
    !is.na(air_yards),
    !is.na(yards_after_catch)
  ) %>%
  mutate(
    # YAC opportunity
    yac_opportunity = air_yards <= 5,
    
    # Field position
    distance_to_endzone = yardline_100
  )

# Fit Gamma GLM for yards (conditional on catch)
yards_model <- glm(
  yards_gained ~ air_yards +                 # Air yards = biggest predictor
                 I(air_yards^2) +            # Diminishing returns
                 yards_after_catch +         # YAC ability
                 yac_opportunity +           # Short passes = more YAC
                 distance_to_endzone,        # Less room near endzone
  data = yards_model_data,
  family = Gamma(link = "log")
)

cat("✅ Yards model fitted\n")
cat(glue("   Formula: Yards ~ air_yards + air_yards² + YAC + YAC_opp + field_position\n"))
cat(glue("   AIC: {round(AIC(yards_model), 1)}\n\n"))

# ============================================================================
# SAVE MODELS
# ============================================================================

cat("💾 Saving models...\n")

models <- list(
  target_model = target_model,
  catch_rate_model = catch_rate_model,
  yards_model = yards_model,
  
  # Save metadata
  metadata = list(
    created_at = Sys.time(),
    target_dispersion = target_dispersion,
    target_aic = AIC(target_model),
    catch_rate_aic = AIC(catch_rate_model),
    yards_aic = AIC(yards_model),
    training_samples = list(
      targets = nrow(target_model_data),
      catch_rate = nrow(catch_rate_model_data),
      yards = nrow(yards_model_data)
    )
  )
)

saveRDS(models, file.path(DATA_DIR, "prediction_models.rds"))

cat(glue("  ✅ Saved to {DATA_DIR}/prediction_models.rds\n\n"))

# ============================================================================
# MODEL DIAGNOSTICS
# ============================================================================

cat("📈 Model Diagnostics\n")
cat(strrep("=", 50) , "\n\n")

# Target Model
cat("TARGET MODEL:\n")
cat(glue("  Deviance: {round(summary(target_model)$deviance, 1)}\n"))
cat(glue("  Null Deviance: {round(summary(target_model)$null.deviance, 1)}\n"))
cat(glue("  Pseudo R²: {round(1 - summary(target_model)$deviance / summary(target_model)$null.deviance, 3)}\n\n"))

# Catch Rate Model
cat("CATCH RATE MODEL:\n")
cat(glue("  Deviance: {round(summary(catch_rate_model)$deviance, 1)}\n"))
cat(glue("  Null Deviance: {round(summary(catch_rate_model)$null.deviance, 1)}\n"))
cat(glue("  Pseudo R²: {round(1 - summary(catch_rate_model)$deviance / summary(catch_rate_model)$null.deviance, 3)}\n\n"))

# Yards Model
cat("YARDS MODEL:\n")
cat(glue("  Deviance: {round(summary(yards_model)$deviance, 1)}\n"))
cat(glue("  Null Deviance: {round(summary(yards_model)$null.deviance, 1)}\n"))
cat(glue("  Pseudo R²: {round(1 - summary(yards_model)$deviance / summary(yards_model)$null.deviance, 3)}\n\n"))

cat("✅ MODELS BUILT SUCCESSFULLY\n")
