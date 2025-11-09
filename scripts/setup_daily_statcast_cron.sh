#!/bin/bash
# Setup daily Statcast update to run at 2 AM
# This script adds the cron job to your crontab

PROJECT_DIR="/Users/brentgoldman/RRMODEL"
LOG_DIR="$PROJECT_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Create cron job entry
CRON_JOB="0 2 * * * cd $PROJECT_DIR && /opt/homebrew/bin/node scripts/update_statcast_daily.mjs >> logs/statcast_updates.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "update_statcast_daily.mjs"; then
    echo "⚠️  Statcast cron job already exists in crontab"
    echo ""
    echo "Current entry:"
    crontab -l | grep "update_statcast_daily.mjs"
    echo ""
    read -p "Replace with new entry? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
    
    # Remove old entry
    crontab -l | grep -v "update_statcast_daily.mjs" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job added successfully!"
echo ""
echo "📅 Schedule: Daily at 2:00 AM"
echo "📂 Logs: $LOG_DIR/statcast_updates.log"
echo ""
echo "Current crontab:"
crontab -l | grep "update_statcast_daily.mjs"
echo ""
echo "💡 To view logs: tail -f $LOG_DIR/statcast_updates.log"
echo "💡 To remove cron job: crontab -e (then delete the line)"
echo "💡 To test manually: node scripts/update_statcast_daily.mjs"
