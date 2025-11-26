"""Phase 3.6 feature definitions and helpers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List
import numpy as np
import pandas as pd


@dataclass(frozen=True)
class StatMarketConfig:
    name: str
    market: str
    target_col: str
    line_col: str = 'line'
    baseline_col: str = None


BASE_ROLLING_FEATURES = [
    'L5_ppg', 'L10_ppg', 'L20_ppg', 'L40_ppg', 'L999_ppg',
    'L5_rpg', 'L10_rpg', 'L20_rpg', 'L40_rpg', 'L999_rpg',
    'L5_apg', 'L10_apg', 'L20_apg', 'L40_apg', 'L999_apg',
    'L5_pra', 'L10_pra', 'L20_pra', 'L40_pra', 'L999_pra',
    'L5_minutes', 'L10_minutes', 'L20_minutes', 'L40_minutes',
    'L5_fga', 'L10_fga', 'L20_fga', 'L40_fga',
    'L5_fta', 'L10_fta', 'L20_fta', 'L40_fta'
]

SEASON_FEATURES = [
    'season_ppg', 'season_rpg', 'season_apg', 'season_pra',
    'season_minutes', 'season_fga', 'season_fta', 'season_games_played'
]

OPPONENT_FEATURES = [
    'opp_def_L5_ppg_allowed', 'opp_def_L10_ppg_allowed',
    'opp_def_L5_rpg_allowed', 'opp_def_L10_rpg_allowed',
    'opp_def_L5_apg_allowed', 'opp_def_L10_apg_allowed',
    'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed'
]

CONTEXT_FEATURES = [
    'home', 'rest_days', 'games_played'
]

LINE_AWARE_BASE = [
    'line_minus_projection', 'line_zscore_vs_player', 'line_vs_L5', 'line_vs_L10',
    'line_vs_L20', 'line_vs_L40', 'line_vs_season', 'line_zscore_vs_distribution',
    'implied_prob_minus_proj', 'historical_over_rate', 'historical_under_rate'
]

OPPONENT_CONTEXT = [
    'opp_percentile_allowed', 'opp_matchup_rank_delta', 'opponent_switch_penalty'
]

FATIGUE_FEATURES = [
    'b2b_flag', 'third_in_four_flag', 'travel_miles_last5', 'rest_day_spline_1',
    'rest_day_spline_2', 'rest_day_spline_3'
]

ROLE_FEATURES = [
    'usage_recency_weighted', 'role_change_flag', 'injury_rotation_shock',
    'minutes_delta_L5_vs_L20'
]

PACE_FEATURES = [
    'pace_adjusted_expectation', 'team_pace_delta', 'opponent_pace_delta'
]

DISTRIBUTION_HINTS = [
    'recent_variance', 'recent_std', 'over_under_line_delta_slope',
    'quantile_residual_p50', 'quantile_residual_p75'
]

ALL_FEATURES = (
    BASE_ROLLING_FEATURES +
    SEASON_FEATURES +
    OPPONENT_FEATURES +
    CONTEXT_FEATURES +
    LINE_AWARE_BASE +
    OPPONENT_CONTEXT +
    FATIGUE_FEATURES +
    ROLE_FEATURES +
    PACE_FEATURES +
    DISTRIBUTION_HINTS
)

STAT_CONFIGS: Dict[str, StatMarketConfig] = {
    'points': StatMarketConfig('points', 'player_points', 'points', baseline_col='L10_ppg'),
    'rebounds': StatMarketConfig('rebounds', 'player_rebounds', 'rebounds', baseline_col='L10_rpg'),
    'assists': StatMarketConfig('assists', 'player_assists', 'assists', baseline_col='L10_apg')
}


def _safe_get(row: pd.Series, key: str, default: float = 0.0) -> float:
    val = row.get(key, default)
    if pd.isna(val):
        return default
    return float(val)


def _percentile_rank(series: pd.Series) -> pd.Series:
    return series.rank(pct=True, method='average').fillna(0.5)


def add_line_features(df: pd.DataFrame, stat_key: str) -> pd.DataFrame:
    config = STAT_CONFIGS[stat_key]
    baseline_col = config.baseline_col or f"L10_{config.target_col[0]}pg"
    baseline = df.get(baseline_col, pd.Series(0, index=df.index))
    df['line_minus_projection'] = df['line'] - baseline
    df['line_vs_L5'] = df['line'] - df.get(f'L5_{config.target_col[0]}pg', 0)
    df['line_vs_L10'] = df['line'] - df.get(f'L10_{config.target_col[0]}pg', 0)
    df['line_vs_L20'] = df['line'] - df.get(f'L20_{config.target_col[0]}pg', 0)
    df['line_vs_L40'] = df['line'] - df.get(f'L40_{config.target_col[0]}pg', 0)
    df['line_vs_season'] = df['line'] - df.get(f'season_{config.target_col[0]}pg', 0)

    player_key = df['player_id'] if 'player_id' in df.columns else df['player']
    line_history = df.groupby(player_key)['line_minus_projection']
    std = line_history.transform(lambda s: np.std(s[-10:]) if len(s) else 1.0).replace(0, 1.0)
    df['line_zscore_vs_player'] = df['line_minus_projection'] / std

    residual = df[config.target_col] - baseline
    residual_std = residual.groupby(player_key).transform(lambda s: np.std(s[-15:]) if len(s) else 1.0).replace(0, 1.0)
    df['line_zscore_vs_distribution'] = df['line_minus_projection'] / residual_std

    implied_prob = df.get('book_implied_prob', 0.5)
    proj_cdf = 0.5  # placeholder until distribution model predictions get merged later in pipeline
    df['implied_prob_minus_proj'] = implied_prob - proj_cdf

    over_hits = df.groupby(player_key)[config.target_col].transform(lambda s: (s > df['line']).rolling(15).mean())
    df['historical_over_rate'] = over_hits.fillna(0.5)
    df['historical_under_rate'] = 1 - df['historical_over_rate']

    delta = df.groupby(player_key)['line_minus_projection'].diff().fillna(0)
    df['over_under_line_delta_slope'] = delta.rolling(5).mean().fillna(0)

    return df


def add_opponent_features(df: pd.DataFrame, stat_key: str) -> pd.DataFrame:
    allowed_col = f'opp_def_L10_{config_target_suffix(stat_key)}_allowed'
    if allowed_col not in df.columns:
        return df.assign(
            opp_percentile_allowed=0.5,
            opp_matchup_rank_delta=0.0,
            opponent_switch_penalty=0.0
        )

    df['opp_percentile_allowed'] = _percentile_rank(df[allowed_col])
    league_avg = df[allowed_col].mean()
    df['opp_matchup_rank_delta'] = (df[allowed_col] - league_avg) / (np.abs(league_avg) + 1e-6)
    df['opponent_switch_penalty'] = np.where(df.get('opponent_switch_rate', 0) > 0, df['opponent_switch_rate'], 0)
    return df


def add_fatigue_features(df: pd.DataFrame) -> pd.DataFrame:
    rest = df.get('rest_days', pd.Series(2, index=df.index)).fillna(2)
    df['b2b_flag'] = (rest <= 1).astype(float)
    df['third_in_four_flag'] = (df.get('games_last5_days', 0) >= 3).astype(float)
    df['travel_miles_last5'] = df.get('travel_miles_last5', 0).fillna(0)

    # cubic spline basis on rest days
    df['rest_day_spline_1'] = rest
    df['rest_day_spline_2'] = rest ** 2
    df['rest_day_spline_3'] = rest ** 3
    return df


def add_role_features(df: pd.DataFrame, stat_key: str) -> pd.DataFrame:
    usage = df.get('usage_rate', 0).fillna(0)
    usage_L10 = df.groupby(df['player'])['usage_rate'].transform(lambda s: s.rolling(10).mean()) if 'player' in df else usage
    df['usage_recency_weighted'] = 0.65 * usage + 0.35 * usage_L10.fillna(usage)

    minutes_L5 = df.get('L5_minutes', 0)
    minutes_L20 = df.get('L20_minutes', minutes_L5)
    df['minutes_delta_L5_vs_L20'] = minutes_L5 - minutes_L20
    df['role_change_flag'] = (np.abs(df['minutes_delta_L5_vs_L20']) >= 4).astype(float)

    df['injury_rotation_shock'] = df.get('injury_rotation_flag', 0).fillna(0)
    return df


def add_pace_features(df: pd.DataFrame) -> pd.DataFrame:
    team_pace = df.get('team_pace', 98).fillna(98)
    opp_pace = df.get('opponent_pace', 98).fillna(98)
    league_avg = 98
    df['pace_adjusted_expectation'] = (team_pace + opp_pace) / 2
    df['team_pace_delta'] = (team_pace - league_avg) / league_avg
    df['opponent_pace_delta'] = (opp_pace - league_avg) / league_avg
    return df


def add_distribution_hints(df: pd.DataFrame, stat_key: str) -> pd.DataFrame:
    player_key = df['player']
    stat_values = df[STAT_CONFIGS[stat_key].target_col]
    df['recent_variance'] = stat_values.groupby(player_key).transform(lambda s: s.rolling(12).var()).fillna(stat_values.var())
    df['recent_std'] = np.sqrt(df['recent_variance']).replace(0, 1.0)

    quantile_p50 = stat_values.groupby(player_key).transform(lambda s: s.rolling(12).quantile(0.5))
    quantile_p75 = stat_values.groupby(player_key).transform(lambda s: s.rolling(12).quantile(0.75))
    df['quantile_residual_p50'] = (df['line'] - quantile_p50).fillna(0)
    df['quantile_residual_p75'] = (df['line'] - quantile_p75).fillna(0)
    return df


def config_target_suffix(stat_key: str) -> str:
    if stat_key == 'points':
        return 'ppg'
    if stat_key == 'rebounds':
        return 'rpg'
    return 'apg'


def assemble_features(df: pd.DataFrame, stat_key: str) -> pd.DataFrame:
    df = add_line_features(df, stat_key)
    df = add_opponent_features(df, stat_key)
    df = add_fatigue_features(df)
    df = add_role_features(df, stat_key)
    df = add_pace_features(df)
    df = add_distribution_hints(df, stat_key)
    return df


def ensure_feature_order(df: pd.DataFrame) -> pd.DataFrame:
    for col in ALL_FEATURES:
        if col not in df.columns:
            df[col] = 0.0
    return df[ALL_FEATURES]


def build_feature_matrix(df: pd.DataFrame, stat_key: str) -> pd.DataFrame:
    df = assemble_features(df, stat_key)
    return ensure_feature_order(df)

__all__ = [
    'ALL_FEATURES',
    'STAT_CONFIGS',
    'StatMarketConfig',
    'build_feature_matrix'
]
