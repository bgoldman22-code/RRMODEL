import json

with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/data/nba/models/totals_v3_comparison_results.json') as f:
    data = json.load(f)

# We need the raw backtest results - reload from the model and recompute
# Actually, let's reload the full comparison which has the ROI breakdowns
# But we need per-bet data. Let's re-run the model on test data.

# Load the V3 model
with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/data/nba/models/totals_model_v3_multiwindow.json') as f:
    model = json.load(f)

import csv, os, glob, statistics
from collections import defaultdict

# We need to reconstruct the test data predictions
# Load all game data
all_games = []
for gf in ['games_2022_23.json', 'games_2023_24.json', 'games_2024_25.json', 'games_2025_26_extended.json']:
    try:
        with open(f'/Users/brentgoldman/Desktop/REPO33/RRMODEL/data/nba/games/{gf}') as fp:
            games = json.load(fp)
        valid = [g for g in games if g.get('homeStats', {}).get('fga', 0) > 0 and g.get('awayStats', {}).get('fga', 0) > 0]
        for g in valid:
            if not g.get('homeScore') and g.get('homeStats', {}).get('points'):
                g['homeScore'] = g['homeStats']['points']
            if not g.get('awayScore') and g.get('awayStats', {}).get('points'):
                g['awayScore'] = g['awayStats']['points']
            if not g.get('homeScore'):
                hs = g['homeStats']
                g['homeScore'] = (hs.get('fgm',0) - hs.get('fg3m',0)) * 2 + hs.get('fg3m',0) * 3 + hs.get('ftm',0)
            if not g.get('awayScore'):
                aws = g['awayStats']
                g['awayScore'] = (aws.get('fgm',0) - aws.get('fg3m',0)) * 2 + aws.get('fg3m',0) * 3 + aws.get('ftm',0)
        all_games.extend(valid)
    except:
        pass

all_games.sort(key=lambda g: g.get('date', ''))

def compute_per_game(stats, opp_stats, pts, opp_pts):
    fgm = stats.get('fgm', 0)
    fga = stats.get('fga', 1)
    fg3m = stats.get('fg3m', 0)
    fg3a = stats.get('fg3a', 0)
    ftm = stats.get('ftm', 0)
    fta = stats.get('fta', 0)
    oreb = stats.get('offRebounds', 0)
    dreb = stats.get('defRebounds', 0)
    tov = stats.get('turnovers', 0)
    opp_fga = opp_stats.get('fga', 1)
    opp_oreb = opp_stats.get('offRebounds', 0)
    opp_dreb = opp_stats.get('defRebounds', 0)
    opp_tov = opp_stats.get('turnovers', 0)
    opp_fta = opp_stats.get('fta', 0)
    poss = fga - oreb + tov + 0.44 * fta
    opp_poss = opp_fga - opp_oreb + opp_tov + 0.44 * opp_fta
    pace = poss
    offRtg = (pts / poss) * 100 if poss > 0 else 114.5
    defRtg = (opp_pts / opp_poss) * 100 if opp_poss > 0 else 114.5
    efg = (fgm + 0.5 * fg3m) / fga if fga > 0 else 0.535
    ts = pts / (2 * (fga + 0.44 * fta)) if (fga + 0.44 * fta) > 0 else 0.575
    tovPct = tov / poss if poss > 0 else 0.138
    orbPct = oreb / (oreb + opp_dreb) if (oreb + opp_dreb) > 0 else 0.25
    return {
        'pts': pts, 'oppPts': opp_pts, 'pace': pace, 'offRtg': offRtg, 'defRtg': defRtg,
        'netRtg': offRtg - defRtg, 'efg': efg, 'ts': ts, 'tovPct': tovPct, 'orbPct': orbPct,
        'fgPct': fgm/fga if fga > 0 else 0.47,
        'fg3Pct': fg3m/fg3a if fg3a > 0 else 0.36,
        'ftPct': ftm/fta if fta > 0 else 0.78,
        'rebounds': stats.get('rebounds', oreb+dreb),
        'assists': stats.get('assists', 0),
        'turnovers': tov,
        'won': 1 if pts > opp_pts else 0,
        'fga': fga, 'fta': fta, 'fg3a': fg3a,
    }

def rolling_stats(team_id, game_date, window):
    recent = []
    for g in reversed(all_games):
        if g.get('date', '') >= game_date:
            continue
        is_home = g.get('homeTeamId') == team_id
        is_away = g.get('awayTeamId') == team_id
        if not is_home and not is_away:
            continue
        stats = g['homeStats'] if is_home else g['awayStats']
        opp = g['awayStats'] if is_home else g['homeStats']
        pts = g['homeScore'] if is_home else g['awayScore']
        opp_pts = g['awayScore'] if is_home else g['homeScore']
        recent.append(compute_per_game(stats, opp, pts, opp_pts))
        if len(recent) >= window:
            break
    if len(recent) < min(3, window):
        return None
    n = len(recent)
    total_pts = sum(g['pts'] for g in recent)
    total_opp = sum(g['oppPts'] for g in recent)
    total_poss = sum(g['pace'] for g in recent)
    pace = total_poss / n
    offRtg = (total_pts / total_poss) * 100 if total_poss > 0 else 114.5
    defRtg = (total_opp / total_poss) * 100 if total_poss > 0 else 114.5
    avg = lambda k: sum(g[k] for g in recent) / n
    return {
        'games': n, 'pace': pace, 'offRtg': offRtg, 'defRtg': defRtg, 'netRtg': offRtg - defRtg,
        'ppg': total_pts/n, 'oppPpg': total_opp/n, 'efg': avg('efg'), 'ts': avg('ts'),
        'tovPct': avg('tovPct'), 'orbPct': avg('orbPct'), 'fgPct': avg('fgPct'),
        'fg3Pct': avg('fg3Pct'), 'ftPct': avg('ftPct'), 'rebounds': avg('rebounds'),
        'assists': avg('assists'), 'turnovers': avg('turnovers'),
        'winPct': sum(g['won'] for g in recent) / n,
        'fga': avg('fga'), 'fta': avg('fta'), 'fg3a': avg('fg3a'),
    }

def build_features(hL3, hL10, hL20, aL3, aL10, aL20):
    return {
        'h3_pace': hL3['pace'], 'h3_offRtg': hL3['offRtg'], 'h3_defRtg': hL3['defRtg'],
        'h3_ppg': hL3['ppg'], 'h3_efg': hL3['efg'], 'h3_fgPct': hL3['fgPct'],
        'h3_fg3Pct': hL3['fg3Pct'], 'h3_assists': hL3['assists'], 'h3_turnovers': hL3['turnovers'],
        'a3_pace': aL3['pace'], 'a3_offRtg': aL3['offRtg'], 'a3_defRtg': aL3['defRtg'],
        'a3_ppg': aL3['ppg'], 'a3_efg': aL3['efg'], 'a3_fgPct': aL3['fgPct'],
        'a3_fg3Pct': aL3['fg3Pct'], 'a3_assists': aL3['assists'], 'a3_turnovers': aL3['turnovers'],
        'h10_pace': hL10['pace'], 'h10_offRtg': hL10['offRtg'], 'h10_defRtg': hL10['defRtg'],
        'h10_ppg': hL10['ppg'], 'h10_efg': hL10['efg'], 'h10_fgPct': hL10['fgPct'],
        'h10_fg3Pct': hL10['fg3Pct'], 'h10_ftPct': hL10['ftPct'], 'h10_rebounds': hL10['rebounds'],
        'h10_assists': hL10['assists'], 'h10_turnovers': hL10['turnovers'], 'h10_ts': hL10['ts'],
        'a10_pace': aL10['pace'], 'a10_offRtg': aL10['offRtg'], 'a10_defRtg': aL10['defRtg'],
        'a10_ppg': aL10['ppg'], 'a10_efg': aL10['efg'], 'a10_fgPct': aL10['fgPct'],
        'a10_fg3Pct': aL10['fg3Pct'], 'a10_ftPct': aL10['ftPct'], 'a10_rebounds': aL10['rebounds'],
        'a10_assists': aL10['assists'], 'a10_turnovers': aL10['turnovers'], 'a10_ts': aL10['ts'],
        'h20_pace': hL20['pace'], 'h20_offRtg': hL20['offRtg'], 'h20_defRtg': hL20['defRtg'],
        'h20_ppg': hL20['ppg'], 'h20_efg': hL20['efg'],
        'a20_pace': aL20['pace'], 'a20_offRtg': aL20['offRtg'], 'a20_defRtg': aL20['defRtg'],
        'a20_ppg': aL20['ppg'], 'a20_efg': aL20['efg'],
        'pace_avg_l10': (hL10['pace'] + aL10['pace']) / 2,
        'pace_diff_l10': hL10['pace'] - aL10['pace'],
        'pace_avg_l3': (hL3['pace'] + aL3['pace']) / 2,
        'pace_product': (hL10['pace'] * aL10['pace']) / 10000,
        'ppg_sum_l10': hL10['ppg'] + aL10['ppg'],
        'ppg_sum_l3': hL3['ppg'] + aL3['ppg'],
        'ppg_sum_l20': hL20['ppg'] + aL20['ppg'],
        'ppg_diff_l10': hL10['ppg'] - aL10['ppg'],
        'expected_total_l10': ((hL10['pace']+aL10['pace'])/2/100) * (hL10['offRtg']*(aL10['defRtg']/114.5) + aL10['offRtg']*(hL10['defRtg']/114.5)),
        'expected_total_l3': ((hL3['pace']+aL3['pace'])/2/100) * (hL3['offRtg']*(aL3['defRtg']/114.5) + aL3['offRtg']*(hL3['defRtg']/114.5)),
        'home_off_vs_away_def': hL10['offRtg'] - aL10['defRtg'],
        'away_off_vs_home_def': aL10['offRtg'] - hL10['defRtg'],
        'matchup_offense_sum': hL10['offRtg'] + aL10['offRtg'],
        'matchup_defense_sum': hL10['defRtg'] + aL10['defRtg'],
        'efg_sum': hL10['efg'] + aL10['efg'],
        'efg_diff': hL10['efg'] - aL10['efg'],
        'ts_sum': hL10['ts'] + aL10['ts'],
        'tov_sum': hL10['turnovers'] + aL10['turnovers'],
        'tov_diff': hL10['turnovers'] - aL10['turnovers'],
        'tovPct_avg': (hL10['tovPct'] + aL10['tovPct']) / 2,
        'orbPct_avg': (hL10['orbPct'] + aL10['orbPct']) / 2,
        'rebounds_sum': hL10['rebounds'] + aL10['rebounds'],
        'fta_sum': hL10['fta'] + aL10['fta'],
        'home_form_trend': hL3['ppg'] - hL20['ppg'],
        'away_form_trend': aL3['ppg'] - aL20['ppg'],
        'home_pace_trend': hL3['pace'] - hL20['pace'],
        'away_pace_trend': aL3['pace'] - aL20['pace'],
        'winPct_sum': hL10['winPct'] + aL10['winPct'],
        'winPct_diff': hL10['winPct'] - aL10['winPct'],
        'home_court': 1,
    }

def predict(mdl, features):
    pred = mdl['bias']
    for key, weight in mdl['weights'].items():
        if key not in features:
            continue
        val = features[key]
        mean = mdl['means'].get(key, 0)
        std = mdl['stds'].get(key, 1)
        if std > 0:
            pred += weight * ((val - mean) / std)
    return pred

# Load odds
TEAM_NAME_MAP = {
    'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
    'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
    'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
    'GS': 'Golden State Warriors', 'GSW': 'Golden State Warriors',
    'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
    'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers',
    'MEM': 'Memphis Grizzlies', 'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks',
    'MIN': 'Minnesota Timberwolves', 'NOP': 'New Orleans Pelicans', 'NO': 'New Orleans Pelicans',
    'NY': 'New York Knicks', 'NYK': 'New York Knicks',
    'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic',
    'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
    'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings',
    'SA': 'San Antonio Spurs', 'SAS': 'San Antonio Spurs',
    'TOR': 'Toronto Raptors',
    'UTAH': 'Utah Jazz', 'UTA': 'Utah Jazz',
    'WAS': 'Washington Wizards', 'WSH': 'Washington Wizards',
}

all_odds = {}
odds_dir = '/Users/brentgoldman/Desktop/REPO33/RRMODEL/data/nba/historical_odds/game_totals'
for f in os.listdir(odds_dir):
    if not f.endswith('.json'):
        continue
    try:
        with open(os.path.join(odds_dir, f)) as fp:
            od = json.load(fp)
        for g in od.get('games', od.get('data', [])):
            ht = g.get('home_team', '')
            ct = (g.get('commence_time', g.get('date', od.get('date', ''))))
            ds = ct.split('T')[0] if ct else ''
            if not ds or not ht:
                continue
            lines = []
            for bk in g.get('bookmakers', []):
                tm = next((m for m in bk.get('markets', []) if m.get('key') == 'totals'), None)
                if tm:
                    ov = next((o for o in tm.get('outcomes', []) if o.get('name') == 'Over'), None)
                    if ov and ov.get('point'):
                        lines.append(ov['point'])
            if g.get('consensus_line'):
                lines.append(g['consensus_line'])
            if lines:
                all_odds[f'{ds}_{ht}'] = sum(lines) / len(lines)
    except:
        pass

# Also CSV
with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/data/nba/backtests/nba_totals_backtest_dataset.csv') as f:
    for r in csv.DictReader(f):
        if r.get('market_total_line_consensus'):
            ht_name = TEAM_NAME_MAP.get(r['home_team'], r['home_team'])
            key = f"{r['date']}_{ht_name}"
            if key not in all_odds:
                all_odds[key] = float(r['market_total_line_consensus'])

print(f"Loaded {len(all_odds)} odds entries")

# Build test dataset (2024-10-01+)
test_results = []
test_games = [g for g in all_games if g.get('date', '') >= '2024-10-01']
skipped = 0

for i, game in enumerate(test_games):
    hL3 = rolling_stats(game['homeTeamId'], game['date'], 3)
    hL10 = rolling_stats(game['homeTeamId'], game['date'], 10)
    hL20 = rolling_stats(game['homeTeamId'], game['date'], 20)
    aL3 = rolling_stats(game['awayTeamId'], game['date'], 3)
    aL10 = rolling_stats(game['awayTeamId'], game['date'], 10)
    aL20 = rolling_stats(game['awayTeamId'], game['date'], 20)
    
    if not all([hL3, hL10, hL20, aL3, aL10, aL20]):
        skipped += 1
        continue
    
    actual = game['homeScore'] + game['awayScore']
    if actual < 150 or actual > 350:
        skipped += 1
        continue
    
    # Match odds - try homeTeamName first (full name), then abbreviation mapped
    ht_name = game.get('homeTeamName', '')
    ht_abbrev = game.get('homeTeam', '')
    ht_mapped = TEAM_NAME_MAP.get(ht_abbrev, ht_abbrev)
    vegas = None
    for key_try in [f"{game['date']}_{ht_name}", f"{game['date']}_{ht_mapped}", f"{game['date']}_{ht_abbrev}"]:
        if key_try in all_odds:
            vegas = all_odds[key_try]
            break
    
    if not vegas:
        skipped += 1
        continue
    
    features = build_features(hL3, hL10, hL20, aL3, aL10, aL20)
    pred = predict(model, features)
    edge = pred - vegas
    pick_over = edge > 0
    actual_over = actual > vegas
    correct = pick_over == actual_over
    
    test_results.append({
        'date': game['date'],
        'home': game.get('homeTeam', game.get('homeTeamName', '')),
        'away': game.get('awayTeam', game.get('awayTeamName', '')),
        'actual': actual,
        'vegas': vegas,
        'pred': pred,
        'edge': edge,
        'abs_edge': abs(edge),
        'pick_over': pick_over,
        'correct': correct,
    })

print(f"Test games: {len(test_results)} (skipped {skipped})")

# Now analyze the DUAL STRATEGY: Unders >= 5, Overs >= 7.5
print("\n" + "=" * 70)
print("  DUAL STRATEGY ANALYSIS: Unders >= 5 edge + Overs >= 7.5 edge")
print("=" * 70)

under_picks = [r for r in test_results if not r['pick_over'] and r['abs_edge'] >= 5]
over_picks = [r for r in test_results if r['pick_over'] and r['abs_edge'] >= 7.5]
all_picks = under_picks + over_picks
all_picks.sort(key=lambda r: r['date'])

# ROI calc
def calc_roi(picks):
    if not picks:
        return 0, 0, 0, 0, 0
    wins = sum(1 for p in picks if p['correct'])
    losses = len(picks) - wins
    profit = wins * 100 - losses * 110
    wagered = len(picks) * 110
    roi = (profit / wagered) * 100 if wagered > 0 else 0
    wr = wins / len(picks) * 100
    return len(picks), wins, losses, roi, wr

print(f"\n  UNDERS (edge >= 5):")
n, w, l, roi, wr = calc_roi(under_picks)
print(f"    Bets: {n}  |  W-L: {w}-{l}  |  WR: {wr:.1f}%  |  ROI: {roi:+.2f}%")
profit_u = w * 100 - l * 110
print(f"    Profit: ${profit_u:+,} (per $110/bet)")

print(f"\n  OVERS (edge >= 7.5):")
n, w, l, roi, wr = calc_roi(over_picks)
print(f"    Bets: {n}  |  W-L: {w}-{l}  |  WR: {wr:.1f}%  |  ROI: {roi:+.2f}%")
profit_o = w * 100 - l * 110
print(f"    Profit: ${profit_o:+,} (per $110/bet)")

print(f"\n  COMBINED:")
n, w, l, roi, wr = calc_roi(all_picks)
print(f"    Bets: {n}  |  W-L: {w}-{l}  |  WR: {wr:.1f}%  |  ROI: {roi:+.2f}%")
profit_all = w * 100 - l * 110
print(f"    Profit: ${profit_all:+,} (per $110/bet)")

# Bets per week
if all_picks:
    dates = sorted(set(r['date'] for r in all_picks))
    first_date = dates[0]
    last_date = dates[-1]
    from datetime import datetime
    d1 = datetime.strptime(first_date, '%Y-%m-%d')
    d2 = datetime.strptime(last_date, '%Y-%m-%d')
    weeks = max(1, (d2 - d1).days / 7)
    bets_per_week = len(all_picks) / weeks
    under_per_week = len(under_picks) / weeks
    over_per_week = len(over_picks) / weeks
    
    print(f"\n  VOLUME:")
    print(f"    Period: {first_date} to {last_date} ({(d2-d1).days} days, {weeks:.1f} weeks)")
    print(f"    Under picks/week: {under_per_week:.1f}")
    print(f"    Over picks/week:  {over_per_week:.1f}")
    print(f"    TOTAL picks/week: {bets_per_week:.1f}")
    
    # Monthly projection at $110/bet
    monthly_bets = bets_per_week * 4.33
    monthly_profit = (roi / 100) * monthly_bets * 110
    print(f"\n  MONTHLY PROJECTION (at $110/bet):")
    print(f"    Bets/month: {monthly_bets:.0f}")
    print(f"    Expected profit/month: ${monthly_profit:+,.0f}")
    print(f"    Expected ROI: {roi:+.2f}%")

# By month
print(f"\n  MONTH-BY-MONTH PERFORMANCE:")
print(f"  {'Month':>10} | {'Bets':>5} | {'W-L':>7} | {'WR':>6} | {'ROI':>8} | {'Profit':>8}")
print(f"  " + "-" * 55)

by_month = defaultdict(list)
for r in all_picks:
    by_month[r['date'][:7]].append(r)

for month in sorted(by_month.keys()):
    picks = by_month[month]
    n, w, l, roi_m, wr_m = calc_roi(picks)
    profit_m = w * 100 - l * 110
    flag = "  !!!" if roi_m < -5 else ("  *" if roi_m > 10 else "")
    print(f"  {month:>10} | {n:>5} | {w:>3}-{l:<3} | {wr_m:>5.1f}% | {roi_m:>+7.2f}% | ${profit_m:>+6}{flag}")

# Edge distribution of actual picks
print(f"\n  EDGE DISTRIBUTION OF PICKS:")
for bucket_start in range(5, 16, 1):
    bucket_end = bucket_start + 1
    u_in_bucket = [r for r in under_picks if bucket_start <= r['abs_edge'] < bucket_end]
    o_in_bucket = [r for r in over_picks if bucket_start <= r['abs_edge'] < bucket_end]
    if u_in_bucket or o_in_bucket:
        u_wr = sum(1 for r in u_in_bucket if r['correct']) / len(u_in_bucket) * 100 if u_in_bucket else 0
        o_wr = sum(1 for r in o_in_bucket if r['correct']) / len(o_in_bucket) * 100 if o_in_bucket else 0
        print(f"    Edge {bucket_start}-{bucket_end}: {len(u_in_bucket)} unders ({u_wr:.0f}% WR), {len(o_in_bucket)} overs ({o_wr:.0f}% WR)")

# Tier breakdown
print(f"\n  TIER BREAKDOWN:")
tier1_u = [r for r in under_picks if r['abs_edge'] >= 6]
tier2_u = [r for r in under_picks if 5 <= r['abs_edge'] < 6]
tier1_o = [r for r in over_picks if r['abs_edge'] >= 8.5]
tier2_o = [r for r in over_picks if 7.5 <= r['abs_edge'] < 8.5]

print(f"    Tier 1 Unders (>=6): ", end="")
n, w, l, roi_t, wr_t = calc_roi(tier1_u)
print(f"{n} bets, {wr_t:.1f}% WR, {roi_t:+.2f}% ROI")

print(f"    Tier 2 Unders (5-6): ", end="")
n, w, l, roi_t, wr_t = calc_roi(tier2_u)
print(f"{n} bets, {wr_t:.1f}% WR, {roi_t:+.2f}% ROI")

print(f"    Tier 1 Overs (>=8.5): ", end="")
n, w, l, roi_t, wr_t = calc_roi(tier1_o)
print(f"{n} bets, {wr_t:.1f}% WR, {roi_t:+.2f}% ROI")

print(f"    Tier 2 Overs (7.5-8.5): ", end="")
n, w, l, roi_t, wr_t = calc_roi(tier2_o)
print(f"{n} bets, {wr_t:.1f}% WR, {roi_t:+.2f}% ROI")
