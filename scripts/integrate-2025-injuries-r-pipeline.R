# R Pipeline Integration Script for 2025 Injury Data
# Reads ESPN-collected injury data and formats it for the existing R Pipeline structure

library(jsonlite)
library(dplyr)

# Load the 2025 injury data
load_2025_injury_data <- function() {
  cat("📊 Loading 2025 injury data from ESPN collection...\n")
  
  injury_file <- "data/nfl-injuries-2025-week4.json"
  if (!file.exists(injury_file)) {
    cat("❌ Injury data file not found. Run collect-2025-injuries-espn.R first\n")
    return(NULL)
  }
  
  data <- fromJSON(injury_file)
  cat(sprintf("✅ Loaded injury data: %d teams, Week %d 2025\n", 
             data$metadata$teams_with_injuries, data$metadata$week))
  
  return(data)
}

# Convert to R Pipeline expected format
format_for_r_pipeline <- function(injury_data) {
  cat("🔄 Formatting for R Pipeline integration...\n")
  
  # Create the expected structure
  formatted_injuries <- list()
  
  for (team_code in names(injury_data$injuries)) {
    team_injuries <- injury_data$injuries[[team_code]]
    
    if (length(team_injuries) == 0) {
      # No injuries for this team
      formatted_injuries[[team_code]] <- list(
        qb_status = "active",
        qb_name = get_default_qb_name(team_code),
        rb_injuries = list(),
        wr_injuries = list(),
        te_injuries = list(),
        ol_starters_out = 0,
        db_starters_out = 0,
        kicker_status = "active",
        punter_status = "active",
        returner_status = "active",
        updated_at = Sys.time()
      )
      next
    }
    
    # Process QB status - team_injuries is a data.frame
    if (is.data.frame(team_injuries) && nrow(team_injuries) > 0) {
      qb_injuries <- team_injuries[team_injuries$position == "QB", ]
    } else {
      qb_injuries <- data.frame()
    }
    qb_status <- "active"
    qb_name <- get_default_qb_name(team_code)
    
    if (nrow(qb_injuries) > 0) {
      # Find the starting QB - prioritize injured QBs or first in list
      if (any(qb_injuries$injury_status != "active")) {
        # Use the injured QB (likely the starter)
        starter_idx <- which(qb_injuries$injury_status != "active")[1]
        starter_qb <- qb_injuries[starter_idx, ]
      } else {
        # Use first QB if all are active
        starter_qb <- qb_injuries[1, ]
      }
      
      qb_status <- starter_qb$injury_status
      qb_name <- starter_qb$player_name
      
      cat(sprintf("  🏈 %s QB: %s - %s\n", team_code, qb_name, qb_status))
    }
    
    # Process skill positions
    rb_injuries <- process_position_injuries(team_injuries, "RB")
    wr_injuries <- process_position_injuries(team_injuries, "WR") 
    te_injuries <- process_position_injuries(team_injuries, "TE")
    
    # Count line injuries
    ol_positions <- c("C", "LG", "RG", "LT", "RT", "G", "OT")
    ol_out <- count_position_injuries(team_injuries, ol_positions, c("out", "doubtful"))
    
    # Count DB injuries
    db_positions <- c("CB", "S", "FS", "SS")
    db_out <- count_position_injuries(team_injuries, db_positions, c("out", "doubtful"))
    
    # Special teams
    kicker_status <- get_special_teams_status(team_injuries, "K")
    punter_status <- get_special_teams_status(team_injuries, "P")
    returner_status <- get_special_teams_status(team_injuries, "KR")
    
    formatted_injuries[[team_code]] <- list(
      qb_status = qb_status,
      qb_name = qb_name,
      qb_injury_details = if (nrow(qb_injuries) > 0) {
        if (any(qb_injuries$injury_status != "active")) {
          starter_idx <- which(qb_injuries$injury_status != "active")[1]
          qb_injuries$description[starter_idx]
        } else {
          qb_injuries$description[1]
        }
      } else NULL,
      rb_injuries = rb_injuries,
      wr_injuries = wr_injuries,
      te_injuries = te_injuries,
      ol_starters_out = ol_out,
      db_starters_out = db_out,
      kicker_status = kicker_status,
      punter_status = punter_status,
      returner_status = returner_status,
      updated_at = Sys.time(),
      source = "ESPN_API_2025"
    )
  }
  
  cat(sprintf("✅ Formatted injury data for %d teams\n", length(formatted_injuries)))
  return(formatted_injuries)
}

# Helper functions
process_position_injuries <- function(team_injuries, position) {
  if (!is.data.frame(team_injuries) || nrow(team_injuries) == 0) return(list())
  
  pos_injuries <- team_injuries[team_injuries$position == position, ]
  
  if (nrow(pos_injuries) == 0) return(list())
  
  result <- list()
  for (i in seq_len(nrow(pos_injuries))) {
    injury <- pos_injuries[i, ]
    result[[i]] <- list(
      name = injury$player_name,
      player = injury$player_name,
      status = injury$injury_status,
      depth = i,  # Sequential order as depth
      injury = injury$description
    )
  }
  
  return(result)
}

count_position_injuries <- function(team_injuries, positions, statuses) {
  if (!is.data.frame(team_injuries) || nrow(team_injuries) == 0) return(0)
  
  matching_injuries <- team_injuries[
    team_injuries$position %in% positions & 
    team_injuries$injury_status %in% statuses,
  ]
  
  return(nrow(matching_injuries))
}

get_special_teams_status <- function(team_injuries, position) {
  if (!is.data.frame(team_injuries) || nrow(team_injuries) == 0) return("active")
  
  st_injuries <- team_injuries[team_injuries$position == position, ]
  
  if (nrow(st_injuries) == 0) return("active")
  
  # Return worst status
  if (any(st_injuries$injury_status %in% c("out", "doubtful"))) {
    worst_injury <- st_injuries[st_injuries$injury_status %in% c("out", "doubtful"), ]
    return(worst_injury$injury_status[1])
  }
  
  return("active")
}

get_default_qb_name <- function(team_code) {
  default_qbs <- c(
    "ARI" = "Kyler Murray", "ATL" = "Kirk Cousins", "BAL" = "Lamar Jackson",
    "BUF" = "Josh Allen", "CAR" = "Bryce Young", "CHI" = "Caleb Williams", 
    "CIN" = "Joe Burrow", "CLE" = "Deshaun Watson", "DAL" = "Dak Prescott",
    "DEN" = "Bo Nix", "DET" = "Jared Goff", "GB" = "Jordan Love",
    "HOU" = "C.J. Stroud", "IND" = "Anthony Richardson", "JAX" = "Trevor Lawrence",
    "KC" = "Patrick Mahomes", "LV" = "Gardner Minshew", "LAC" = "Justin Herbert",
    "LAR" = "Matthew Stafford", "MIA" = "Tua Tagovailoa", "MIN" = "Sam Darnold",
    "NE" = "Drake Maye", "NO" = "Derek Carr", "NYG" = "Daniel Jones",
    "NYJ" = "Aaron Rodgers", "PHI" = "Jalen Hurts", "PIT" = "Russell Wilson",
    "SF" = "Brock Purdy", "SEA" = "Geno Smith", "TB" = "Baker Mayfield",
    "TEN" = "Will Levis", "WAS" = "Jayden Daniels"
  )
  
  return(default_qbs[[team_code]] %||% "Starting QB")
}

# Export for R Pipeline consumption
export_for_r_pipeline <- function(formatted_data) {
  cat("💾 Exporting for R Pipeline consumption...\n")
  
  # Write to the exact path the R Pipeline expects
  output_file <- "data/nfl/injuries/latest.json"
  
  # Ensure directory exists
  dir.create(dirname(output_file), recursive = TRUE, showWarnings = FALSE)
  
  # Create final structure
  final_data <- list(
    asOf = Sys.time(),
    teams = formatted_data,
    source = "ESPN_API_2025_Week4",
    version = "v3_espn_current"
  )
  
  # Write JSON
  write_json(final_data, output_file, pretty = TRUE, auto_unbox = TRUE)
  cat(sprintf("✅ Exported to: %s\n", output_file))
  
  # Also write to a backup location
  backup_file <- sprintf("data/nfl-injuries-r-pipeline-%s.json", 
                         format(Sys.time(), "%Y%m%d_%H%M%S"))
  write_json(final_data, backup_file, pretty = TRUE, auto_unbox = TRUE)
  cat(sprintf("💾 Backup saved: %s\n", backup_file))
  
  return(final_data)
}

# Main execution
main <- function() {
  cat("🚀 INTEGRATING 2025 INJURY DATA WITH R PIPELINE\n")
  cat(paste(rep("=", 60), collapse = ""), "\n")
  
  # Load raw injury data
  injury_data <- load_2025_injury_data()
  if (is.null(injury_data)) {
    stop("Failed to load injury data")
  }
  
  # Format for R Pipeline
  formatted_data <- format_for_r_pipeline(injury_data)
  
  # Export for consumption
  final_data <- export_for_r_pipeline(formatted_data)
  
  # Summary
  cat("\n", paste(rep("=", 60), collapse = ""), "\n")
  cat("📊 INTEGRATION SUMMARY\n")
  cat(paste(rep("=", 60), collapse = ""), "\n")
  
  total_teams <- length(formatted_data)
  qb_issues <- sum(sapply(formatted_data, function(x) x$qb_status != "active"))
  
  cat(sprintf("Teams processed: %d\n", total_teams))
  cat(sprintf("QB injury issues: %d\n", qb_issues))
  
  # Highlight key injuries
  if (qb_issues > 0) {
    cat("\n🚨 QB INJURY STATUS:\n")
    for (team in names(formatted_data)) {
      team_data <- formatted_data[[team]]
      if (team_data$qb_status != "active") {
        cat(sprintf("  %s: %s - %s\n", team, team_data$qb_name, team_data$qb_status))
      }
    }
  }
  
  # Check Jayden Daniels specifically
  if (!is.null(formatted_data$WAS)) {
    cat("\n🎯 JAYDEN DANIELS STATUS:\n")
    was_data <- formatted_data$WAS
    cat(sprintf("  Status: %s\n", was_data$qb_status))
    cat(sprintf("  QB Name: %s\n", was_data$qb_name))
    if (!is.null(was_data$qb_injury_details)) {
      cat(sprintf("  Details: %s\n", substr(was_data$qb_injury_details, 1, 100)))
    }
  }
  
  cat("\n🎉 2025 injury data successfully integrated with R Pipeline!\n")
  cat("✅ Data is now ready for NFL predictions generation\n")
  
  return(final_data)
}

# Run the integration
if (!interactive()) {
  main()
} else {
  cat("Run main() to execute the integration\n")
}