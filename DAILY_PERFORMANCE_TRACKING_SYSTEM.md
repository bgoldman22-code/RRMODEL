# 📊 Daily Performance Tracking System

**Purpose:** Store and grade model performance daily for continuous improvement and CLV validation  
**Triggers:** Automated daily (post-games), manual (on-demand)  
**Storage:** SQLite database + JSON snapshots for audit trail

---

## 🎯 What to Track Daily

### **1. PREDICTION PERFORMANCE**
```javascript
{
  "date": "2025-09-25",
  "model_version": "v4.2_ensemble",
  "predictions": [
    {
      "player_id": 592450,
      "player_name": "Aaron Judge",
      "game_id": "2025_09_25_BAL_NYY",
      
      // Pre-game prediction
      "snapshot_time": "2025-09-25T18:00:00Z",
      "model_probability": 0.285,
      "model_odds": 251,
      "confidence": 0.82,
      
      // Actual outcome
      "result": "HR",  // or "NO_HR"
      "outcome_binary": 1,
      
      // Prediction features (for debugging)
      "features": {
        "exit_velo_avg": 98.3,
        "barrel_rate": 0.185,
        "pitcher_hr_rate": 0.092,
        "park_factor": 1.15,
        "bvp_modifier": 1.08
      }
    }
  ],
  
  // Daily aggregate metrics
  "metrics": {
    "total_predictions": 45,
    "hrs_predicted": 13,
    "hrs_actual": 11,
    "accuracy": 0.844,  // Correct binary predictions
    "brier_score": 0.089,  // Calibration metric
    "log_loss": 0.312
  }
}
```

### **2. ODDS TRACKING (CLV)**
```javascript
{
  "date": "2025-09-25",
  "odds_snapshots": [
    {
      "player_id": 592450,
      "player_name": "Aaron Judge",
      
      // Snapshot odds (when model ran, 6pm ET)
      "snapshot_odds": {
        "fanduel": 280,
        "draftkings": 290,
        "betmgm": 275,
        "best_available": 290,
        "timestamp": "2025-09-25T18:00:00Z"
      },
      
      // Closing odds (5 min before game)
      "closing_odds": {
        "fanduel": 250,
        "draftkings": 260,
        "betmgm": 245,
        "best_available": 260,
        "timestamp": "2025-09-25T19:05:00Z"
      },
      
      // CLV calculation
      "clv": {
        "snapshot_to_closing": 30,  // +280 → +250 = 30 bps of value
        "model_edge_vs_snapshot": 15,  // Model said 285, snapshot was 280
        "model_edge_vs_closing": 45,  // Model said 285, closing was 250
        "beat_closing_line": true
      },
      
      // If bet was placed
      "execution": {
        "placed": true,
        "book": "fanduel",
        "odds_received": 280,
        "stake": 1.5,  // units
        "timestamp": "2025-09-25T18:15:00Z"
      },
      
      // Outcome
      "result": "HR",
      "payout": 420,  // $150 stake * 2.8 odds
      "profit": 270
    }
  ],
  
  // Daily CLV summary
  "clv_metrics": {
    "avg_clv": 22.5,  // Average CLV across all bets
    "positive_clv_rate": 0.72,  // 72% of bets beat closing line
    "total_clv_value": 450,  // Sum of CLV in basis points
    "clv_correlation_with_edge": 0.68  // Higher model edge = higher CLV
  }
}
```

### **3. PORTFOLIO PERFORMANCE (RR SLIPS)**
```javascript
{
  "date": "2025-09-25",
  "rr_slips": [
    {
      "slip_id": "rr_20250925_001",
      "format": "12x3",
      "pool": [
        { "player": "Judge", "odds": 280, "result": "HR" },
        { "player": "Ohtani", "odds": 320, "result": "HR" },
        { "player": "Alvarez", "odds": 290, "result": "NO_HR" },
        // ... 9 more
      ],
      
      // Combo outcomes
      "combos": [
        {
          "combo_id": "Judge+Ohtani+Acuna",
          "odds": 2850,
          "result": "WIN",
          "payout": 285
        },
        // ... 219 more combos
      ],
      
      // Slip results
      "total_stake": 220,  // $1 per combo
      "total_payout": 342,
      "profit": 122,
      "roi": 0.555,
      
      // Hit rate
      "combos_total": 220,
      "combos_won": 18,
      "hit_rate": 0.082,
      
      // Model performance
      "model_ev": 145,  // Expected profit was $145
      "actual_vs_expected": -23,  // Underperformed by $23
      "variance": 0.89  // Within 1 SD
    }
  ],
  
  // Daily portfolio summary
  "portfolio_metrics": {
    "total_slips": 3,
    "total_stake": 660,
    "total_payout": 847,
    "total_profit": 187,
    "roi": 0.283,
    "sharpe_ratio": 0.42,
    "max_drawdown": -110
  }
}
```

### **4. MODEL CALIBRATION**
```javascript
{
  "date": "2025-09-25",
  "calibration_bins": [
    {
      "predicted_prob_range": "0.00-0.10",
      "avg_predicted": 0.05,
      "avg_actual": 0.048,
      "count": 120,
      "calibration_error": -0.002  // Slightly overconfident
    },
    {
      "predicted_prob_range": "0.10-0.20",
      "avg_predicted": 0.15,
      "avg_actual": 0.142,
      "count": 85,
      "calibration_error": -0.008
    },
    // ... more bins
  ],
  
  "overall_calibration": {
    "mean_calibration_error": -0.012,  // Slight overconfidence
    "max_calibration_error": 0.031,
    "well_calibrated": true  // Within acceptable bounds
  }
}
```

---

## 🗄️ Database Schema

### **SQLite Tables**

```sql
-- Daily predictions
CREATE TABLE predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  model_version TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  
  -- Prediction
  snapshot_time TIMESTAMP NOT NULL,
  model_probability REAL NOT NULL,
  model_odds INTEGER NOT NULL,
  confidence REAL,
  
  -- Outcome
  result TEXT,  -- 'HR' or 'NO_HR'
  outcome_binary INTEGER,  -- 1 or 0
  
  -- Features (JSON blob)
  features TEXT,
  
  -- Indexes
  INDEX idx_date (date),
  INDEX idx_player (player_id, date),
  INDEX idx_model_version (model_version)
);

-- Odds tracking
CREATE TABLE odds_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  
  -- Snapshot odds
  snapshot_best REAL,
  snapshot_time TIMESTAMP,
  
  -- Closing odds
  closing_best REAL,
  closing_time TIMESTAMP,
  
  -- CLV
  clv_bps INTEGER,  -- Basis points
  beat_closing_line BOOLEAN,
  
  -- Execution (if bet placed)
  executed BOOLEAN,
  execution_book TEXT,
  execution_odds REAL,
  execution_stake REAL,
  execution_time TIMESTAMP,
  
  -- Outcome
  result TEXT,
  payout REAL,
  profit REAL,
  
  INDEX idx_date (date),
  INDEX idx_player (player_id, date),
  INDEX idx_executed (executed)
);

-- Daily metrics
CREATE TABLE daily_metrics (
  date DATE PRIMARY KEY,
  model_version TEXT NOT NULL,
  
  -- Prediction metrics
  total_predictions INTEGER,
  hrs_predicted INTEGER,
  hrs_actual INTEGER,
  accuracy REAL,
  brier_score REAL,
  log_loss REAL,
  
  -- CLV metrics
  avg_clv REAL,
  positive_clv_rate REAL,
  total_clv_value REAL,
  
  -- Portfolio metrics
  total_slips INTEGER,
  total_stake REAL,
  total_payout REAL,
  total_profit REAL,
  roi REAL,
  sharpe_ratio REAL,
  
  -- Calibration
  mean_calibration_error REAL,
  well_calibrated BOOLEAN
);

-- RR slip tracking
CREATE TABLE rr_slips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id TEXT UNIQUE NOT NULL,
  date DATE NOT NULL,
  format TEXT NOT NULL,  -- '12x3', '15x4', etc
  
  -- Pool (JSON array)
  pool TEXT,
  
  -- Results
  total_stake REAL,
  total_payout REAL,
  profit REAL,
  roi REAL,
  
  combos_total INTEGER,
  combos_won INTEGER,
  hit_rate REAL,
  
  model_ev REAL,
  actual_vs_expected REAL,
  
  INDEX idx_date (date),
  INDEX idx_format (format)
);
```

---

## 🤖 Automated Daily Grading Script

### **`scripts/grade_daily_performance.mjs`**

```javascript
#!/usr/bin/env node

/**
 * Daily Performance Grading Script
 * 
 * Runs automatically after games complete (11pm ET)
 * Grades predictions, calculates CLV, updates database
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = './data/performance_tracking.db';
const SNAPSHOTS_DIR = './data/performance_snapshots';

class DailyGrader {
  constructor() {
    this.db = new Database(DB_PATH);
    this.initializeDatabase();
  }

  initializeDatabase() {
    // Create tables (schema from above)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS predictions (...);
      CREATE TABLE IF NOT EXISTS odds_tracking (...);
      CREATE TABLE IF NOT EXISTS daily_metrics (...);
      CREATE TABLE IF NOT EXISTS rr_slips (...);
    `);
  }

  async gradeDate(date) {
    console.log(`📊 Grading performance for ${date}...`);

    // 1. Load predictions snapshot (taken pre-game)
    const predictions = this.loadPredictionsSnapshot(date);

    // 2. Fetch actual results from MLB API
    const results = await this.fetchGameResults(date);

    // 3. Match predictions to outcomes
    const graded = this.matchPredictionsToResults(predictions, results);

    // 4. Calculate metrics
    const metrics = this.calculateDailyMetrics(graded);

    // 5. Grade CLV (if odds tracked)
    const clv = await this.gradeCLV(date);

    // 6. Grade portfolio (if slips placed)
    const portfolio = await this.gradePortfolio(date);

    // 7. Save to database
    this.saveToDatabase(date, graded, metrics, clv, portfolio);

    // 8. Generate daily report
    this.generateDailyReport(date, metrics, clv, portfolio);

    console.log(`✅ Grading complete for ${date}`);
    return { metrics, clv, portfolio };
  }

  calculateDailyMetrics(graded) {
    const total = graded.length;
    const hrsActual = graded.filter(p => p.result === 'HR').length;
    const correct = graded.filter(p => {
      const predicted = p.model_probability > 0.5 ? 'HR' : 'NO_HR';
      return predicted === p.result;
    }).length;

    const accuracy = correct / total;

    // Brier score (calibration metric)
    const brierScore = graded.reduce((sum, p) => {
      const predicted = p.model_probability;
      const actual = p.result === 'HR' ? 1 : 0;
      return sum + Math.pow(predicted - actual, 2);
    }, 0) / total;

    // Log loss
    const logLoss = graded.reduce((sum, p) => {
      const predicted = p.model_probability;
      const actual = p.result === 'HR' ? 1 : 0;
      const epsilon = 1e-15; // Prevent log(0)
      const clipped = Math.max(epsilon, Math.min(1 - epsilon, predicted));
      return sum - (actual * Math.log(clipped) + (1 - actual) * Math.log(1 - clipped));
    }, 0) / total;

    return {
      total_predictions: total,
      hrs_actual: hrsActual,
      accuracy,
      brier_score: brierScore,
      log_loss: logLoss
    };
  }

  async gradeCLV(date) {
    // Load snapshot odds (6pm ET)
    const snapshots = this.loadOddsSnapshots(date, 'snapshot');
    
    // Load closing odds (5 min before games)
    const closing = this.loadOddsSnapshots(date, 'closing');

    const clvResults = snapshots.map(snap => {
      const close = closing.find(c => c.player_id === snap.player_id);
      if (!close) return null;

      // Calculate CLV (positive = we got better odds than closing)
      const clv = snap.best_odds - close.best_odds;
      const beatClosingLine = clv > 0;

      return {
        player_id: snap.player_id,
        player_name: snap.player_name,
        snapshot_odds: snap.best_odds,
        closing_odds: close.best_odds,
        clv_bps: clv,
        beat_closing_line: beatClosingLine
      };
    }).filter(Boolean);

    const avgCLV = clvResults.reduce((sum, r) => sum + r.clv_bps, 0) / clvResults.length;
    const positiveCLVRate = clvResults.filter(r => r.beat_closing_line).length / clvResults.length;

    return {
      avg_clv: avgCLV,
      positive_clv_rate: positiveCLVRate,
      details: clvResults
    };
  }

  generateDailyReport(date, metrics, clv, portfolio) {
    const report = `
# Daily Performance Report - ${date}

## 📊 Prediction Performance
- **Total Predictions:** ${metrics.total_predictions}
- **Accuracy:** ${(metrics.accuracy * 100).toFixed(1)}%
- **Brier Score:** ${metrics.brier_score.toFixed(3)} (lower is better)
- **Log Loss:** ${metrics.log_loss.toFixed(3)} (lower is better)

## 💰 Closing Line Value (CLV)
- **Average CLV:** ${clv.avg_clv > 0 ? '+' : ''}${clv.avg_clv.toFixed(0)} bps
- **Positive CLV Rate:** ${(clv.positive_clv_rate * 100).toFixed(1)}%
- **Status:** ${clv.avg_clv > 0 ? '✅ Beating market' : '⚠️ Behind market'}

## 🎯 Portfolio Performance
- **ROI:** ${(portfolio.roi * 100).toFixed(1)}%
- **Profit:** $${portfolio.total_profit.toFixed(2)}
- **Sharpe Ratio:** ${portfolio.sharpe_ratio.toFixed(2)}

## 📈 Trend (7-day moving average)
- **Accuracy:** ${this.get7DayMA('accuracy', date).toFixed(1)}%
- **CLV:** ${this.get7DayMA('avg_clv', date).toFixed(0)} bps
- **ROI:** ${this.get7DayMA('roi', date).toFixed(1)}%

---
*Generated: ${new Date().toISOString()}*
    `.trim();

    // Save report
    const reportPath = path.join(SNAPSHOTS_DIR, date, 'daily_report.md');
    fs.writeFileSync(reportPath, report);

    console.log(`📄 Report saved: ${reportPath}`);
  }

  get7DayMA(metric, endDate) {
    const stmt = this.db.prepare(`
      SELECT AVG(${metric}) as ma
      FROM daily_metrics
      WHERE date <= ? AND date > date(?, '-7 days')
    `);
    
    const result = stmt.get(endDate, endDate);
    return result?.ma || 0;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  const grader = new DailyGrader();
  await grader.gradeDate(date);
}

export default DailyGrader;
```

---

## 📅 Automated Scheduling

### **Netlify Scheduled Function**

```javascript
// netlify/functions/daily-performance-grade.mjs

import DailyGrader from '../../scripts/grade_daily_performance.mjs';

export default async (req, context) => {
  // Runs at 11:30pm ET daily (after all games complete)
  // Netlify cron: "30 23 * * *" in netlify.toml

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split('T')[0];

    const grader = new DailyGrader();
    const results = await grader.gradeDate(date);

    return new Response(JSON.stringify({
      ok: true,
      date,
      metrics: results.metrics,
      clv: results.clv,
      portfolio: results.portfolio
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Daily grading failed:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), { status: 500 });
  }
};
```

### **netlify.toml schedule**
```toml
[[scheduled_functions]]
  path = "/.netlify/functions/daily-performance-grade"
  schedule = "30 23 * * *"  # 11:30pm ET daily
```

---

## 📊 Dashboard Views

### **7-Day Performance Dashboard**

```jsx
// src/pages/PerformanceDashboard.jsx

import React, { useEffect, useState } from 'react';
import { Line, Scatter } from 'recharts';

export default function PerformanceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/.netlify/functions/performance-stats?days=7')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold mb-6">Performance Dashboard</h1>

      {/* Daily Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard 
          title="7-Day Accuracy"
          value={`${(data.accuracy_7d * 100).toFixed(1)}%`}
          trend={data.accuracy_trend}
        />
        <MetricCard 
          title="Avg CLV"
          value={`${data.avg_clv > 0 ? '+' : ''}${data.avg_clv.toFixed(0)} bps`}
          trend={data.clv_trend}
        />
        <MetricCard 
          title="Portfolio ROI"
          value={`${(data.roi_7d * 100).toFixed(1)}%`}
          trend={data.roi_trend}
        />
        <MetricCard 
          title="Sharpe Ratio"
          value={data.sharpe_7d.toFixed(2)}
          trend={data.sharpe_trend}
        />
      </div>

      {/* Calibration Plot */}
      <div className="mb-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Model Calibration</h2>
        <CalibrationPlot data={data.calibration} />
      </div>

      {/* CLV Trend */}
      <div className="mb-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">CLV Trend (30 days)</h2>
        <CLVChart data={data.clv_history} />
      </div>

      {/* Daily ROI */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Daily ROI</h2>
        <ROIChart data={data.roi_history} />
      </div>
    </div>
  );
}
```

---

## ✅ Implementation Checklist

### **Phase 1: Core Infrastructure (1 day)**
- [ ] Create SQLite database schema
- [ ] Build `DailyGrader` class
- [ ] Add prediction snapshot system (save pre-game predictions)
- [ ] Add odds snapshot system (capture 6pm + closing lines)

### **Phase 2: Automation (1 day)**
- [ ] Create Netlify scheduled function
- [ ] Add error handling + retry logic
- [ ] Set up email/Slack notifications for daily reports
- [ ] Test on historical data (backfill Sept 2025)

### **Phase 3: Dashboard (2 days)**
- [ ] Build performance dashboard UI
- [ ] Add calibration plots
- [ ] Add CLV trend charts
- [ ] Add portfolio ROI visualization

### **Phase 4: Advanced (1 week)**
- [ ] Add model A/B testing (compare versions)
- [ ] Add feature importance tracking over time
- [ ] Add alert system (accuracy drops below X%)
- [ ] Add weekly/monthly summary emails

---

## 🎯 Key Benefits

1. **Track Model Drift** - Detect when accuracy degrades
2. **Validate CLV** - Prove you're beating closing lines
3. **Optimize Strategy** - See which formats/selections perform best
4. **Build Audit Trail** - Full history for every prediction/bet
5. **Continuous Improvement** - Data-driven iteration

---

## 📈 Example Daily Report

```markdown
# Daily Performance Report - 2025-09-25

## 📊 Prediction Performance
- **Total Predictions:** 45
- **Accuracy:** 84.4%
- **Brier Score:** 0.089 (excellent calibration)
- **Log Loss:** 0.312

## 💰 Closing Line Value (CLV)
- **Average CLV:** +22 bps
- **Positive CLV Rate:** 72.0%
- **Status:** ✅ Beating market

## 🎯 Portfolio Performance
- **ROI:** +28.3%
- **Profit:** $187.00
- **Sharpe Ratio:** 0.42

## 📈 Trend (7-day moving average)
- **Accuracy:** 81.2%
- **CLV:** +18 bps
- **ROI:** +15.7%

## 🚨 Alerts
- ⚠️ Brier score slightly elevated (0.089 vs 0.075 avg)
- ✅ CLV remains strong (+22 bps, 72% positive rate)

---
*Generated: 2025-09-26T03:30:15Z*
```

---

**This system gives you institutional-grade performance tracking with full transparency and accountability! 🚀**
