# FF-SitStart Quick Reference Card

## 🚀 Setup (First Time Only)
```bash
cd ff-sitstart
npm install
cp .env.example .env
# Edit .env with your API keys:
# - Get Yahoo keys: https://developer.yahoo.com/apps/
# - Get Odds key: https://the-odds-api.com/ (free tier)
```

## 🔐 Authenticate (Once)
```bash
npm run auth
# Browser opens → Approve Yahoo → Done!
# Tokens saved to .secrets/yahoo.json (auto-refreshes)
```

## 📊 Run Analysis
```bash
# Current week, all your leagues
npm run run

# Specific week
npm run run -- --week 10

# Filter by league name
npm run run -- --league "My League"

# Export to JSON + CSV
npm run run -- --json --csv --out ./out

# Full explanations (shows all reasons)
npm run run -- --explain all
```

## 🧪 Test It
```bash
npm test
# Or run individual tests:
node tests/test_implied_totals.mjs
node tests/test_odds_math.mjs
node tests/test_props_to_efp.mjs
```

## 📁 Output Files
```
out/
└── sitstart_week10_my_league_my_team.json  # Full data
└── sitstart_week10_my_league_my_team.csv   # 15 columns
```

## 🎨 Tier Legend
- **S** (green) = Elite (z ≥ 1.2)
- **A** (cyan) = Strong (z ≥ 0.6)
- **B** (white) = Average (z ≥ -0.2)
- **C** (yellow) = Below Avg (z ≥ -0.8)
- **D** (red) = Weak (z < -0.8)
- **BYE/OUT** (gray) = Not playing

## 🔧 Configuration (.env)
```bash
# Yahoo Fantasy OAuth
YAHOO_CLIENT_ID=your_client_id
YAHOO_CLIENT_SECRET=your_client_secret

# TheOddsAPI
ODDS_API_KEY=your_api_key

# Optional Tweaks
WEIGHT_SCRIPT=0.35          # Script lean weight (default)
WEIGHT_IMPLIED_TOTAL=0.25   # IT weight (default)
WEIGHT_INJURY=0.20          # Injury penalty weight (default)
CACHE_TTL_SECONDS=3600      # 1 hour cache (default)
```

## 🐛 Troubleshooting

### "Not authenticated"
```bash
npm run auth
```

### "No leagues found"
- Check Yahoo credentials in `.env`
- Verify you're in at least one Yahoo Fantasy Football league

### "Rate limit exceeded"
- TheOddsAPI free tier = 500 requests/month (~16/day)
- Wait 1 hour (cache will clear)
- Or upgrade to paid plan

### "Props missing for player X"
- Normal! Not all players have props (backups, TEs)
- Tool uses fallback logic (team IT + context)
- Check JSON output `notes` array for details

## 📊 What You'll See

```
🏈 My League - Week 10
   Team: Brent's Team

Scoring: Half-PPR (0.5), passTD=4, INT=-2

Props found: 12/15 (80%)

STARTERS
┌──────┬────────────────────┬─────┬──────┬─────┬──────┬───────┬──────┐
│ Rank │ Player             │ Pos │ Slot │ Opp │ EFP  │ Score │ Tier │
├──────┼────────────────────┼─────┼──────┼─────┼──────┼───────┼──────┤
│ 1    │ Patrick Mahomes    │ QB  │ QB   │ DEN │ 24.3 │ 25.1  │ S    │
│ 2    │ Christian McCaffrey│ RB  │ RB   │ TB  │ 18.6 │ 19.8  │ S    │
...

💡 FLEX OPTIONS (Top Bench Players)
[Shows top bench RB/WR/TE who could start]

🔄 SUGGESTED SWAPS
  • Bench Jakobi Meyers for Tyler Allgeier (+2.3 pts)

✅ Analysis complete!
```

## 📚 Documentation
- **README.md** - Full guide (6,000+ words)
- **QUICKSTART.md** - 5-minute setup
- **COMPLETE_IMPLEMENTATION_SUMMARY.md** - Executive summary
- **SECURITY_FIX_LOG.md** - API key rotation guide

## ⚠️ Important Notes

1. **API Key Security**: Never commit API keys to Git
2. **Rate Limits**: Free tier = 500 TheOddsAPI requests/month
3. **Cache**: 1-hour TTL (saves API calls)
4. **Props Coverage**: ~70-80% of players have props (fallback logic for rest)
5. **Live Testing**: Built with real APIs, ready for your Yahoo league!

## 🎯 Quick Win
```bash
# 1. Setup (5 min)
npm install && cp .env.example .env
# Edit .env with your keys

# 2. Auth (1 min)
npm run auth

# 3. Run! (30 sec)
npm run run

# That's it! 🎉
```

---

**Need help?** Check README.md or QUICKSTART.md
