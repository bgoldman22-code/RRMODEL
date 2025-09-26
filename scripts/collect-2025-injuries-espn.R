# NFL 2025 Injury Data Collection System
# Uses ESPN API to get current Week 4 2025 injury data
# Exports to JSON format for R Pipeline integration

library(jsonlite)
library(httr)
library(dplyr)

# ESPN Team ID mapping
get_espn_team_id <- function(nfl_code) {
  team_map <- c(
    "ARI" = "22", "ATL" = "1", "BAL" = "33", "BUF" = "2", "CAR" = "29",
    "CHI" = "3", "CIN" = "4", "CLE" = "5", "DAL" = "6", "DEN" = "7",
    "DET" = "8", "GB" = "9", "HOU" = "34", "IND" = "11", "JAX" = "30",
    "KC" = "12", "LV" = "13", "LAC" = "24", "LAR" = "14", "MIA" = "15",
    "MIN" = "16", "NE" = "17", "NO" = "18", "NYG" = "19", "NYJ" = "20",
    "PHI" = "21", "PIT" = "23", "SF" = "25", "SEA" = "26", "TB" = "27",
    "TEN" = "10", "WAS" = "28"
  )
  
  return(team_map[[nfl_code]])
}

# Map ESPN injury status to our standard format
map_injury_status <- function(espn_status) {
  status_map <- c(
    "out" = "out",
    "doubtful" = "doubtful", 
    "questionable" = "questionable",
    "probable" = "active",
    "active" = "active",
    "day-to-day" = "questionable",
    "injured reserve" = "out"
  )
  
  mapped <- status_map[[tolower(espn_status)]]
  if (is.null(mapped)) return("questionable")
  return(mapped)
}

# Determine position from player name (fallback method)
get_position_from_name <- function(player_name) {
  name_lower <- tolower(player_name)
  
  # QB detection
  qb_names <- c("daniels", "mahomes", "allen", "burrow", "jackson", "murray", 
                "cousins", "jones", "purdy", "mariota", "watson", "wilson")
  if (any(sapply(qb_names, function(x) grepl(x, name_lower)))) {
    return("QB")
  }
  
  # Common RB names (this is rough but helps)
  rb_names <- c("henry", "mccaffrey", "cook", "kamara", "barkley", "elliott")
  if (any(sapply(rb_names, function(x) grepl(x, name_lower)))) {
    return("RB")
  }
  
  # WR names
  wr_names <- c("hill", "adams", "jefferson", "chase", "samuel", "mclaurin", "brown")
  if (any(sapply(wr_names, function(x) grepl(x, name_lower)))) {
    return("WR")
  }
  
  return("UNK")  # Unknown
}

# Collect injuries for a single team
collect_team_injuries <- function(team_code) {
  cat(sprintf("🏥 Collecting %s injuries...\n", team_code))
  
  team_id <- get_espn_team_id(team_code)
  if (is.null(team_id)) {
    cat(sprintf("❌ Unknown team code: %s\n", team_code))
    return(list())
  }
  
  # ESPN Injuries API endpoint
  url <- sprintf("https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/%s/injuries", team_id)
  
  tryCatch({
    # Get injury references
    response <- GET(url, add_headers("User-Agent" = "Mozilla/5.0 (compatible; NFLInjuryBot/1.0)"))
    
    if (status_code(response) != 200) {
      cat(sprintf("❌ ESPN API error for %s: HTTP %d\n", team_code, status_code(response)))
      return(list())
    }
    
    data <- fromJSON(content(response, as = "text"))
    injury_refs <- data$items
    
    if (is.null(injury_refs) || length(injury_refs) == 0) {
      cat(sprintf("✅ %s: No injuries reported\n", team_code))
      return(list())
    }
    
    cat(sprintf("📋 %s: Processing %d injury references\n", team_code, nrow(injury_refs)))
    
    injuries <- list()
    
    # Process each injury reference (limit to prevent timeout)
    refs_to_process <- min(nrow(injury_refs), 20)
    for (i in 1:refs_to_process) {
      injury_url <- injury_refs$`$ref`[i]
      
      tryCatch({
        # Get detailed injury data
        injury_response <- GET(injury_url)
        if (status_code(injury_response) != 200) next
        
        injury_data <- fromJSON(content(injury_response, as = "text"))
        
        # Get athlete data
        athlete_name <- "Unknown Player"
        position <- "UNK"
        
        if (!is.null(injury_data$athlete) && !is.null(injury_data$athlete$`$ref`)) {
          tryCatch({
            athlete_response <- GET(injury_data$athlete$`$ref`)
            if (status_code(athlete_response) == 200) {
              athlete_data <- fromJSON(content(athlete_response, as = "text"))
              athlete_name <- coalesce(athlete_data$displayName, athlete_data$name, "Unknown Player")
              
              if (!is.null(athlete_data$position) && !is.null(athlete_data$position$abbreviation)) {
                position <- athlete_data$position$abbreviation
              } else {
                # Fallback to name-based position detection
                position <- get_position_from_name(athlete_name)
              }
            }
          }, error = function(e) {
            # Use name-based position detection if athlete fetch fails
            position <<- get_position_from_name(athlete_name)
          })
        }
        
        # Process the injury
        processed_injury <- list(
          player_name = athlete_name,
          full_name = athlete_name,  # Both for compatibility
          position = position,
          injury_status = map_injury_status(injury_data$status),
          description = coalesce(
            injury_data$longComment, 
            injury_data$shortComment, 
            injury_data$description, 
            injury_data$detail, 
            "No details available"
          ),
          espn_status = injury_data$status,
          espn_id = coalesce(injury_data$athlete$id, "unknown"),
          updated_at = Sys.time()
        )
        
        injuries[[length(injuries) + 1]] <- processed_injury
        
        # Log significant injuries
        if (position == "QB" || processed_injury$injury_status %in% c("out", "doubtful")) {
          status_icon <- if (position == "QB") "🏈" else if (processed_injury$injury_status == "out") "🚨" else "⚠️"
          cat(sprintf("  %s %s (%s) - %s\n", 
                     status_icon, athlete_name, position, processed_injury$injury_status))
        }
        
      }, error = function(e) {
        cat(sprintf("⚠️ Error processing injury %d: %s\n", i, e$message))
      })
    }
    
    cat(sprintf("✅ %s: Processed %d injuries\n", team_code, length(injuries)))
    return(injuries)
    
  }, error = function(e) {
    cat(sprintf("❌ Failed to collect %s injuries: %s\n", team_code, e$message))
    return(list())
  })
}

# Main collection function
collect_all_nfl_injuries_2025 <- function() {
  cat("🏥 COLLECTING 2025 NFL INJURY DATA (Week 4)\n")
  cat("Source: ESPN API\n")
  cat(paste(rep("=", 50), collapse = ""), "\n")
  
  # All NFL teams
  nfl_teams <- c(
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
    "DET", "GB", "HOU", "IND", "JAX", "KC", "LV", "LAC", "LAR", "MIA",
    "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SF", "SEA", "TB",
    "TEN", "WAS"
  )
  
  # Collect all injury data
  all_injuries <- list()
  qb_issues <- list()
  
  for (team in nfl_teams) {
    team_injuries <- collect_team_injuries(team)
    
    if (length(team_injuries) > 0) {
      all_injuries[[team]] <- team_injuries
      
      # Check for QB issues
      qb_injuries <- team_injuries[sapply(team_injuries, function(x) x$position == "QB")]
      if (length(qb_injuries) > 0) {
        for (qb in qb_injuries) {
          if (qb$injury_status != "active") {
            qb_issues[[length(qb_issues) + 1]] <- sprintf("%s: %s (%s)", 
                                                          team, qb$player_name, qb$injury_status)
          }
        }
      }
    }
    
    # Small delay to avoid rate limiting
    Sys.sleep(0.2)
  }
  
  # Create the final structure
  output <- list(
    metadata = list(
      source = "ESPN_API_2025",
      season = 2025,
      week = 4,
      collected_at = Sys.time(),
      total_teams = length(nfl_teams),
      teams_with_injuries = length(all_injuries)
    ),
    injuries = all_injuries
  )
  
  # Summary
  cat("\n", paste(rep("=", 50), collapse = ""), "\n")
  cat("📊 COLLECTION SUMMARY\n")
  cat(paste(rep("=", 50), collapse = ""), "\n")
  total_injuries <- sum(sapply(all_injuries, length))
  cat(sprintf("Teams processed: %d/%d\n", length(all_injuries), length(nfl_teams)))
  cat(sprintf("Total injuries: %d\n", total_injuries))
  
  if (length(qb_issues) > 0) {
    cat("\n🚨 QB INJURY ALERTS:\n")
    for (issue in qb_issues) {
      cat(sprintf("  %s\n", issue))
    }
  }
  
  # Save to JSON file for R Pipeline integration
  json_file <- "data/nfl-injuries-2025-week4.json"
  write_json(output, json_file, pretty = TRUE, auto_unbox = TRUE)
  cat(sprintf("\n💾 Data saved to: %s\n", json_file))
  
  return(output)
}

# Helper function for coalesce (R equivalent of SQL COALESCE)
coalesce <- function(...) {
  args <- list(...)
  for (arg in args) {
    if (!is.null(arg) && !is.na(arg) && arg != "") {
      return(arg)
    }
  }
  return(NA)
}

# Run the collection
cat("Starting 2025 NFL injury data collection...\n")
injury_data <- collect_all_nfl_injuries_2025()

# Check for Jayden Daniels specifically
cat("\n🎯 JAYDEN DANIELS CHECK:\n")
was_injuries <- injury_data$injuries$WAS
if (!is.null(was_injuries)) {
  jayden <- was_injuries[sapply(was_injuries, function(x) grepl("daniels", tolower(x$player_name)))]
  if (length(jayden) > 0) {
    cat("✅ FOUND JAYDEN DANIELS:\n")
    cat(sprintf("  Status: %s\n", jayden[[1]]$injury_status))
    cat(sprintf("  Description: %s\n", jayden[[1]]$description))
  } else {
    cat("❓ Jayden Daniels not found in injury list (likely healthy)\n")
  }
} else {
  cat("❓ No Washington injury data collected\n")
}

cat("\n🎉 2025 Injury data collection complete!\n")