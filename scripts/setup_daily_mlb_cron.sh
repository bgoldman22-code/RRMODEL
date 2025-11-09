#!/bin/bash
# Setup daily MLB pipeline to run at 8 AM
# This generates predictions and updates the dashboard

PROJECT_DIR="/Users/brentgoldman/RRMODEL"
LOG_DIR="$PROJECT_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Create cron job entry (8 AM daily during season: March-October)
CRON_JOB="0 8 * 3-10 * cd $PROJECT_DIR && /opt/homebrew/bin/node scripts/run_mlb_pipeline.mjs >> logs/mlb_pipeline.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "run_mlb_pipeline.mjs"; then
    echo "⚠️  MLB pipeline cron job already exists in crontab"
    echo ""
    echo "Current entry:"
    crontab -l | grep "run_mlb_pipeline.mjs"
    echo ""
    read -p "Replace with new entry? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
    
    # Remove old entry
    crontab -l | grep -v "run_mlb_pipeline.mjs" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job added successfully!"
echo ""
echo "📅 Schedule: Daily at 8:00 AM (March-October only)"
echo "📂 Logs: $LOG_DIR/mlb_pipeline.log"
echo ""
echo "Current crontab:"
crontab -l | grep "run_mlb_pipeline.mjs"
echo ""
echo "💡 To view logs: tail -f $LOG_DIR/mlb_pipeline.log"
echo "💡 To test manually: node scripts/run_mlb_pipeline.mjs"
