# NFLVerse Injury Data Collection for R Pipeline
# This replaces the complex ESPN API approach with native NFLVerse data

library(nflreadr)
library(dplyr)
library(jsonlite)
library(purrr)

cat("🏥 NFLVerse Injury Data Collection Starting...\n")

# Current season and week - use 2024 since 2025 data not available yet
current_season <- 2024
current_week <- 4

# Load comprehensive injury data from NFLVerse
cat("📡 Loading injury data from NFLVerse...\n")

tryCatch({
  # Load injuries for current season
  injuries_raw <- load_injuries(seasons = current_season)
  
  cat("✅ Loaded", nrow(injuries_raw), "injury records from NFLVerse\n")
  
  # Process and enhance injury data
  injuries_processed <- injuries_raw %>%
    # Filter for current/recent weeks 
    filter(
      season == current_season,
      week >= (current_week - 2), # Include past 2 weeks for context
      !is.na(report_status),
      !is.na(team)
    ) %>%
    # Enhance with severity scoring and categorization
    mutate(
      # Map NFL injury status to our expected format
      status = case_when(
        str_detect(tolower(report_status), "out") ~ "OUT",
        str_detect(tolower(report_status), "doubtful") ~ "DOUBTFUL", 
        str_detect(tolower(report_status), "questionable") ~ "QUESTIONABLE",
        str_detect(tolower(report_status), "probable") ~ "PROBABLE",
        TRUE ~ "ACTIVE"
      ),
      
      # Calculate injury severity (0-4 scale)
      severity = case_when(
        status == "OUT" ~ 4,
        status == "DOUBTFUL" ~ 3, 
        status == "QUESTIONABLE" ~ 2,
        status == "PROBABLE" ~ 1,
        TRUE ~ 0
      ),
      
      # Categorize injury types
      injury_type = case_when(
        is.na(body_part) ~ "Unknown",
        str_detect(tolower(body_part), "knee|leg|thigh|hamstring|quad|ankle|foot") ~ "Lower Body",
        str_detect(tolower(body_part), "shoulder|arm|hand|wrist|elbow") ~ "Upper Body",
        str_detect(tolower(body_part), "back|hip|groin|core") ~ "Core/Back",
        str_detect(tolower(body_part), "head|concussion|neck") ~ "Head/Neck",
        TRUE ~ "Other"
      ),
      
      # Position-based impact scoring
      position_impact = case_when(
        position == "QB" ~ severity * 3,  # QB injuries have 3x impact
        position %in% c("RB", "WR", "TE") ~ severity * 2,  # Skill positions 2x
        position %in% c("T", "G", "C") ~ severity * 1.5,   # O-line 1.5x  
        TRUE ~ severity  # Default impact
      ),
      
      # Convert team abbreviations to standard format
      team = case_when(
        team == "LAR" ~ "LAR",
        team == "LAC" ~ "LAC", 
        team == "LV" ~ "LV",
        TRUE ~ team
      )
    ) %>%
    # Select key fields for export
    select(
      season, week, team, 
      player_name = full_name, position, 
      status, severity, injury_type, position_impact,
      body_part, report_status, date_modified
    ) %>%
    arrange(team, desc(severity), position)
  
  cat("✅ Processed", nrow(injuries_processed), "injury records\n")
  
  # Generate team-level injury summaries for R Pipeline
  team_injury_summary <- injuries_processed %>%
    filter(week == current_week) %>%  # Current week only for active status
    group_by(team) %>%
    summarise(
      # QB Status (most critical)
      qb_status = case_when(
        any(position == "QB" & status == "OUT") ~ "OUT",
        any(position == "QB" & status == "DOUBTFUL") ~ "DOUBTFUL", 
        any(position == "QB" & status == "QUESTIONABLE") ~ "QUESTIONABLE",
        TRUE ~ "ACTIVE"
      ),
      
      qb_name = ifelse(any(position == "QB" & status != "ACTIVE"), 
                      paste(player_name[position == "QB" & status != "ACTIVE"], collapse = ", "),
                      "Healthy"),
      
      # Skill position injuries
      rb_injuries = sum(position == "RB" & severity >= 2),
      wr_injuries = sum(position == "WR" & severity >= 2), 
      te_injuries = sum(position == "TE" & severity >= 2),
      
      # Line injuries  
      ol_starters_out = sum(position %in% c("T", "G", "C") & status == "OUT"),
      
      # Defense
      db_starters_out = sum(position %in% c("CB", "S", "FS", "SS") & status == "OUT"),
      
      # Special teams
      kicker_status = ifelse(any(position == "K" & status != "ACTIVE"), "INJURED", "ACTIVE"),
      
      # Overall team injury impact
      total_injury_impact = sum(position_impact, na.rm = TRUE),
      total_players_out = sum(status == "OUT"),
      total_players_questionable = sum(status %in% c("QUESTIONABLE", "DOUBTFUL")),
      
      updated_at = Sys.time()
    ) %>%
    ungroup()
  
  # Create the complete injury data structure expected by R Pipeline
  injury_export <- list(
    meta = list(
      source = "NFLVerse",
      generated_at = Sys.time(),
      season = current_season,
      week = current_week,
      total_injuries = nrow(injuries_processed),
      teams_processed = length(unique(injuries_processed$team))
    ),
    teams = setNames(
      map(unique(team_injury_summary$team), function(tm) {
        team_data <- team_injury_summary[team_injury_summary$team == tm, ]
        list(
          qb_status = team_data$qb_status,
          qb_name = team_data$qb_name,
          qb_injury_details = list(),
          rb_injuries = team_data$rb_injuries,
          wr_injuries = team_data$wr_injuries,
          te_injuries = team_data$te_injuries,
          ol_starters_out = team_data$ol_starters_out,
          db_starters_out = team_data$db_starters_out,
          kicker_status = team_data$kicker_status,
          punter_status = "ACTIVE",  # Default
          returner_status = "ACTIVE", # Default
          updated_at = as.character(team_data$updated_at)
        )
      }),
      unique(team_injury_summary$team)
    ),
    raw_injuries = injuries_processed
  )
  
  # Export to JSON for R Pipeline consumption
  output_file <- "data/nfl-injuries-latest-nflverse.json"
  write_json(injury_export, output_file, pretty = TRUE, auto_unbox = TRUE)
  
  cat("✅ Injury data exported to:", output_file, "\n")
  
  # Summary report
  cat("\n📊 INJURY REPORT SUMMARY:\n")
  cat(paste(rep("=", 40), collapse=""), "\n")
  
  # QB injury alerts
  qb_issues <- team_injury_summary %>%
    filter(qb_status != "ACTIVE") %>%
    select(team, qb_status, qb_name)
  
  if (nrow(qb_issues) > 0) {
    cat("🚨 QB INJURY ALERTS:\n")
    for (i in seq_len(nrow(qb_issues))) {
      cat("  ", qb_issues$team[i], ":", qb_issues$qb_name[i], "(", qb_issues$qb_status[i], ")\n")
    }
  } else {
    cat("✅ All starting QBs healthy\n")
  }
  
  # Top injury concerns
  cat("\n📈 TEAM INJURY IMPACT (Top 5):\n")
  top_injuries <- team_injury_summary %>%
    arrange(desc(total_injury_impact)) %>%
    head(5) %>%
    select(team, total_players_out, total_players_questionable, total_injury_impact)
  
  print(top_injuries)
  
  # Check for Jayden Daniels specifically
  jayden_status <- injuries_processed %>%
    filter(str_detect(tolower(player_name), "daniels")) %>%
    filter(team == "WAS") %>%
    arrange(desc(week))
  
  if (nrow(jayden_status) > 0) {
    cat("\n🎯 JAYDEN DANIELS STATUS:\n")
    latest_jayden <- jayden_status[1, ]
    cat("  Week", latest_jayden$week, "-", latest_jayden$status, "\n")
    cat("  Injury:", latest_jayden$injury_type, "(",latest_jayden$body_part, ")\n")
    cat("  Severity:", latest_jayden$severity, "/4\n")
  } else {
    cat("\n❓ Jayden Daniels not found in current injury reports\n")
  }
  
  cat("\n✅ NFLVerse injury data collection completed successfully!\n")
  
}, error = function(e) {
  cat("❌ Error in NFLVerse injury collection:\n")
  cat("  ", e$message, "\n")
  cat("💡 This may be due to NFLVerse API being temporarily unavailable\n")
  cat("   or the current season data not being ready yet.\n")
})

cat("🏁 Script completed.\n")