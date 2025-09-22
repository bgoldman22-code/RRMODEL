# Convert R Pipeline Output to React Component Format
# Updated for cloud processing - uses R pipeline JSON output instead of CSV

library(dplyr)
library(jsonlite)

cat("🔄 Converting R pipeline output to React-compatible format...\n")

# Check if comprehensive predictions exist from R pipeline
comprehensive_file <- "data/nfl-td-comprehensive-latest.json"

if (!file.exists(comprehensive_file)) {
  cat("❌ No comprehensive predictions found. Running R pipeline first...\n")
  source("scripts/nfl-td-r-pipeline/cloud-pipeline.R")
}

if (file.exists(comprehensive_file)) {
  cat("✅ Loading R pipeline output...\n")
  
  # The cloud pipeline already outputs in React-compatible format
  # Just verify structure and copy to final locations
  
  comprehensive_data <- fromJSON(comprehensive_file)
  
  cat(glue("📊 Loaded {length(comprehensive_data$predictions)} player predictions\n"))
  
  # Copy to public data directory for web access
  public_comprehensive <- "public/data/nfl-td-comprehensive-latest.json"
  dir.create(dirname(public_comprehensive), showWarnings = FALSE, recursive = TRUE)
  file.copy(comprehensive_file, public_comprehensive, overwrite = TRUE)
  
  # Copy to src data directory for component access
  src_comprehensive <- "src/data/nfl-td-comprehensive-latest.json"
  dir.create(dirname(src_comprehensive), showWarnings = FALSE, recursive = TRUE)
  file.copy(comprehensive_file, src_comprehensive, overwrite = TRUE)
  
  # Copy to netlify functions directory
  netlify_comprehensive <- "netlify/functions/_data/nfl-td-comprehensive-latest.json"
  dir.create(dirname(netlify_comprehensive), showWarnings = FALSE, recursive = TRUE)
  file.copy(comprehensive_file, netlify_comprehensive, overwrite = TRUE)
  
  cat("✅ Copied comprehensive predictions to all required locations\n")
  
  # Also ensure schedule data is in the right places
  schedule_file <- "public/data/nfl-schedule-2025.json"
  if (file.exists(schedule_file)) {
    src_schedule <- "src/data/nfl-schedule-2025.json"
    netlify_schedule <- "netlify/functions/_data/nfl-schedule-2025.json"
    
    dir.create(dirname(src_schedule), showWarnings = FALSE, recursive = TRUE)
    dir.create(dirname(netlify_schedule), showWarnings = FALSE, recursive = TRUE)
    
    file.copy(schedule_file, src_schedule, overwrite = TRUE)
    file.copy(schedule_file, netlify_schedule, overwrite = TRUE)
    
    cat("✅ Copied schedule data to all required locations\n")
  }
  
  cat("🎉 React conversion completed successfully!\n")
  cat(glue("📄 Files ready:\n"))
  cat(glue("  - {public_comprehensive}\n"))
  cat(glue("  - {src_comprehensive}\n"))
  cat(glue("  - {netlify_comprehensive}\n"))
  
} else {
  cat("❌ Could not generate or find comprehensive predictions\n")
  quit(status = 1)
}

# Get current team assignments from weekly data (most recent week, any season)
current_teams <- weekly_stats %>%
  # Get most recent data for each player
  group_by(td_player_id) %>%
  arrange(desc(season), desc(week)) %>%
  slice(1) %>%
  ungroup() %>%
  select(td_player_id, team = posteam) %>%
  distinct()

# Merge with current teams
player_data <- player_data %>%
  left_join(current_teams, by = c("player_id" = "td_player_id")) %>%
  filter(!is.na(team)) %>%  # Only players with current team assignments
  mutate(
    # Adjust confidence based on position
    confidence = pmin(pmax(confidence_base + position_adj, 30), 95),
    
    # Create implied odds from probability
    anytime_odds = round(((1/anytime_prob) - 1) * 100),
    first_odds = round(((1/first_prob) - 1) * 100),
    multiple_odds = round(((1/multiple_prob) - 1) * 100)
  ) %>%
  select(-confidence_base, -position_adj)

cat("Final player data:", nrow(player_data), "players with team assignments\n")

# Convert to the format your React component expects
players_formatted <- list()

for(i in 1:nrow(player_data)) {
  player <- player_data[i,]
  
  players_formatted[[player$player_id]] <- list(
    player_id = player$player_id,
    name = player$name,
    position = player$position,
    team = player$team,
    depth_chart_position = 1,  # Placeholder
    
    # Anytime TD market
    anytime_td = list(
      probability = round(player$anytime_prob, 3),
      confidence = round(player$confidence),
      implied_odds = ifelse(player$anytime_odds > 0, paste0("+", player$anytime_odds), player$anytime_odds),
      value = 0.05,  # Placeholder
      best_book = "DraftKings"  # Placeholder
    ),
    
    # First TD market
    first_td = list(
      probability = round(player$first_prob, 3),
      confidence = round(max(player$confidence - 15, 25)),
      implied_odds = ifelse(player$first_odds > 0, paste0("+", player$first_odds), player$first_odds),
      value = 0.02,  # Placeholder
      best_book = "FanDuel"  # Placeholder
    ),
    
    # Multiple TD market
    multiple_td = list(
      probability = round(player$multiple_prob, 3),
      confidence = round(max(player$confidence - 20, 20)),
      implied_odds = ifelse(player$multiple_odds > 0, paste0("+", player$multiple_odds), player$multiple_odds),
      value = 0.01,  # Placeholder
      best_book = "BetMGM"  # Placeholder
    ),
    
    # Player factors and metadata
    key_factors = list(
      snap_percentage = min(player$avg_tds_per_week / 3, 0.95),  # Estimate
      red_zone_efficiency = min(player$total_tds / (player$weeks_played * 2), 0.9),  # Estimate
      consistency_score = min(1 / (1 + abs(player$avg_tds_per_week - 1)), 0.95)  # Estimate
    ),
    
    model_metadata = list(
      primary_td_path = ifelse(player$position == "RB", "red_zone", 
                              ifelse(player$position %in% c("WR", "TE"), "explosive", "mixed")),
      data_reliability = min(player$weeks_played / 15, 0.95),
      upside_factors = if(!is.na(player$total_tds) && player$total_tds >= 20) c("high_usage", "red_zone_target") else c("opportunity"),
      risk_factors = if(!is.na(player$weeks_played) && player$weeks_played < 10) c("limited_sample", "injury_risk") else c("regression_risk")
    )
  )
}

# Create the final JSON structure your component expects
output_data <- list(
  players = players_formatted,
  last_updated = Sys.time(),
  season = 2025,
  week = 3
)

# Write to the exact file your component expects
output_path <- "public/nfl-anytime-td-player-data.json"
write_json(output_data, output_path, pretty = TRUE, auto_unbox = TRUE)

cat("✅ Created React-compatible player data file:", output_path, "\n")

# Now create the schedule file (minimal structure for testing)
schedule_data <- list(
  season = 2025,
  weeks = list(
    "1" = list(matchups = list()),
    "2" = list(matchups = list()),
    "3" = list(
      matchups = list(
        list(id = "game1", homeTeam = "Kansas City Chiefs", awayTeam = "Atlanta Falcons"),
        list(id = "game2", homeTeam = "Philadelphia Eagles", awayTeam = "New Orleans Saints"),
        list(id = "game3", homeTeam = "Dallas Cowboys", awayTeam = "Baltimore Ravens"),
        list(id = "game4", homeTeam = "Detroit Lions", awayTeam = "Arizona Cardinals"),
        list(id = "game5", homeTeam = "Green Bay Packers", awayTeam = "Tennessee Titans"),
        list(id = "game6", homeTeam = "Houston Texans", awayTeam = "Minnesota Vikings"),
        list(id = "game7", homeTeam = "Pittsburgh Steelers", awayTeam = "Los Angeles Chargers"),
        list(id = "game8", homeTeam = "Cincinnati Bengals", awayTeam = "Washington Commanders"),
        list(id = "game9", homeTeam = "Las Vegas Raiders", awayTeam = "Carolina Panthers"),
        list(id = "game10", homeTeam = "Buffalo Bills", awayTeam = "Jacksonville Jaguars"),
        list(id = "game11", homeTeam = "Denver Broncos", awayTeam = "Tampa Bay Buccaneers"),
        list(id = "game12", homeTeam = "Los Angeles Rams", awayTeam = "San Francisco 49ers"),
        list(id = "game13", homeTeam = "Seattle Seahawks", awayTeam = "Miami Dolphins"),
        list(id = "game14", homeTeam = "Cleveland Browns", awayTeam = "New York Giants"),
        list(id = "game15", homeTeam = "Indianapolis Colts", awayTeam = "Chicago Bears"),
        list(id = "game16", homeTeam = "New York Jets", awayTeam = "New England Patriots")
      )
    )
  )
)

# Create the public/data directory structure
dir.create("public/data", recursive = TRUE, showWarnings = FALSE)
schedule_path <- "public/data/nfl-schedule-2025.json"
write_json(schedule_data, schedule_path, pretty = TRUE, auto_unbox = TRUE)

cat("✅ Created React-compatible schedule file:", schedule_path, "\n")

cat("\nFiles created for your React component:\n")
cat("1.", output_path, "- Player TD predictions\n")
cat("2.", schedule_path, "- Game schedule\n")
cat("\nYour React component should now be able to load this data!\n")