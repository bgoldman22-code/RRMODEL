# NHL V2 Calibrated Policy - Deployment Status

**Deployed:** October 24, 2025  
**Git Commit:** db16dd8  
**Branch:** main42  
**Status:** ✅ LIVE (pending Netlify build)

---

## 🚀 Deployment Summary

### What Was Deployed
1. **Backend Function:** `netlify/functions/nhl-sog-calibrated-v2.mjs` (677 lines)
   - Isotonic regression calibration
   - Policy filters (consensus ban, small-edge/high-TOI Unders)
   - Half-Kelly sizing
   - Multi-book odds aggregation

2. **Frontend Component:** `src/NHLV2.jsx` (426 lines)
   - Professional calibrated UI
   - Policy filter display
   - Portfolio summary
   - Historical validation badges

3. **Routing:** Updated `src/App.jsx`
   - Added `/nhl-sog-v2` route
   - Added "SOG Props V2 (Calibrated Policy) 📊" to NHL dropdown

---

## 🌐 Access URLs

### Production URLs
- **V2 Calibrated:** `https://bgroundrobin.com/nhl-sog-v2` ← **NEW**
- **V1 Elite:** `https://bgroundrobin.com/nhl-sog` ← Existing

### Netlify Function Endpoints
- **V2:** `/.netlify/functions/nhl-sog-calibrated-v2`
- **V1:** `/.netlify/functions/nhl-sog-scanner-elite-fast`

---

## 📊 Expected Performance (Based on Historical Backtest)

### Validated Metrics
- **ROI (Flat):** +29.55%
- **ROI (Kelly):** +32.19%
- **Win Rate:** 54.9% (73W-60L)
- **Sample Size:** 133 bets from 8,598 candidates
- **Hit Rate:** 1.55% (very selective)

### Projected Volume
- **Light night (2-4 games):** 1-2 bets
- **Average night (8-10 games):** 3-5 bets
- **Busy night (12+ games):** 5-7 bets
- **Weekly average:** ~25 bets
- **Full season:** ~500-700 bets

### Projected Profit (Flat Betting)
- **Per bet average:** +0.30 units
- **Weekly (25 bets):** +7.4 units
- **Monthly (100 bets):** +29.6 units
- **Season (600 bets):** +177 units

---

## ✅ Next Steps

### 1. Verify Netlify Build
Check Netlify dashboard for successful deployment:
- Build should complete in ~3-5 minutes
- Look for green checkmark on latest commit (db16dd8)

### 2. Test Production Function
Once deployed, test the function:
```bash
curl https://bgroundrobin.com/.netlify/functions/nhl-sog-calibrated-v2?bankroll=5000
```

Expected response:
- JSON with `opportunities` array
- `metadata` object with validation stats
- Should return 0 opportunities if no NHL games today

### 3. Test Frontend
Navigate to: `https://bgroundrobin.com/nhl-sog-v2`

Verify:
- Page loads without errors
- UI renders correctly
- Calibrated probabilities display
- Policy filters show in table
- Portfolio summary appears at bottom

### 4. Wait for Live NHL Games
First real test will be on next NHL game day:
- Monitor first 10-20 bets closely
- Compare live performance vs backtest
- Track win rate and ROI convergence

---

## 🔍 Monitoring Checklist

### Daily (First Week)
- [ ] Check function execution time (< 10s)
- [ ] Verify bet count matches projection (3-5/night)
- [ ] Monitor Odds API credit usage
- [ ] Track live win rate

### Weekly (First Month)
- [ ] Compare live ROI vs backtest (+29.55% target)
- [ ] Analyze calibration accuracy (Kelly > Flat = good)
- [ ] Review any edge cases or errors
- [ ] Adjust filters if needed (only after 50+ bets)

### Monthly
- [ ] Full performance review vs backtest
- [ ] Consider enhancements (segmented calibration, opponent features)
- [ ] Evaluate Overs expansion (if desired)

---

## 🚨 Troubleshooting

### If No Bets Showing (on NHL game day)
1. Check Odds API key is set: `THEODDS_API_KEY`
2. Verify function logs in Netlify dashboard
3. Confirm NHL games are scheduled today
4. Check if all bets fail consensus ban (line dispersion = 0)

### If Function Times Out
1. Reduce player processing (currently 18 players/team)
2. Cache odds data with short TTL
3. Parallelize roster fetches (already done)

### If Win Rate Deviates Significantly
- **Below 50% after 20+ bets:** Review calibration curves, may need adjustment
- **Above 60% after 20+ bets:** Variance or market inefficiency, continue monitoring
- **Wait for 50+ bets before making major changes**

---

## 📁 Key Files Reference

### Backend
- `netlify/functions/nhl-sog-calibrated-v2.mjs` — Main prediction engine
- `netlify/functions/_lib/nhl-elite-projection-v3.mjs` — ZINB projection logic (shared with V1)

### Frontend
- `src/NHLV2.jsx` — React component
- `src/App.jsx` — Routing configuration

### Documentation
- `NHL_V2_CALIBRATED_POLICY_DEPLOYMENT.md` — Full deployment guide
- `data/nhl/BACKTEST_AUDIT_REPORT.md` — Logic verification
- `data/nhl/FULL_HISTORICAL_BACKTEST_REPORT.md` — Performance analysis

### Data
- `data/nhl/policy_backtest_report_combined.json` — Backtest results
- `data/nhl/policy_selected_bets_combined.csv` — 133 historical bets
- `data/nhl/top_segments_combined.csv` — Profitable segments

---

## 🎯 Success Criteria (First 50 Bets)

### ✅ System is Working If:
- Win rate: 50-60%
- ROI: 15-40% (backtest: 29.55%)
- Kelly > Flat by 2-5 pp
- Bet volume: 3-5 per typical night
- No function errors or timeouts

### ⚠️ Needs Review If:
- Win rate: < 45% or > 65%
- ROI: < 10% or > 50%
- Kelly < Flat (calibration issue)
- Bet volume: < 1 or > 10 per night

### 🚫 Red Flags (Stop and Diagnose):
- Win rate: < 40%
- ROI: Negative after 30+ bets
- Function crashes consistently
- No bets on nights with 10+ games

---

## 📞 Support Resources

### If Issues Arise
1. Check Netlify function logs first
2. Review backtest reports for expected behavior
3. Compare V2 vs V1 output on same games
4. Test with sample data from backtest

### Documentation Chain
```
User Question
    ↓
NHL_V2_DEPLOYMENT_STATUS.md (this file)
    ↓
NHL_V2_CALIBRATED_POLICY_DEPLOYMENT.md (detailed guide)
    ↓
FULL_HISTORICAL_BACKTEST_REPORT.md (performance proof)
    ↓
BACKTEST_AUDIT_REPORT.md (logic verification)
```

---

## 🎉 You're All Set!

The NHL V2 Calibrated Policy system is now deployed and will be live once Netlify finishes building.

**Next NHL game day, you'll see:**
- Highly selective picks (1.55% of all props)
- Calibrated win probabilities
- Kelly-optimized stakes
- Policy filter transparency
- Backtest-validated profitability

**Good luck! 🏒📊💰**

---

**Last Updated:** October 24, 2025  
**Deployment Engineer:** GitHub Copilot  
**Commit Hash:** db16dd8
