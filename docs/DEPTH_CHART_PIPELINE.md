# DEPTH CHART DATA PIPELINE

## 📂 Source of Truth
**MASTER LOCATION**: `public/history/2025/weekN/depth-charts.json`

This is the **ONLY** file you should manually edit with injury updates and roster changes.

## 🔄 Automated Sync System

### Quick Sync Command:
```bash
node scripts/sync-depth-charts.js 4    # Sync week 4 data
node scripts/sync-depth-charts.js      # Auto-detects current week
```

### What Gets Synced:
- `netlify/functions/_data/nfl/2025/depth-charts.json` (EPA predictions)
- `netlify/functions/nfl-depthcharts-get/_data/nfl/depth-charts.json` (Depth chart API)
- `public/data/nfl-td/depth-charts.json` (TD system frontend)

## 📋 Weekly Workflow

### When Player Injuries/Changes Happen:
1. **Edit ONLY** `public/history/2025/week4/depth-charts.json` (master file)
2. **Run sync**: `node scripts/sync-depth-charts.js 4`
3. **Verify systems**: All prediction engines now use updated data

### When New Week Starts:
1. **Copy previous week**: `cp public/history/2025/week4/depth-charts.json public/history/2025/week5/depth-charts.json`
2. **Update new file** with any changes for the new week
3. **Run sync**: `node scripts/sync-depth-charts.js 5`

## 🎯 Elite System Architecture

```
MASTER SOURCE (Manual Edits)
    ↓
public/history/2025/weekN/depth-charts.json
    ↓
[SYNC SCRIPT]
    ↓
├── netlify/functions/_data/nfl/2025/depth-charts.json
├── netlify/functions/nfl-depthcharts-get/_data/nfl/depth-charts.json  
└── public/data/nfl-td/depth-charts.json
    ↓
[ELITE PREDICTION SYSTEMS]
├── EPA Game Predictions (with injury baseline correction)
├── TD Predictions (with QB injury cascades)
└── Depth Chart APIs
```

## 🚨 CRITICAL RULES

1. **NEVER** edit target files directly - only edit the master file
2. **ALWAYS** run sync script after making changes
3. **VALIDATE** that sync completed successfully before pushing predictions
4. **BACKUP** master files before major changes

## 🔍 Troubleshooting

### If Predictions Look Wrong:
```bash
# Check if sync is needed
node scripts/sync-depth-charts.js 4

# Verify master file has your changes
cat public/history/2025/week4/depth-charts.json | grep "Trey Benson"
```

### If Sync Fails:
- Check file permissions
- Ensure target directories exist
- Verify master file is valid JSON

## 📈 Model Confidence

**This system is SAFER than manual management because:**
- Single source of truth prevents inconsistencies
- Automated sync prevents human copy/paste errors  
- JSON validation catches formatting mistakes
- Clear audit trail of all changes