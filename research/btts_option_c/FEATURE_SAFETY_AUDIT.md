# Feature Safety Audit Report

**Generated:** 2025-12-11 10:22:24

---

## 📊 Summary Statistics

- **Total Features Audited:** 88
- **Prediction-Safe Features:** 40 (45.5%)
- **Unsafe Features:** 48 (54.5%)
- **Event-Based Columns:** 33
- **Banned Result Features:** 4

---

## 🚨 BANNED FEATURES (Actual Match Results)

These features contain actual match outcomes and MUST NEVER be used for prediction:

| Feature Name | Reason | Coverage % |
|--------------|--------|------------|
| `away_goals` | banned_actual_results | 100.0% |
| `away_goals_fpl` | banned_actual_results | 93.4% |
| `home_goals` | banned_actual_results | 100.0% |
| `home_goals_fpl` | banned_actual_results | 93.4% |

---

## ❌ Event-Based Features (Post-Match Statistics)

These features are derived from in-match events and are NOT available pre-match:

| Feature Name | Reason | Coverage % |
|--------------|--------|------------|
| `away_corners` | event_based_statistic | 100.0% |
| `away_fouls` | event_based_statistic | 100.0% |
| `away_gk_saves` | event_based_statistic | 99.8% |
| `away_red_cards` | event_based_statistic | 12.9% |
| `away_shots_blocked` | event_based_statistic | 100.0% |
| `away_shots_inside_box` | event_based_statistic | 100.0% |
| `away_shots_off_target` | event_based_statistic | 100.0% |
| `away_shots_on_target` | event_based_statistic | 100.0% |
| `away_shots_outside_box` | event_based_statistic | 100.0% |
| `away_shots_total` | event_based_statistic | 100.0% |
| `away_yellow_cards` | event_based_statistic | 96.4% |
| `chaos_index` | event_based_statistic | 100.0% |
| `danger_index` | event_based_statistic | 100.0% |
| `diff_xg` | event_based_statistic | 100.0% |
| `home_corners` | event_based_statistic | 100.0% |
| `home_fouls` | event_based_statistic | 100.0% |
| `home_gk_saves` | event_based_statistic | 99.8% |
| `home_red_cards` | event_based_statistic | 12.9% |
| `home_shots_blocked` | event_based_statistic | 100.0% |
| `home_shots_inside_box` | event_based_statistic | 100.0% |
| `home_shots_off_target` | event_based_statistic | 100.0% |
| `home_shots_on_target` | event_based_statistic | 100.0% |
| `home_shots_outside_box` | event_based_statistic | 100.0% |
| `home_shots_total` | event_based_statistic | 100.0% |
| `home_yellow_cards` | event_based_statistic | 96.4% |
| `shot_quality_away` | event_based_statistic | 100.0% |
| `shot_quality_home` | event_based_statistic | 100.0% |
| `sum_xg` | event_based_statistic | 100.0% |
| `xg_dominance` | event_based_statistic | 100.0% |

---

## ✅ Prediction-Safe Features

These features use only pre-match information and properly shifted rolling windows:


### Form Trend Indicator (6 features)

| Feature Name | Coverage % |
|--------------|------------|
| `away_btts_momentum` | 97.2% |
| `away_xg_trend` | 97.2% |
| `away_xga_trend` | 97.2% |
| `home_btts_momentum` | 97.2% |
| `home_xg_trend` | 97.2% |
| `home_xga_trend` | 97.2% |

### Fpl Availability Pre Match (2 features)

| Feature Name | Coverage % |
|--------------|------------|
| `away_availability_pct` | 93.4% |
| `home_availability_pct` | 93.4% |

### Fpl Squad Quality Pre Match (8 features)

| Feature Name | Coverage % |
|--------------|------------|
| `attack_strength_diff` | 93.4% |
| `away_attack_quality_pct` | 93.4% |
| `away_available_attack_quality` | 93.4% |
| `away_missing_attack_quality` | 93.4% |
| `home_attack_quality_pct` | 93.4% |
| `home_available_attack_quality` | 93.4% |
| `home_missing_attack_quality` | 93.4% |
| `min_attack_quality` | 93.4% |

### Prediction Safe Default (12 features)

| Feature Name | Coverage % |
|--------------|------------|
| `away_btts_rate_L10` | 97.2% |
| `away_btts_rate_L5` | 97.2% |
| `away_xg_L10` | 97.2% |
| `away_xg_L5` | 97.2% |
| `away_xga_L10` | 97.2% |
| `away_xga_L5` | 97.2% |
| `home_btts_rate_L10` | 97.2% |
| `home_btts_rate_L5` | 97.2% |
| `home_xg_L10` | 97.2% |
| `home_xg_L5` | 97.2% |
| `home_xga_L10` | 97.2% |
| `home_xga_L5` | 97.2% |

### Prediction Safe Pattern (12 features)

| Feature Name | Coverage % |
|--------------|------------|
| `away_available_count` | 93.4% |
| `away_avg_chance_of_playing` | 93.4% |
| `away_doubtful_count` | 93.4% |
| `away_expected_minutes_pct` | 93.4% |
| `away_injured_count` | 93.4% |
| `away_squad_size` | 93.4% |
| `home_available_count` | 93.4% |
| `home_avg_chance_of_playing` | 93.4% |
| `home_doubtful_count` | 93.4% |
| `home_expected_minutes_pct` | 93.4% |
| `home_injured_count` | 93.4% |
| `home_squad_size` | 93.4% |

---

## 📋 Classification Rules

### Safe Patterns
- `_l5`
- `_l10`
- `_trend`
- `_momentum`
- `availability`
- `available_count`
- `available_attack_quality`
- `attack_quality`
- `expected_minutes`
- `avg_chance`
- `injured_count`
- `doubtful_count`
- `squad_size`
- `min_attack_quality`
- `missing_attack_quality`
- `attack_strength_diff`

### Unsafe Patterns
- `goals_fpl`
- `home_goals`
- `away_goals`
- `btts_yes_odds`
- `btts_no_odds`
- `sum_xg`
- `diff_xg`
- `shot_quality`
- `shots`
- `passes`
- `corners`
- `saves`
- `fouls`
- `cards`
- `danger_index`
- `chaos_index`
- `possession`
- `referee`
- `venue`

---

## 🔒 Validation Checks

- ✅ All rolling features use `.shift(1)` (verified in code review)
- ✅ No full-time statistics used as features
- ✅ FPL availability/squad quality computed pre-match
- ✅ Runtime guards enforce banned feature exclusion

---

**Report Version:** 1.0
**Last Updated:** 2025-12-11 10:22:24
