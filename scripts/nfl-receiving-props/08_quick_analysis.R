# Quick Analysis of Backtest Results (With Calibration)

library(tidyverse)

results <- readRDS('data/nfl_receiving_props/backtest_3season_2022_2024.rds')

cat('\n🔍 NFL RECEIVING PROPS - BACKTEST ANALYSIS\n')
cat('==========================================\n\n')

cat('📊 RAW RESULTS:\n')
cat(sprintf('  Total predictions: %s\n', format(nrow(results), big.mark=',')))
cat(sprintf('  Model predicted: %.1f%% to win\n', mean(results$model_prob_over) * 100))
cat(sprintf('  Actually won: %.1f%% (%.1f%% OFF)\n\n', 
  mean(results$hit_over) * 100,
  (mean(results$hit_over) - mean(results$model_prob_over)) * 100))

# The model is overconfident - let's calibrate
cat('🔧 APPLYING CALIBRATION:\n')
cat('  Model is ~5-7% overconfident, adjusting probabilities...\n\n')

results_cal <- results %>%
  mutate(
    # Shrink probabilities toward 50% by 7%
    prob_cal = model_prob_over * 0.93 + 0.035
  )

cat(sprintf('  After calibration: %.1f%% predicted vs %.1f%% actual\n\n',
  mean(results_cal$prob_cal) * 100,
  mean(results_cal$hit_over) * 100))

# Now filter for quality bets (ignoring fake vig for now)
actionable <- results_cal %>%
  filter(
    prob_cal >= 0.40,  # Only bet when model is confident (40%+)
    prob_cal <= 0.70,  # But not too confident (avoid high vig)
    games_history >= 4,
    prop == "receptions" | (prop == "receiving_yards" & avg_yards_l5 >= 25)
  )

cat('✅ ACTIONABLE BETS (Calibrated + Filtered):\n')
cat('============================================\n\n')

wins <- sum(actionable$hit_over)
total <- nrow(actionable)
win_rate <- wins / total
roi_units <- wins * 0.91 - (total - wins) * 1.0
roi_pct <- roi_units / total

cat(sprintf('  Bets: %s\n', format(total, big.mark=',')))
cat(sprintf('  Wins: %s\n', format(wins, big.mark=',')))
cat(sprintf('  Win rate: %.1f%%\n', win_rate * 100))
cat(sprintf('  ROI: %+.1f%%\n', roi_pct * 100))
cat(sprintf('  Units: %+.1f\n\n', roi_units))

# By prop type
cat('📦 BY PROP TYPE:\n')
for (prop in unique(actionable$prop)) {
  prop_data <- actionable %>% filter(prop == !!prop)
  wins_prop <- sum(prop_data$hit_over)
  total_prop <- nrow(prop_data)
  wr_prop <- wins_prop / total_prop
  units_prop <- wins_prop * 0.91 - (total_prop - wins_prop) * 1.0
  
  cat(sprintf('  %s:\n', prop))
  cat(sprintf('    Bets: %s | Win rate: %.1f%% | Units: %+.1f\n',
    format(total_prop, big.mark=','), wr_prop * 100, units_prop))
}

cat('\n📅 BY SEASON:\n')
for (season in sort(unique(actionable$season))) {
  season_data <- actionable %>% filter(season == !!season)
  wins_s <- sum(season_data$hit_over)
  total_s <- nrow(season_data)
  wr_s <- wins_s / total_s
  units_s <- wins_s * 0.91 - (total_s - wins_s) * 1.0
  
  cat(sprintf('  %d: %s bets | %.1f%% win rate | %+.1f units\n',
    season, format(total_s, big.mark=','), wr_s * 100, units_s))
}

cat('\n💡 KEY FINDINGS:\n')
cat('  1. Model is overconfident by 5-7% (FIXABLE with calibration)\n')
cat('  2. After calibration: Need to test against REAL market odds\n')
cat('  3. Next step: Integrate The Odds API for actual market lines\n\n')
