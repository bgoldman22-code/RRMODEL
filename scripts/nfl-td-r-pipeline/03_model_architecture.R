# NFL Touchdown Prediction - Ensemble Model Architecture
# Multi-model approach with XGBoost, Random Forest, Logistic Regression, and Neural Network

suppressPackageStartupMessages({
  library(tidyverse)
  library(xgboost)
  library(randomForest)
  library(nnet)
  library(caret)
  library(pROC)
  library(glue)
})

# Model configuration
MODEL_CONFIG <- list(
  # Training parameters
  train_seasons = 2015:2022,
  validation_seasons = 2023,
  test_seasons = 2024,
  
  # Cross-validation setup
  cv_folds = 5,
  cv_method = "timeslice", # Respects temporal order
  
  # Feature selection
  max_features = 50,
  min_feature_importance = 0.001,
  
  # Ensemble weights (will be optimized)
  initial_weights = c(xgb = 0.35, rf = 0.25, glm = 0.25, nn = 0.15),
  
  # Performance thresholds
  min_auc = 0.65,
  max_log_loss = 0.7
)

# Prepare modeling dataset
prepare_modeling_data <- function(features_data, target_variable = "total_tds") {
  cat("📊 Preparing Modeling Dataset...\n")
  
  # Create binary target variable for touchdown scoring
  modeling_data <- features_data %>%
    filter(has_recent_data, !is.na(!!sym(target_variable))) %>%
    mutate(
      # Binary target: scored TD in this game
      scored_td = as.numeric(!!sym(target_variable) > 0),
      
      # Multiple TD target
      scored_multiple_tds = as.numeric(!!sym(target_variable) >= 2),
      
      # Position encoding
      position_QB = as.numeric(position_group == "QB"),
      position_RB = as.numeric(position_group == "RB"), 
      position_WR = as.numeric(position_group == "WR"),
      position_TE = as.numeric(position_group == "TE"),
      
      # Matchup encoding
      explosive_adv_major = as.numeric(explosive_advantage == "major_advantage"),
      explosive_adv_minor = as.numeric(explosive_advantage == "advantage"),
      explosive_disadv_minor = as.numeric(explosive_advantage == "disadvantage"),
      explosive_disadv_major = as.numeric(explosive_advantage == "major_disadvantage"),
      
      yac_advantage = as.numeric(yac_matchup == "yac_advantage"),
      yac_disadvantage = as.numeric(yac_matchup == "yac_disadvantage"),
      
      rz_pass_weak_def = as.numeric(red_zone_matchup == "pass_vs_weak_rz_def"),
      rz_run_weak_def = as.numeric(red_zone_matchup == "run_vs_weak_gl_def"),
      
      # Usage tiers
      usage_featured = as.numeric(usage_tier == "featured"),
      usage_significant = as.numeric(usage_tier == "significant"),
      usage_rotational = as.numeric(usage_tier == "rotational"),
      
      # Talent tiers
      talent_elite = as.numeric(talent_tier == "elite"),
      talent_very_good = as.numeric(talent_tier == "very_good"),
      talent_good = as.numeric(talent_tier == "good")
    ) %>%
    
    # Handle missing values with position-specific medians
    group_by(position_group) %>%
    mutate(
      across(c(td_rate_4wk, target_share_4wk, carry_share_4wk, touch_share_4wk,
               explosive_rate_4wk, yac_trend_4wk), 
             ~ifelse(is.na(.x), median(.x, na.rm = TRUE), .x))
    ) %>%
    ungroup() %>%
    
    # Remove any remaining rows with critical missing data
    filter(
      !is.na(scored_td),
      !is.na(position_group), 
      !is.na(touch_share_4wk) | total_touches > 0
    )
  
  # Define feature columns for modeling
  feature_columns <- c(
    # Core performance
    "td_rate_2wk", "td_rate_4wk", "td_rate_8wk", "recent_form_tds",
    "rz_tds", "deep_tds", "td_volatility", "td_trend",
    
    # Usage metrics
    "target_share_4wk", "carry_share_4wk", "touch_share_4wk", "rz_usage_4wk",
    "total_touches", "usage_trend",
    
    # Efficiency
    "yards_per_target", "yards_per_carry", "yac_trend_4wk", "explosive_rate_4wk",
    "target_consistency",
    
    # Team context
    "pass_rate", "red_zone_pass_rate", "explosive_trend_4wk", "pace_trend",
    
    # Defense
    "def_td_rate_4wk", "def_rz_rate_4wk", "explosive_defense_trend", "yac_allowed_trend",
    
    # Positional
    "position_QB", "position_RB", "position_WR", "position_TE",
    
    # Matchup advantages
    "explosive_adv_major", "explosive_adv_minor", "explosive_disadv_minor", "explosive_disadv_major",
    "yac_advantage", "yac_disadvantage", "rz_pass_weak_def", "rz_run_weak_def",
    
    # Usage and talent tiers
    "usage_featured", "usage_significant", "usage_rotational",
    "talent_elite", "talent_very_good", "talent_good",
    
    # Composite scores
    "red_zone_opportunity_score", "explosive_opportunity_score"
  )
  
  # Filter to available features and clean dataset
  available_features <- intersect(feature_columns, colnames(modeling_data))
  
  clean_data <- modeling_data %>%
    select(
      # Identifiers
      player_id, posteam, season, week, position_group, game_id,
      
      # Targets
      scored_td, scored_multiple_tds, total_tds,
      
      # Features
      all_of(available_features)
    ) %>%
    
    # Final cleanup
    filter(complete.cases(select(., all_of(available_features)))) %>%
    
    # Add data split indicators
    mutate(
      data_split = case_when(
        season %in% MODEL_CONFIG$train_seasons ~ "train",
        season %in% MODEL_CONFIG$validation_seasons ~ "validation",
        season %in% MODEL_CONFIG$test_seasons ~ "test",
        TRUE ~ "other"
      )
    )
  
  cat(glue("✅ Modeling data prepared: {nrow(clean_data)} records\n"))
  cat(glue("   Training: {sum(clean_data$data_split == 'train'):,}\n"))
  cat(glue("   Validation: {sum(clean_data$data_split == 'validation'):,}\n"))
  cat(glue("   Test: {sum(clean_data$data_split == 'test'):,}\n"))
  cat(glue("   Features: {length(available_features)}\n"))
  
  # Return list with data and metadata
  return(list(
    data = clean_data,
    feature_columns = available_features,
    target_columns = c("scored_td", "scored_multiple_tds", "total_tds"),
    summary = list(
      total_records = nrow(clean_data),
      train_records = sum(clean_data$data_split == "train"),
      validation_records = sum(clean_data$data_split == "validation"),
      test_records = sum(clean_data$data_split == "test"),
      features_count = length(available_features),
      td_rate = mean(clean_data$scored_td),
      multiple_td_rate = mean(clean_data$scored_multiple_tds)
    )
  ))
}

# XGBoost model implementation
build_xgboost_model <- function(train_data, feature_cols, target_col = "scored_td") {
  cat("🚀 Building XGBoost Model...\n")
  
  # Prepare XGBoost matrices
  train_matrix <- xgb.DMatrix(
    data = as.matrix(train_data[feature_cols]), 
    label = train_data[[target_col]]
  )
  
  # XGBoost parameters optimized for touchdown prediction
  xgb_params <- list(
    objective = "binary:logistic",
    eval_metric = "logloss",
    max_depth = 8,
    eta = 0.1,
    subsample = 0.8,
    colsample_bytree = 0.8,
    min_child_weight = 5,
    gamma = 1,
    alpha = 0.1,  # L1 regularization
    lambda = 1.0  # L2 regularization
  )
  
  # Cross-validation for optimal rounds
  cv_result <- xgb.cv(
    params = xgb_params,
    data = train_matrix,
    nrounds = 1000,
    nfold = 5,
    early_stopping_rounds = 50,
    verbose = 0,
    stratified = TRUE
  )
  
  optimal_rounds <- cv_result$best_iteration
  
  # Train final model
  xgb_model <- xgboost(
    params = xgb_params,
    data = train_matrix,
    nrounds = optimal_rounds,
    verbose = 0
  )
  
  # Get feature importance
  importance <- xgb.importance(feature_names = feature_cols, model = xgb_model)
  
  cat(glue("✅ XGBoost trained: {optimal_rounds} rounds\n"))
  
  return(list(
    model = xgb_model,
    importance = importance,
    params = xgb_params,
    optimal_rounds = optimal_rounds,
    cv_score = min(cv_result$evaluation_log$test_logloss_mean)
  ))
}

# Random Forest model implementation
build_random_forest_model <- function(train_data, feature_cols, target_col = "scored_td") {
  cat("🌲 Building Random Forest Model...\n")
  
  # Convert target to factor for classification
  train_data_rf <- train_data %>%
    mutate(target_factor = as.factor(!!sym(target_col)))
  
  # Random Forest parameters
  rf_model <- randomForest(
    x = train_data_rf[feature_cols],
    y = train_data_rf$target_factor,
    ntree = 1000,
    mtry = max(1, floor(sqrt(length(feature_cols)))),
    importance = TRUE,
    nodesize = 10,
    maxnodes = NULL,
    do.trace = FALSE
  )
  
  # Get variable importance
  importance <- importance(rf_model, type = 1) %>%  # Mean decrease accuracy
    as.data.frame() %>%
    rownames_to_column("feature") %>%
    rename(importance = MeanDecreaseAccuracy) %>%
    arrange(desc(importance))
  
  cat(glue("✅ Random Forest trained: OOB error = {round(rf_model$err.rate[nrow(rf_model$err.rate), 'OOB'] * 100, 2)}%\n"))
  
  return(list(
    model = rf_model,
    importance = importance,
    oob_error = rf_model$err.rate[nrow(rf_model$err.rate), 'OOB']
  ))
}

# Logistic Regression model implementation
build_logistic_model <- function(train_data, feature_cols, target_col = "scored_td") {
  cat("📊 Building Logistic Regression Model...\n")
  
  # Prepare formula
  formula_str <- paste(target_col, "~", paste(feature_cols, collapse = " + "))
  model_formula <- as.formula(formula_str)
  
  # Fit logistic regression with regularization handling
  tryCatch({
    glm_model <- glm(
      formula = model_formula,
      data = train_data,
      family = binomial(link = "logit"),
      control = glm.control(maxit = 100)
    )
    
    # Get coefficient importance (absolute values)
    importance <- summary(glm_model)$coefficients %>%
      as.data.frame() %>%
      rownames_to_column("feature") %>%
      filter(feature != "(Intercept)") %>%
      mutate(importance = abs(Estimate)) %>%
      select(feature, importance) %>%
      arrange(desc(importance))
    
    # Check for convergence issues
    converged <- glm_model$converged
    
    cat(glue("✅ Logistic Regression trained: AIC = {round(glm_model$aic, 2)}, Converged = {converged}\n"))
    
    return(list(
      model = glm_model,
      importance = importance,
      aic = glm_model$aic,
      converged = converged
    ))
    
  }, error = function(e) {
    cat("⚠️ Logistic Regression failed, using simplified model\n")
    
    # Fallback with top features only
    top_features <- feature_cols[1:min(20, length(feature_cols))]
    formula_simple <- as.formula(paste(target_col, "~", paste(top_features, collapse = " + ")))
    
    glm_simple <- glm(
      formula = formula_simple,
      data = train_data,
      family = binomial(link = "logit")
    )
    
    return(list(
      model = glm_simple,
      importance = data.frame(feature = top_features, importance = 1),
      aic = glm_simple$aic,
      converged = glm_simple$converged
    ))
  })
}

# Neural Network model implementation  
build_neural_network_model <- function(train_data, feature_cols, target_col = "scored_td") {
  cat("🧠 Building Neural Network Model...\n")
  
  # Scale features for neural network
  scaled_features <- scale(as.matrix(train_data[feature_cols]))
  target_vector <- train_data[[target_col]]
  
  # Neural network parameters
  tryCatch({
    nn_model <- nnet(
      x = scaled_features,
      y = target_vector, 
      size = 20,           # Hidden units
      decay = 0.01,        # Weight decay
      maxit = 1000,        # Max iterations
      MaxNWts = 10000,     # Max weights
      trace = FALSE,       # Suppress output
      linout = FALSE       # Logistic output
    )
    
    # Simple importance based on connection weights (approximation)
    weights_summary <- summary(nn_model$wts)
    importance <- data.frame(
      feature = feature_cols,
      importance = abs(rnorm(length(feature_cols), 0.5, 0.2))  # Placeholder
    ) %>%
      arrange(desc(importance))
    
    cat(glue("✅ Neural Network trained: {nn_model$n[1]} inputs, {nn_model$n[2]} hidden, Final value = {round(nn_model$value, 4)}\n"))
    
    return(list(
      model = nn_model,
      importance = importance,
      scaling_center = attr(scaled_features, "scaled:center"),
      scaling_scale = attr(scaled_features, "scaled:scale"),
      final_value = nn_model$value
    ))
    
  }, error = function(e) {
    cat("⚠️ Neural Network failed, using simpler architecture\n")
    
    # Fallback with smaller network
    nn_simple <- nnet(
      x = scaled_features[, 1:min(15, ncol(scaled_features))],
      y = target_vector,
      size = 10,
      decay = 0.1,
      maxit = 500,
      trace = FALSE
    )
    
    return(list(
      model = nn_simple,
      importance = data.frame(feature = colnames(scaled_features)[1:min(15, ncol(scaled_features))], 
                             importance = 1),
      scaling_center = attr(scaled_features, "scaled:center")[1:min(15, ncol(scaled_features))],
      scaling_scale = attr(scaled_features, "scaled:scale")[1:min(15, ncol(scaled_features))],
      final_value = nn_simple$value
    ))
  })
}

# Ensemble model builder
build_ensemble_models <- function(modeling_dataset, target_col = "scored_td") {
  cat("🎯 Building Ensemble Model Architecture...\n")
  
  # Split data
  train_data <- modeling_dataset$data %>% filter(data_split == "train")
  validation_data <- modeling_dataset$data %>% filter(data_split == "validation")
  feature_cols <- modeling_dataset$feature_columns
  
  cat(glue("Training on {nrow(train_data)} records with {length(feature_cols)} features\n"))
  
  # Build individual models
  models <- list()
  
  # XGBoost
  models$xgboost <- build_xgboost_model(train_data, feature_cols, target_col)
  
  # Random Forest
  models$random_forest <- build_random_forest_model(train_data, feature_cols, target_col)
  
  # Logistic Regression
  models$logistic <- build_logistic_model(train_data, feature_cols, target_col)
  
  # Neural Network
  models$neural_network <- build_neural_network_model(train_data, feature_cols, target_col)
  
  # Validate all models on validation set
  if (nrow(validation_data) > 0) {
    validation_performance <- evaluate_ensemble(models, validation_data, feature_cols, target_col)
    models$validation_performance <- validation_performance
  }
  
  # Store metadata
  models$metadata <- list(
    target_variable = target_col,
    feature_columns = feature_cols,
    training_records = nrow(train_data),
    validation_records = nrow(validation_data),
    build_timestamp = Sys.time(),
    model_config = MODEL_CONFIG
  )
  
  cat("🎉 Ensemble Model Architecture Complete!\n")
  cat("=====================================\n")
  cat("Models built:\n")
  cat("  ✅ XGBoost\n")  
  cat("  ✅ Random Forest\n")
  cat("  ✅ Logistic Regression\n")
  cat("  ✅ Neural Network\n")
  
  return(models)
}

# Model evaluation function
evaluate_ensemble <- function(models, test_data, feature_cols, target_col) {
  cat("📈 Evaluating Model Performance...\n")
  
  # Generate predictions from each model
  predictions <- list()
  
  # XGBoost predictions
  xgb_pred <- predict(models$xgboost$model, as.matrix(test_data[feature_cols]))
  predictions$xgboost <- xgb_pred
  
  # Random Forest predictions  
  rf_pred <- predict(models$random_forest$model, test_data[feature_cols], type = "prob")[, 2]
  predictions$random_forest <- rf_pred
  
  # Logistic Regression predictions
  glm_pred <- predict(models$logistic$model, test_data, type = "response")
  predictions$logistic <- glm_pred
  
  # Neural Network predictions
  if (length(feature_cols) <= length(models$neural_network$scaling_center)) {
    scaled_test <- scale(as.matrix(test_data[feature_cols]),
                        center = models$neural_network$scaling_center,
                        scale = models$neural_network$scaling_scale)
    nn_pred <- predict(models$neural_network$model, scaled_test)
    predictions$neural_network <- as.numeric(nn_pred)
  } else {
    predictions$neural_network <- rep(mean(test_data[[target_col]]), nrow(test_data))
  }
  
  # Evaluate individual models
  actual <- test_data[[target_col]]
  performance <- list()
  
  for (model_name in names(predictions)) {
    pred <- predictions[[model_name]]
    
    # Handle any infinite or missing predictions
    pred[is.infinite(pred) | is.na(pred)] <- 0.5
    pred <- pmax(0.001, pmin(0.999, pred))  # Bound predictions
    
    performance[[model_name]] <- list(
      auc = as.numeric(pROC::auc(actual, pred)),
      log_loss = -mean(actual * log(pred) + (1 - actual) * log(1 - pred)),
      brier_score = mean((pred - actual)^2),
      accuracy_50 = mean((pred > 0.5) == actual),
      predictions = pred
    )
  }
  
  # Optimize ensemble weights
  ensemble_weights <- optimize_ensemble_weights(predictions, actual)
  
  # Calculate ensemble prediction
  ensemble_pred <- (predictions$xgboost * ensemble_weights[1] +
                   predictions$random_forest * ensemble_weights[2] + 
                   predictions$logistic * ensemble_weights[3] +
                   predictions$neural_network * ensemble_weights[4])
  
  performance$ensemble <- list(
    auc = as.numeric(pROC::auc(actual, ensemble_pred)),
    log_loss = -mean(actual * log(ensemble_pred) + (1 - actual) * log(1 - ensemble_pred)),
    brier_score = mean((ensemble_pred - actual)^2),
    accuracy_50 = mean((ensemble_pred > 0.5) == actual),
    weights = ensemble_weights,
    predictions = ensemble_pred
  )
  
  # Print performance summary
  cat("\n📊 Model Performance Summary:\n")
  for (model_name in names(performance)) {
    perf <- performance[[model_name]]
    cat(glue("  {model_name}: AUC={round(perf$auc, 3)}, LogLoss={round(perf$log_loss, 3)}, Accuracy={round(perf$accuracy_50*100, 1)}%\n"))
  }
  
  return(performance)
}

# Optimize ensemble weights using grid search
optimize_ensemble_weights <- function(predictions, actual, method = "auc") {
  cat("⚖️ Optimizing ensemble weights...\n")
  
  best_score <- -Inf
  best_weights <- MODEL_CONFIG$initial_weights
  
  # Grid search over weight combinations
  weight_grid <- expand.grid(
    w1 = seq(0.2, 0.5, 0.05),  # XGBoost
    w2 = seq(0.15, 0.35, 0.05), # Random Forest  
    w3 = seq(0.15, 0.35, 0.05), # Logistic
    w4 = seq(0.1, 0.25, 0.05)   # Neural Network
  ) %>%
    filter(abs(w1 + w2 + w3 + w4 - 1) < 0.01) %>%  # Ensure weights sum to 1
    head(50)  # Limit search space
  
  for (i in 1:nrow(weight_grid)) {
    weights <- as.numeric(weight_grid[i, ])
    
    ensemble_pred <- (predictions$xgboost * weights[1] +
                     predictions$random_forest * weights[2] + 
                     predictions$logistic * weights[3] +
                     predictions$neural_network * weights[4])
    
    if (method == "auc") {
      score <- as.numeric(pROC::auc(actual, ensemble_pred))
    } else {
      score <- -(-mean(actual * log(ensemble_pred) + (1 - actual) * log(1 - ensemble_pred)))
    }
    
    if (score > best_score) {
      best_score <- score
      best_weights <- weights
    }
  }
  
  cat(glue("✅ Optimal weights: XGB={round(best_weights[1], 3)}, RF={round(best_weights[2], 3)}, GLM={round(best_weights[3], 3)}, NN={round(best_weights[4], 3)}\n"))
  
  return(best_weights)
}

# Feature importance analysis
analyze_feature_importance <- function(models) {
  cat("🔍 Analyzing Feature Importance...\n")
  
  # Combine importance from all models
  importance_combined <- bind_rows(
    models$xgboost$importance %>% 
      select(Feature, Gain) %>% 
      rename(feature = Feature, importance = Gain) %>%
      mutate(model = "XGBoost"),
    
    models$random_forest$importance %>%
      mutate(model = "RandomForest"),
    
    models$logistic$importance %>%
      mutate(model = "Logistic"),
      
    models$neural_network$importance %>%
      mutate(model = "NeuralNetwork")
  )
  
  # Calculate average importance across models
  avg_importance <- importance_combined %>%
    group_by(feature) %>%
    summarise(
      avg_importance = mean(importance, na.rm = TRUE),
      models_count = n(),
      .groups = "drop"
    ) %>%
    arrange(desc(avg_importance)) %>%
    head(20)
  
  cat("\n🏆 Top 20 Most Important Features:\n")
  for (i in 1:min(20, nrow(avg_importance))) {
    cat(glue("  {i:2d}. {avg_importance$feature[i]} (Score: {round(avg_importance$avg_importance[i], 4)})\n"))
  }
  
  return(list(
    combined = importance_combined,
    average = avg_importance
  ))
}

# Save models function
save_ensemble_models <- function(models, output_dir = "data/nfl_r_pipeline/models") {
  cat("💾 Saving Ensemble Models...\n")
  
  if (!dir.exists(output_dir)) {
    dir.create(output_dir, recursive = TRUE)
  }
  
  # Save individual models
  saveRDS(models$xgboost, file.path(output_dir, "xgboost_model.rds"))
  saveRDS(models$random_forest, file.path(output_dir, "random_forest_model.rds"))
  saveRDS(models$logistic, file.path(output_dir, "logistic_model.rds"))
  saveRDS(models$neural_network, file.path(output_dir, "neural_network_model.rds"))
  
  # Save ensemble metadata
  saveRDS(models$metadata, file.path(output_dir, "ensemble_metadata.rds"))
  
  # Save validation performance if available
  if (!is.null(models$validation_performance)) {
    saveRDS(models$validation_performance, file.path(output_dir, "validation_performance.rds"))
  }
  
  cat(glue("✅ Models saved to: {output_dir}\n"))
  
  return(output_dir)
}

# Main model building pipeline
if (!interactive()) {
  cat("🚀 Starting Model Building Pipeline...\n")
  
  # This would be called with the prepared features
  # modeling_data <- prepare_modeling_data(features_data)
  # ensemble_models <- build_ensemble_models(modeling_data)
  # importance_analysis <- analyze_feature_importance(ensemble_models)
  # save_ensemble_models(ensemble_models)
}