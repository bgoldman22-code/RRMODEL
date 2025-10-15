# NHL Auto-Logging - Setup & Test Guide

## ✅ ZERO SETUP REQUIRED!

The logger script is ready to use immediately. But let's verify everything works.

---

## 🧪 Quick Test (30 Seconds)

### **Step 1: Find Your Netlify URL**

Your site is deployed on Netlify. The URL is probably one of these:
- `https://rrmodel.netlify.app` (if you have a custom domain)
- `https://your-site-name.netlify.app` (Netlify subdomain)
- `https://random-name-12345.netlify.app` (auto-generated)

**To find it:**
1. Go to https://app.netlify.com
2. Click on your site
3. Copy the URL at the top (e.g., `https://rrmodel.netlify.app`)

---

### **Step 2: Test the Scanner Endpoint**

Replace `YOUR_SITE_URL` with your actual Netlify URL:

```bash
curl -s https://YOUR_SITE_URL/.netlify/functions/nhl-sog-scanner-v3-optimized
```

**Expected output:**
```json
{
  "opportunities": [
    {
      "playerId": 8478402,
      "playerName": "Connor McDavid",
      "team": "EDM",
      "opponent": "CGY",
      ...
    }
  ],
  "metadata": {
    "version": "3.1-fast-odds",
    ...
  }
}
```

**If you get an error:**
- ❌ `404` → Wrong URL or function name
- ❌ `502` → Function error (already fixed, should work now)
- ❌ `timeout` → Function taking too long (should be < 5 seconds)

---

### **Step 3: Log the Picks**

Once Step 2 works, pipe it to the logger:

```bash
curl -s https://YOUR_SITE_URL/.netlify/functions/nhl-sog-scanner-v3-optimized | \
  node scripts/nhl/manual-log-from-scanner.mjs
```

**Expected output:**
```
🏒 NHL Scanner → CSV Logger

📊 Found X opportunities

✅ Logged X NHL predictions
✅ Successfully logged to CSV
   File: data/nhl/logs/predictions_2024-25.csv

📋 Sample logged prediction:
   Connor McDavid OVER 3.5
   Edge: 12.5%, Odds: -110
   Book: FanDuel
```

---

### **Step 4: Verify the CSV**

```bash
cat data/nhl/logs/predictions_2024-25.csv
```

**Expected output:**
```csv
date,game_id,player,team,opponent,position,line,direction,predicted_sog,...
2024-10-15,EDM_CGY_2024-10-15,Connor McDavid,EDM,CGY,C,3.5,OVER,4.2,...
```

---

## 🔧 Optional: Save Your URL as Environment Variable

To avoid typing the URL every time:

```bash
# Add to your ~/.zshrc or ~/.bashrc
echo 'export NHL_SCANNER_URL="https://YOUR_SITE_URL/.netlify/functions/nhl-sog-scanner-v3-optimized"' >> ~/.zshrc

# Reload shell
source ~/.zshrc

# Now you can use:
curl -s $NHL_SCANNER_URL | node scripts/nhl/manual-log-from-scanner.mjs
```

---

## 🚀 Daily Workflow (After Setup)

**Every day (or whenever you want picks):**

```bash
# One command logs everything
curl -s $NHL_SCANNER_URL | node scripts/nhl/manual-log-from-scanner.mjs
```

**Next morning (update results):**

```bash
# Uses yesterday's date automatically
node scripts/nhl/update-results.mjs
```

**Anytime (view dashboard):**

```bash
node scripts/nhl/monitor-dashboard.mjs
```

---

## 🤖 Automate in GitHub Actions (Recommended)

Once you know your Netlify URL, add it to GitHub Secrets:

1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `NHL_SCANNER_URL`
4. Value: `https://YOUR_SITE_URL/.netlify/functions/nhl-sog-scanner-v3-optimized`

Then update `.github/workflows/nhl-daily-update.yml`:

```yaml
name: NHL Daily Logger

on:
  schedule:
    # Run daily at 9am ET (1pm UTC)
    - cron: '0 13 * * *'
  workflow_dispatch:

jobs:
  log-picks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Log NHL picks
        run: |
          curl -s ${{ secrets.NHL_SCANNER_URL }} | \
            node scripts/nhl/manual-log-from-scanner.mjs
      
      - name: Commit logs
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add data/nhl/logs/*.csv
          git commit -m "📊 Log NHL picks [skip ci]" || true
          git push || true
```

Now it logs picks automatically every day at 9am ET!

---

## ❓ FAQ

**Q: Do I need to install anything?**  
A: No! Node.js is already installed. The script uses built-in modules only.

**Q: What if I don't know my Netlify URL?**  
A: Check your browser's network tab when viewing the NHL page. Look for the scanner endpoint call.

**Q: Can I test without logging?**  
A: Yes! Just run: `curl -s https://YOUR_URL/... | jq .` (shows JSON without logging)

**Q: What if there are no games today?**  
A: Script will say "Found 0 opportunities" and exit cleanly. No CSV changes.

**Q: Does this work during preseason?**  
A: Yes! Scanner works year-round. Logger captures everything.

---

## 📋 Quick Reference

### **Commands You'll Use:**

```bash
# 1. Log picks (run whenever you want)
curl -s $NHL_SCANNER_URL | node scripts/nhl/manual-log-from-scanner.mjs

# 2. Update results (run next day)
node scripts/nhl/update-results.mjs

# 3. View dashboard
node scripts/nhl/monitor-dashboard.mjs

# 4. Check what's logged
tail -10 data/nhl/logs/predictions_2024-25.csv
```

---

## ✅ Summary

**Setup Required:**
1. ✅ Find your Netlify URL (one time, 30 seconds)
2. ✅ Test the scanner endpoint (verify it works)
3. ✅ (Optional) Save URL as environment variable

**That's it!** Then just run one command to log picks whenever you want.

**Total setup time: 2 minutes max.**

**After that: Zero setup. One command. Done.** 🚀
