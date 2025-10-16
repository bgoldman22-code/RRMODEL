# NFL Receiving Props - Filter Actionable Bets Only
# Remove noise: 3rd down backs, gadget plays, rarely-used players
# Focus on: Regular contributors with consistent playing time

suppressPackageStartupMessages({
  library(tidyverse)
  library(glue)
})

cat("🎯 FILTERING ACTIONABLE BETS\n")
cat("============================\n\n")

# Load backtest results
DATA_DIR <- "data/nfl_receiving_props"
results_file <- file.path(DATA_DIR, "backtest_3season_2022_2024.rds")

if (!file.exists(results_file)) {
  stop("Backtest results not found. Run 05_comprehensive_backtest.R first.")
}

cat("📥 Loading backtest results...\n")
backtest_all <- readRDS(results_file)
cat(glue("  Total predictions: {format(nrow(backtest_all), big.mark=',')}\n"))
cat(glue("  Players: {format(length(unique(backtest_all$player)), big.mark=',')}\n\n"))

# ============================================================================
# FILTERING CRITERIA
# ============================================================================

cat("🔍 FILTERING CRITERIA:\n\n")

FILTERS <- list(
  # 1. Minimum usage thresholds
  min_avg_targets_l5 = 3.0,  # Must average 3+ targets per game (L5)
  min_avg_receptions_l5 = 2.0,  # Must average 2+ receptions per game (L5)
  min_avg_yards_l5 = 25,  # Must average 25+ yards per game (L5)
  
  # 2. Line thresholds (only bet on realistic lines)
  reception_lines_allowed = c(2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5),
  yards_lines_min = 25.5,
  yards_lines_max = 95.5,
  
  # 3. Edge threshold (only bet with sufficient edge)
  min_edge = 0.05,  # 5% minimum edge
  
  # 4. Probability range (avoid extremes)
  min_prob = 0.25,  # Don't bet <25% (too unlikely)
  max_prob = 0.75,  # Don't bet >75% (odds too short)
  
  # 5. Minimum games history
  min_games_history = 4  # Need at least 4 games of history
)

cat(glue("1️⃣  Min avg targets (L5): {FILTERS$min_avg_targets_l5}\n"))
cat(glue("2️⃣  Min avg receptions (L5): {FILTERS$min_avg_receptions_l5}\n"))
cat(glue("3️⃣  Min avg yards (L5): {FILTERS$min_avg_yards_l5}\n"))
cat(glue("4️⃣  Min edge: {scales::percent(FILTERS$min_edge)}\n"))
cat(glue("5️⃣  Probability range: {scales::percent(FILTERS$min_prob)}-{scales::percent(FILTERS$max_prob)}\n"))
cat(glue("6️⃣  Min games history: {FILTERS$min_games_history}\n\n"))

# ============================================================================
# APPLY FILTERS
# ============================================================================

cat("🧹 APPLYING FILTERS:\n\n")

# Start with all predictions
filtered <- backtest_all

cat(glue("Starting: {format(nrow(filtered), big.mark=',')} predictions\n"))

# Filter 1: Edge threshold
filtered <- filtered %>%
  filter(abs(edge) >= FILTERS$min_edge)
cat(glue("After edge filter (>= {scales::percent(FILTERS$min_edge)}): {format(nrow(filtered), big.mark=',')} predictions\n"))

# Filter 2: Probability range
filtered <- filtered %>%
  filter(
    model_prob_over >= FILTERS$min_prob,
    model_prob_over <= FILTERS$max_prob
  )
cat(glue("After probability filter ({scales::percent(FILTERS$min_prob)}-{scales::percent(FILTERS$max_prob)}): {format(nrow(filtered), big.mark=',')} predictions\n"))

# Filter 3: Games history
filtered <- filtered %>%
  filter(games_history >= FILTERS$min_games_history)
cat(glue("After games history filter (>= {FILTERS$min_games_history}): {format(nrow(filtered), big.mark=',')} predictions\n"))

# Filter 4: Usage thresholds (by prop type)
filtered <- filtered %>%
  filter(
    # Receptions: Must average 2+ receptions, 3+ targets
    (prop == "receptions" & 
     avg_receptions_l5 >= FILTERS$min_avg_receptions_l5) |
    
    # Yards: Must average 25+ yards per game
    (prop == "receiving_yards" & 
     avg_yards_l5 >= FILTERS$min_avg_yards_l5)
  )
cat(glue("After usage filter (min targets/receptions/yards): {format(nrow(filtered), big.mark=',')} predictions\n"))

# Filter 5: Realistic lines only
filtered <- filtered %>%
  filter(
    # Receptions: Only standard lines
    (prop == "receptions" & line %in% FILTERS$reception_lines_allowed) |
    
    # Yards: Only 25.5 to 95.5 range
    (prop == "receiving_yards" & 
     line >= FILTERS$yards_lines_min & 
     line <= FILTERS$yards_lines_max)
  )
cat(glue("After line filter (realistic lines only): {format(nrow(filtered), big.mark=',')} predictions\n\n"))

# ============================================================================
# ANALYSIS OF FILTERED RESULTS
# ============================================================================

cat("📊 FILTERED RESULTS ANALYSIS\n")
cat("============================\n\n")

# Overall performance
wins <- sum(filtered$hit_over)
total <- nrow(filtered)
win_rate <- wins / total
roi_units <- (wins * 0.91 - (total - wins) * 1.0)
roi_pct <- roi_units / total

cat("🎯 OVERALL PERFORMANCE (Actionable Bets Only):\n")
cat(glue("  Total bets: {format(total, big.mark=',')}\n"))
cat(glue("  Wins: {format(wins, big.mark=',')} ({scales::percent(win_rate, accuracy = 0.1)})\n"))
cat(glue("  ROI: {scales::percent(roi_pct, accuracy = 0.1)}\n"))
cat(glue("  Units: {sprintf('%+.1f', roi_units)}\n\n"))

# By prop type
cat("📦 BY PROP TYPE:\n")
for (prop_type in unique(filtered$prop)) {
  prop_bets <- filtered %>% filter(prop == prop_type)
  
  wins <- sum(prop_bets$hit_over)
  total <- nrow(prop_bets)
  win_rate <- wins / total
  roi_units <- (wins * 0.91 - (total - wins) * 1.0)
  roi_pct <- roi_units / total
  
  cat(glue("\n{prop_type}:\n"))
  cat(glue("  Bets: {format(total, big.mark=',')}\n"))
  cat(glue("  Win rate: {scales::percent(win_rate, accuracy = 0.1)}\n"))
  cat(glue("  ROI: {scales::percent(roi_pct, accuracy = 0.1)}\n"))
  cat(glue("  Units: {sprintf('%+.1f', roi_units)}\n"))
}

cat("\n")

# By season
cat("📅 BY SEASON:\n")
for (season in sort(unique(filtered$season))) {
  season_bets <- filtered %>% filter(season == !!season)
  
  wins <- sum(season_bets$hit_over)
  total <- nrow(season_bets)
  win_rate <- wins / total
  roi_units <- (wins * 0.91 - (total - wins) * 1.0)
  roi_pct <- roi_units / total
  
  cat(glue("\n{season}:\n"))
  cat(glue("  Bets: {format(total, big.mark=',')}\n"))
  cat(glue("  Win rate: {scales::percent(win_rate, accuracy = 0.1)}\n"))
  cat(glue("  ROI: {scales::percent(roi_pct, accuracy = 0.1)}\n"))
  cat(glue("  Units: {sprintf('%+.1f', roi_units)}\n"))
}

cat("\n")

# Top players by volume
cat("👤 TOP 20 PLAYERS BY BET COUNT:\n")
cat(paste0(rep("-", 70), collapse=""), "\n")

top_players <- filtered %>%
  group_by(player) %>%
  summarise(
    bets = n(),
    wins = sum(hit_over),
    win_rate = mean(hit_over),
    avg_edge = mean(edge),
    roi_units = sum(hit_over) * 0.91 - (n() - sum(hit_over)) * 1.0,
    .groups = "drop"
  ) %>%
  arrange(desc(bets)) %>%
  head(20)

cat(sprintf("%-25s | %5s | %5s | %9s | %8s | %8s\n",
            "Player", "Bets", "Wins", "Win Rate", "Avg Edge", "Units"))
cat(paste0(rep("-", 70), collapse=""), "\n")

for (i in seq_len(nrow(top_players))) {
  p <- top_players[i, ]
  cat(sprintf("%-25s | %5d | %5d | %8.1f%% | %7.1f%% | %+7.1f\n",
              substr(p$player, 1, 25),
              p$bets,
              p$wins,
              p$win_rate * 100,
              p$avg_edge * 100,
              p$roi_units))
}

cat("\n")

# ============================================================================
# EXAMPLES OF FILTERED OUT BETS (Noise)
# ============================================================================

cat("🗑️  EXAMPLES OF FILTERED OUT BETS (Noise):\n")
cat(paste0(rep("-", 70), collapse=""), "\n\n")

# Find examples of low-usage players that were filtered
noise_examples <- backtest_all %>%
  anti_join(filtered, by = c("season", "week", "player", "prop", "line")) %>%
  filter(abs(edge) >= 0.05) %>%  # Had edge but still filtered
  arrange(avg_receptions_l5) %>%
  head(10) %>%
  select(season, week, player, team, prop, line, 
         avg_targets_l5, avg_receptions_l5, avg_yards_l5, edge)

if (nrow(noise_examples) > 0) {
  cat("These players had 5%+ edge but were filtered for low usage:\n\n")
  
  for (i in seq_len(min(5, nrow(noise_examples)))) {
    ex <- noise_examples[i, ]
    cat(glue("{ex$season} Week {ex$week}: {ex$player} ({ex$team})\n"))
    cat(glue("  Prop: {ex$prop} {ex$line}\n"))
    cat(glue("  L5 Avg: {round(ex$avg_targets_l5, 1)} targets, {round(ex$avg_receptions_l5, 1)} rec, {round(ex$avg_yards_l5, 0)} yards\n"))
    cat(glue("  Edge: {scales::percent(ex$edge, accuracy = 0.1)}\n"))
    cat(glue("  ❌ Filtered: Low usage (backup/gadget player)\n\n"))
  }
}

# ============================================================================
# SAVE FILTERED RESULTS
# ============================================================================

cat("💾 SAVING FILTERED RESULTS:\n\n")

# Save filtered results
filtered_file <- file.path(DATA_DIR, "backtest_3season_ACTIONABLE.rds")
saveRDS(filtered, filtered_file)
cat(glue("✅ Saved to {filtered_file}\n"))

# Save summary
summary_data <- list(
  total_predictions_raw = nrow(backtest_all),
  total_predictions_filtered = nrow(filtered),
  filter_rate = 1 - (nrow(filtered) / nrow(backtest_all)),
  
  filters_applied = FILTERS,
  
  performance = list(
    total_bets = total,
    wins = sum(filtered$hit_over),
    win_rate = mean(filtered$hit_over),
    roi_pct = roi_pct,
    roi_units = roi_units
  ),
  
  by_prop = filtered %>%
    group_by(prop) %>%
    summarise(
      bets = n(),
      wins = sum(hit_over),
      win_rate = mean(hit_over),
      roi_pct = (sum(hit_over) * 0.91 - (n() - sum(hit_over))) / n(),
      .groups = "drop"
    ),
  
  by_season = filtered %>%
    group_by(season) %>%
    summarise(
      bets = n(),
      wins = sum(hit_over),
      win_rate = mean(hit_over),
      roi_pct = (sum(hit_over) * 0.91 - (n() - sum(hit_over))) / n(),
      .groups = "drop"
    ),
  
  top_players = top_players
)

summary_file <- file.path(DATA_DIR, "backtest_3season_ACTIONABLE_summary.json")
jsonlite::write_json(summary_data, summary_file, pretty = TRUE, auto_unbox = TRUE)
cat(glue("✅ Saved summary to {summary_file}\n\n"))

# ============================================================================
# FINAL SUMMARY
# ============================================================================

cat("✅ FILTERING COMPLETE!\n\n")

cat("📊 SUMMARY:\n")
cat(glue("  Original predictions: {format(nrow(backtest_all), big.mark=',')}\n"))
cat(glue("  Actionable bets: {format(nrow(filtered), big.mark=',')}\n"))
cat(glue("  Filtered out: {format(nrow(backtest_all) - nrow(filtered), big.mark=',')} ({scales::percent(1 - nrow(filtered)/nrow(backtest_all), accuracy = 0.1)})\n\n"))

cat("🎯 ACTIONABLE BETS PERFORMANCE:\n")
cat(glue("  Win rate: {scales::percent(mean(filtered$hit_over), accuracy = 0.1)}\n"))
cat(glue("  ROI: {scales::percent(roi_pct, accuracy = 0.1)}\n"))
cat(glue("  Units: {sprintf('%+.1f', roi_units)}\n\n"))

cat("💡 INTERPRETATION:\n")
if (roi_pct > 0.05) {
  cat("  ✅ PROFITABLE - Model is profitable on actionable bets\n")
  cat("  ✅ Ready for Phase 2 (real odds, injury impact)\n")
} else if (roi_pct > 0) {
  cat("  ⚠️  MARGINAL - Positive but low ROI\n")
  cat("  💡 Consider: Tighter edge threshold or more features\n")
} else {
  cat("  ❌ UNPROFITABLE - Model needs improvement\n")
  cat("  🔧 Diagnose: Check calibration, add features, adjust thresholds\n")
}

cat("\n")
