# Statcast Data - Git LFS Setup

## Overview
We use **3 years of Statcast pitch data** (2023-2025) for advanced MLB HR prediction features:
- Pitch-type matchup analysis ("Judge crushes elevated fastballs")
- Launch angle optimization
- Exit velocity trends
- Batted ball profiles

**Size**: ~1.8GB (600MB per year)

---

## Why Git LFS?
GitHub has a 100MB file limit. Git LFS stores large files as pointers in your repo, actual files on GitHub's servers.

**Free tier**: 1GB storage + 1GB bandwidth/month (enough for occasional downloads)

---

## Setup Instructions

### 1. Install Git LFS

**macOS (Homebrew):**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git-lfs
```

**macOS (Manual):**
```bash
# Download from https://git-lfs.github.com/
# Or use official installer
```

**Linux:**
```bash
sudo apt-get install git-lfs  # Debian/Ubuntu
sudo yum install git-lfs       # CentOS/RHEL
```

**Windows:**
Download from https://git-lfs.github.com/

---

### 2. Initialize LFS in Repo

```bash
cd /Users/brentgoldman/RRMODEL

# Initialize Git LFS
git lfs install

# Track Statcast files
git lfs track "data/mlb_historical/statcast/*.json"

# Add .gitattributes (created by lfs track)
git add .gitattributes

# Commit the tracking config
git commit -m "Add Git LFS tracking for Statcast data"
```

---

### 3. Add Statcast Files

```bash
# Stage the files (LFS will handle them)
git add data/mlb_historical/statcast/

# Commit
git commit -m "Add 2023-2025 Statcast pitch data via LFS"

# Push (this will upload to LFS server)
git push origin main42
```

**Note**: First push will take ~10-15 minutes (uploading 1.8GB)

---

### 4. Daily Updates (During Season)

When new Statcast data is added each day:

```bash
# LFS automatically handles the file
git add data/mlb_historical/statcast/2025_pitches.json
git commit -m "Update 2025 Statcast data - $(date +%Y-%m-%d)"
git push origin main42
```

LFS will only upload the **changed portions** (delta), not the full 600MB each time!

---

## Verification

After setup, check LFS is working:

```bash
# See which files are tracked
git lfs ls-files

# Should show:
# 2023_pitches.json
# 2024_pitches.json
# 2025_pitches.json
```

---

## Team Members Cloning

When others clone the repo:

```bash
git clone https://github.com/bgoldman22-code/RRMODEL.git
cd RRMODEL

# Files download automatically via LFS
# No extra steps needed!
```

---

## Storage Limits

**Free tier:**
- 1GB storage (we're using ~1.8GB, so we'll need paid tier)
- 1GB bandwidth/month

**Data Packs** (if needed):
- $5/mo for 50GB storage + 50GB bandwidth
- More than enough for this project

---

## Alternative: Keep Local Only

If you don't want to pay for LFS, add to `.gitignore`:

```bash
echo "data/mlb_historical/statcast/*.json" >> .gitignore
git add .gitignore
git commit -m "Keep Statcast data local only"
```

**Pros**: Free, simple
**Cons**: Team members need to download separately

---

## Current Status

✅ **Files Ready**: 2023-2025 Statcast data (1.8GB)
⏳ **LFS Setup**: Waiting for Git LFS installation
📦 **Data Updates**: Will add new pitches daily during season

---

## When to Use Statcast Data

**Live Pipeline (production)**: Uses aggregated stats, doesn't need Statcast
**Advanced Features (future)**: Uses Statcast for deep analysis

This keeps your production pipeline fast while enabling future research!
