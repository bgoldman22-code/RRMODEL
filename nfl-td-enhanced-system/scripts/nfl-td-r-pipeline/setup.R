# scripts/nfl-td-r-pipeline/setup.R
# Installs/loads required packages.
# Run: Rscript scripts/nfl-td-r-pipeline/setup.R

pkgs <- c("tidyverse", "nflreadr", "jsonlite", "lubridate", "dplyr")
to_install <- pkgs[!pkgs %in% installed.packages()[, "Package"]]
if (length(to_install) > 0) {
  install.packages(to_install, repos = "https://cloud.r-project.org")
}
