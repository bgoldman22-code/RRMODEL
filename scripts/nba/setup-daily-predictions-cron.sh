#!/bin/bash

##
# Setup Daily NBA Predictions Cron Job
# Runs every day at 7:00 AM to generate fresh predictions
##

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🏀 NBA Daily Predictions Cron Setup"
echo "===================================="
echo ""
echo "This will set up a cron job to run predictions daily at 7:00 AM"
echo "Project root: $PROJECT_ROOT"
echo ""

# Create wrapper script that sets environment and runs predictions
WRAPPER_SCRIPT="$PROJECT_ROOT/scripts/nba/run-daily-predictions.sh"

cat > "$WRAPPER_SCRIPT" << 'EOF'
#!/bin/bash

# NBA Daily Predictions Runner
# This script is called by cron to generate daily predictions

# Get project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load environment (adjust path to your .env file or set ODDS_API_KEY here)
# export ODDS_API_KEY=your_key_here
# Or source from .env:
# [ -f "$PROJECT_ROOT/.env" ] && source "$PROJECT_ROOT/.env"

# For now, check if ODDS_API_KEY is set in environment
if [ -z "$ODDS_API_KEY" ]; then
  echo "❌ ERROR: ODDS_API_KEY not set. Set it in your shell profile or modify this script."
  exit 1
fi

# Log file
LOG_FILE="$PROJECT_ROOT/logs/daily-predictions-$(date +%Y%m%d).log"

# Run predictions
echo "🏀 Running NBA predictions at $(date)" | tee -a "$LOG_FILE"
cd "$PROJECT_ROOT" && node scripts/nba/generate-live-predictions.js 2>&1 | tee -a "$LOG_FILE"

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ Predictions generated successfully at $(date)" | tee -a "$LOG_FILE"
else
  echo "❌ Predictions failed at $(date)" | tee -a "$LOG_FILE"
  exit 1
fi
EOF

chmod +x "$WRAPPER_SCRIPT"
echo "✅ Created wrapper script: $WRAPPER_SCRIPT"
echo ""

# Create cron entry
CRON_ENTRY="0 7 * * * $WRAPPER_SCRIPT"

echo "Cron entry to add:"
echo "$CRON_ENTRY"
echo ""
echo "To install, run one of these commands:"
echo ""
echo "Option 1 - Add to your crontab manually:"
echo "  crontab -e"
echo "  Then add this line:"
echo "  $CRON_ENTRY"
echo ""
echo "Option 2 - Append automatically (be careful with existing crons):"
echo "  (crontab -l 2>/dev/null; echo \"$CRON_ENTRY\") | crontab -"
echo ""
echo "Note: Make sure ODDS_API_KEY is set in your environment!"
echo "You can add it to ~/.zshrc or ~/.bash_profile:"
echo "  export ODDS_API_KEY=your_key_here"
echo ""
echo "To test manually:"
echo "  export ODDS_API_KEY=your_key_here && $WRAPPER_SCRIPT"
echo ""
