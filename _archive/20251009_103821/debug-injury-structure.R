# Debug NFLVerse injury data structure
library(nflreadr)
library(dplyr)

# Source the existing R Pipeline configuration
source("scripts/nfl-td-r-pipeline/01_data_collection.R")

cat("🔍 Debugging NFLVerse injury data structure...\n")

# Get injury data
injury_data <- collect_injury_data()

# Check 2024 Week 4 data structure
week4_2024 <- injury_data %>%
  filter(season == 2024, week == 4) %>%
  head(10)

cat("📊 Sample injury records structure:\n")
str(week4_2024)

cat("\n📋 Column names:\n")
print(names(week4_2024))

cat("\n🏈 Position values (unique):\n")
positions <- injury_data %>%
  filter(season == 2024, week == 4) %>%
  pull(position) %>%
  unique() %>%
  sort()

print(positions[!is.na(positions)])

cat("\n🚨 Sample QB records:\n")
qb_records <- injury_data %>%
  filter(season == 2024, week == 4, position == "QB") %>%
  select(full_name, team, position, report_status, injury_severity)

print(qb_records)