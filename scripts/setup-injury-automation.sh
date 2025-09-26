#!/bin/bash

# NFL Injury Data Collection - Automated Scheduling Setup
# Sets up cron jobs for daily 10am collection and pre-game updates

echo "🤖 Setting up automated NFL injury data collection"
echo "=================================================="

# Get the current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📁 Project directory: $PROJECT_DIR"

# Create the cron job entries
CRON_DAILY="0 10 * * * cd $PROJECT_DIR && /usr/local/bin/Rscript scripts/automated-injury-collection.R >> logs/injury-collection.log 2>&1"
CRON_PREGAME="0 12,15,19 * * 0,1,4 cd $PROJECT_DIR && /usr/local/bin/Rscript scripts/automated-injury-collection.R >> logs/injury-collection.log 2>&1"

# Explanation of cron times:
# Daily: 0 10 * * * = Every day at 10:00 AM
# Pre-game: 0 12,15,19 * * 0,1,4 = At 12:00, 15:00, and 19:00 on Sunday(0), Monday(1), and Thursday(4)
# This covers most NFL game times (1pm, 4pm, 8pm ET games)

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Create backup of current crontab
echo "💾 Backing up current crontab..."
crontab -l > "$PROJECT_DIR/logs/crontab_backup_$(date +%Y%m%d_%H%M%S).txt" 2>/dev/null || echo "No existing crontab to backup"

# Add new cron jobs (avoiding duplicates)
echo "⏰ Adding cron jobs..."

# Get current crontab and filter out existing NFL injury jobs
(crontab -l 2>/dev/null | grep -v "automated-injury-collection.R"; echo "$CRON_DAILY"; echo "$CRON_PREGAME") | crontab -

echo "✅ Cron jobs added successfully!"
echo ""
echo "📋 Scheduled collections:"
echo "  • Daily at 10:00 AM ET"
echo "  • 1 hour before Sunday 1:00 PM games (12:00 PM)"  
echo "  • 1 hour before Sunday 4:00 PM games (3:00 PM)"
echo "  • 1 hour before Sunday/Monday/Thursday 8:00 PM games (7:00 PM)"
echo ""
echo "📝 Logs will be written to: $PROJECT_DIR/logs/injury-collection.log"
echo ""

# Test the automation script
echo "🧪 Testing automated collection script..."
cd "$PROJECT_DIR"

if /usr/local/bin/Rscript scripts/automated-injury-collection.R --force; then
    echo "✅ Test run successful!"
else
    echo "❌ Test run failed - check the script"
    exit 1
fi

echo ""
echo "🎉 Automated NFL injury data collection is now set up!"
echo ""
echo "📊 To check current status:"
echo "  crontab -l"
echo ""
echo "📈 To view logs:"
echo "  tail -f $PROJECT_DIR/logs/injury-collection.log"
echo ""
echo "🔧 To run manual collection:"
echo "  cd $PROJECT_DIR && Rscript scripts/automated-injury-collection.R --force"