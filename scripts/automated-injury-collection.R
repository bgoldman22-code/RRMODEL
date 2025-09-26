# Automated NFL Injury Data Collection System
# Runs daily at 10am and 1 hour before each kickoff on game days
# Integrates with R Pipeline for real-time prediction updates

library(jsonlite)
library(httr)
library(dplyr)
library(lubridate)

# Source the collection functions
source("scripts/collect-2025-injuries-espn.R")
source("scripts/integrate-2025-injuries-r-pipeline.R")

# Get current NFL game schedule for today
get_todays_nfl_games <- function() {
  tryCatch({
    # Use ESPN API to get today's games
    today <- Sys.Date()
    url <- sprintf("https://sports.espn.com/nfl/schedule/_/date/%s", format(today, "%Y%m%d"))
    
    # For now, return sample kickoff times - in production this would parse ESPN schedule
    # Common NFL kickoff times (ET)
    kickoff_times <- c(
      as.POSIXct("13:00:00", format = "%H:%M:%S", tz = "America/New_York"),  # 1:00 PM ET
      as.POSIXct("16:25:00", format = "%H:%M:%S", tz = "America/New_York"),  # 4:25 PM ET  
      as.POSIXct("20:20:00", format = "%H:%M:%S", tz = "America/New_York")   # 8:20 PM ET
    )
    
    # Add today's date to times
    today_kickoffs <- as.POSIXct(paste(Sys.Date(), format(kickoff_times, "%H:%M:%S")))
    
    return(today_kickoffs)
    
  }, error = function(e) {
    cat("⚠️ Could not fetch today's games, using default schedule\n")
    return(c())
  })
}

# Check if we should run injury collection now
should_run_injury_collection <- function() {
  current_time <- Sys.time()
  current_hour <- as.numeric(format(current_time, "%H"))
  current_minute <- as.numeric(format(current_time, "%M"))
  
  # Always run at 10:00 AM daily
  if (current_hour == 10 && current_minute <= 5) {
    cat("📅 Daily 10 AM injury collection triggered\n")
    return(list(run = TRUE, reason = "daily_10am"))
  }
  
  # Get today's games
  todays_games <- get_todays_nfl_games()
  
  if (length(todays_games) > 0) {
    # Check if we're within 1 hour of any kickoff
    for (kickoff in todays_games) {
      time_until_kickoff <- as.numeric(difftime(kickoff, current_time, units = "hours"))
      
      if (time_until_kickoff <= 1 && time_until_kickoff >= 0.9) {  # 54-60 minutes before
        cat(sprintf("🏈 Pre-game injury collection triggered for %s kickoff\n", 
                   format(kickoff, "%I:%M %p")))
        return(list(run = TRUE, reason = "pre_game", kickoff = kickoff))
      }
    }
  }
  
  return(list(run = FALSE, reason = "not_scheduled"))
}

# Main automated collection function
run_automated_injury_collection <- function(force = FALSE) {
  cat("🤖 AUTOMATED NFL INJURY DATA COLLECTION\n")
  cat("Current time:", format(Sys.time()), "\n")
  cat(paste(rep("=", 50), collapse = ""), "\n")
  
  # Check if we should run
  if (!force) {
    schedule_check <- should_run_injury_collection()
    if (!schedule_check$run) {
      cat(sprintf("⏳ Not scheduled to run. Reason: %s\n", schedule_check$reason))
      return(FALSE)
    }
    
    cat(sprintf("✅ Collection triggered: %s\n", schedule_check$reason))
  } else {
    cat("🔧 Forced collection run\n")
  }
  
  start_time <- Sys.time()
  
  tryCatch({
    # Step 1: Collect fresh injury data from ESPN
    cat("\n📊 Step 1: Collecting fresh injury data from ESPN...\n")
    injury_data <- collect_all_nfl_injuries_2025()
    
    # Step 2: Integrate with R Pipeline
    cat("\n⚙️ Step 2: Integrating with R Pipeline...\n") 
    formatted_data <- format_for_r_pipeline(injury_data)
    final_data <- export_for_r_pipeline(formatted_data)
    
    # Step 3: Generate collection summary
    collection_time <- as.numeric(difftime(Sys.time(), start_time, units = "mins"))
    
    cat("\n", paste(rep("=", 50), collapse = ""), "\n")
    cat("📈 COLLECTION SUMMARY\n")
    cat(paste(rep("=", 50), collapse = ""), "\n")
    
    total_teams <- length(formatted_data)
    qb_issues <- sum(sapply(formatted_data, function(x) x$qb_status != "active"))
    
    cat(sprintf("⏱️ Collection time: %.1f minutes\n", collection_time))
    cat(sprintf("🏈 Teams processed: %d\n", total_teams))
    cat(sprintf("🚨 QB issues detected: %d\n", qb_issues))
    
    # Key injury alerts
    if (qb_issues > 0) {
      cat("\n🚨 CRITICAL QB ALERTS:\n")
      for (team in names(formatted_data)) {
        team_data <- formatted_data[[team]]
        if (team_data$qb_status != "active") {
          cat(sprintf("  %s: %s (%s)\n", team, team_data$qb_name, team_data$qb_status))
        }
      }
    }
    
    # High injury impact teams
    impact_teams <- c()
    for (team in names(formatted_data)) {
      team_data <- formatted_data[[team]]
      impact_score <- 0
      
      if (team_data$qb_status == "out") impact_score <- impact_score + 10
      else if (team_data$qb_status == "doubtful") impact_score <- impact_score + 7
      else if (team_data$qb_status == "questionable") impact_score <- impact_score + 3
      
      impact_score <- impact_score + (team_data$ol_starters_out %||% 0) * 2
      
      skill_out <- length(Filter(function(x) x$status == "out", team_data$rb_injuries %||% list())) +
                   length(Filter(function(x) x$status == "out", team_data$wr_injuries %||% list())) +
                   length(Filter(function(x) x$status == "out", team_data$te_injuries %||% list()))
      impact_score <- impact_score + skill_out
      
      if (impact_score >= 5) {
        impact_teams <- c(impact_teams, sprintf("%s(%d)", team, impact_score))
      }
    }
    
    if (length(impact_teams) > 0) {
      cat(sprintf("\n⚠️ HIGH INJURY IMPACT TEAMS: %s\n", paste(impact_teams, collapse = ", ")))
    }
    
    # Log successful collection
    log_entry <- list(
      timestamp = Sys.time(),
      success = TRUE,
      teams_processed = total_teams,
      qb_issues = qb_issues,
      collection_time_minutes = collection_time,
      high_impact_teams = impact_teams
    )
    
    # Write to log file
    log_file <- "data/injury_collection_log.json"
    if (file.exists(log_file)) {
      existing_log <- fromJSON(log_file)
      updated_log <- c(existing_log, list(log_entry))
    } else {
      updated_log <- list(log_entry)
    }
    
    # Keep only last 30 entries
    if (length(updated_log) > 30) {
      updated_log <- tail(updated_log, 30)
    }
    
    write_json(updated_log, log_file, pretty = TRUE, auto_unbox = TRUE)
    
    cat("\n✅ Automated injury collection completed successfully\n")
    cat(sprintf("📝 Log entry added to %s\n", log_file))
    
    return(TRUE)
    
  }, error = function(e) {
    cat(sprintf("\n❌ Automated collection failed: %s\n", e$message))
    
    # Log failure
    log_entry <- list(
      timestamp = Sys.time(),
      success = FALSE,
      error = e$message,
      collection_time_minutes = as.numeric(difftime(Sys.time(), start_time, units = "mins"))
    )
    
    log_file <- "data/injury_collection_log.json"
    if (file.exists(log_file)) {
      existing_log <- fromJSON(log_file)
      updated_log <- c(existing_log, list(log_entry))
      write_json(updated_log, log_file, pretty = TRUE, auto_unbox = TRUE)
    }
    
    return(FALSE)
  })
}

# Helper function for null coalescing
`%||%` <- function(lhs, rhs) {
  if (!is.null(lhs) && length(lhs) > 0) lhs else rhs
}

# Command line execution
if (!interactive()) {
  # Check for force flag
  args <- commandArgs(trailingOnly = TRUE)
  force_run <- "--force" %in% args
  
  cat("🕙 NFL Injury Data Automation System\n")
  cat("===================================\n")
  
  result <- run_automated_injury_collection(force = force_run)
  
  if (result) {
    cat("🎉 Collection completed successfully\n")
    quit(status = 0)
  } else {
    cat("💥 Collection failed or was not scheduled\n") 
    quit(status = 1)
  }
} else {
  cat("Interactive mode: Use run_automated_injury_collection() to test\n")
}