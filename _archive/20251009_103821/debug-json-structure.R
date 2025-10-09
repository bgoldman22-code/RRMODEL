# Debug the JSON data structure
library(jsonlite)

# Load and examine the data structure
data <- fromJSON("data/nfl-injuries-2025-week4.json")

cat("📊 Data structure debugging:\n")
cat("Top level keys:", names(data), "\n")
cat("Metadata:", names(data$metadata), "\n")
cat("First team (ARI) structure:\n")

# Check Arizona's data
ari_data <- data$injuries$ARI
cat("ARI class:", class(ari_data), "\n")
cat("ARI length:", length(ari_data), "\n")

if (is.data.frame(ari_data)) {
  cat("ARI is a data.frame with columns:", names(ari_data), "\n")
  cat("First row:\n")
  print(ari_data[1, ])
} else if (is.list(ari_data)) {
  cat("ARI is a list with", length(ari_data), "items\n")
  cat("First item class:", class(ari_data[[1]]), "\n")
  cat("First item names:", names(ari_data[[1]]), "\n")
  cat("First item position:", ari_data[[1]]$position, "\n")
} else {
  cat("ARI is of unknown type\n")
  str(ari_data)
}

# Check Washington specifically for Jayden Daniels
cat("\n🎯 Washington data:\n")
was_data <- data$injuries$WAS
cat("WAS class:", class(was_data), "\n")
cat("WAS length:", length(was_data), "\n")

if (is.data.frame(was_data)) {
  cat("WAS columns:", names(was_data), "\n")
  # Look for QB
  qb_rows <- was_data[was_data$position == "QB", ]
  if (nrow(qb_rows) > 0) {
    cat("QB found:\n")
    print(qb_rows[c("player_name", "position", "injury_status")])
  }
}