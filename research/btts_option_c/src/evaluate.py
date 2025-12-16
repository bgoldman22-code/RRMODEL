#!/usr/bin/env python3
"""
Comprehensive Evaluation Module

Provides detailed evaluation metrics and visualizations for BTTS models:
- AUC, Brier, LogLoss
- Calibration curves
- Reliability diagrams
- Profit simulations (flat betting, Kelly)
- Model comparison plots
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from typing import Iterable, List, Dict, Tuple
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss, roc_curve
from sklearn.calibration import calibration_curve

RESEARCH_DIR = Path(__file__).parent.parent
RESULTS_DIR = RESEARCH_DIR / 'results'
CALIBRATION_DIR = RESULTS_DIR / 'calibration_plots'
PROFIT_DIR = RESULTS_DIR / 'profit_curves'


def calculate_metrics(y_true, y_pred):
    """
    Calculate comprehensive metrics
    
    Returns:
        dict of metrics
    """
    metrics = {
        'auc': roc_auc_score(y_true, y_pred),
        'brier': brier_score_loss(y_true, y_pred),
        'logloss': log_loss(y_true, y_pred)
    }
    
    return metrics


def plot_calibration_curve(y_true, y_pred, model_name, n_bins=10):
    """
    Plot calibration curve for a single model
    """
    fig, ax = plt.subplots(1, 1, figsize=(10, 10))
    
    # Plot perfect calibration
    ax.plot([0, 1], [0, 1], 'k--', label='Perfect Calibration')
    
    # Calculate calibration curve
    fraction_of_positives, mean_predicted_value = calibration_curve(
        y_true, y_pred, n_bins=n_bins
    )
    
    # Plot model calibration
    ax.plot(mean_predicted_value, fraction_of_positives, 's-', 
            label=f'{model_name}', linewidth=2, markersize=8)
    
    ax.set_xlabel('Predicted Probability', fontsize=12)
    ax.set_ylabel('Observed Frequency', fontsize=12)
    ax.set_title(f'Calibration Curve - {model_name}', fontsize=14, fontweight='bold')
    ax.legend(loc='best')
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_file = CALIBRATION_DIR / f'calibration_{model_name.replace(" ", "_").lower()}.png'
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    plt.close()
    
    return output_file


def plot_roc_curve(y_true, y_pred, model_name):
    """
    Plot ROC curve
    """
    fpr, tpr, thresholds = roc_curve(y_true, y_pred)
    auc = roc_auc_score(y_true, y_pred)
    
    fig, ax = plt.subplots(1, 1, figsize=(10, 10))
    
    ax.plot([0, 1], [0, 1], 'k--', label='Random')
    ax.plot(fpr, tpr, linewidth=2, label=f'{model_name} (AUC = {auc:.3f})')
    
    ax.set_xlabel('False Positive Rate', fontsize=12)
    ax.set_ylabel('True Positive Rate', fontsize=12)
    ax.set_title(f'ROC Curve - {model_name}', fontsize=14, fontweight='bold')
    ax.legend(loc='best')
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_file = CALIBRATION_DIR / f'roc_{model_name.replace(" ", "_").lower()}.png'
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    plt.close()
    
    return output_file


def simulate_flat_betting(y_true, y_pred, odds, stake=10):
    """
    Simulate flat betting strategy
    
    Args:
        y_true: Actual outcomes
        y_pred: Predicted probabilities
        odds: Decimal odds for BTTS
        stake: Bet size per match
    
    Returns:
        dict with profit metrics
    """
    bets = y_pred > 0.5  # Bet when probability > 50%
    
    # Calculate returns
    returns = []
    for i, bet in enumerate(bets):
        if bet:
            if y_true[i] == 1:
                returns.append(stake * (odds[i] - 1))  # Win
            else:
                returns.append(-stake)  # Lose
        else:
            returns.append(0)  # No bet
    
    total_profit = sum(returns)
    total_staked = stake * sum(bets)
    roi = (total_profit / total_staked * 100) if total_staked > 0 else 0
    
    return {
        'total_bets': sum(bets),
        'total_staked': total_staked,
        'total_profit': total_profit,
        'roi_pct': roi
    }


def simulate_kelly_betting(y_true, y_pred, odds, bankroll=1000, kelly_fraction=0.25):
    """
    Simulate Kelly criterion betting
    
    Args:
        y_true: Actual outcomes
        y_pred: Predicted probabilities
        odds: Decimal odds for BTTS
        bankroll: Starting bankroll
        kelly_fraction: Fraction of Kelly to bet (for safety)
    
    Returns:
        dict with profit metrics
    """
    current_bankroll = bankroll
    history = [bankroll]
    
    for i in range(len(y_pred)):
        # Calculate Kelly stake
        p = y_pred[i]  # Predicted probability
        b = odds[i] - 1  # Decimal odds minus 1
        
        # Kelly formula: f = (bp - q) / b, where q = 1 - p
        kelly_stake = (b * p - (1 - p)) / b
        kelly_stake = max(0, kelly_stake)  # No negative bets
        kelly_stake *= kelly_fraction  # Fractional Kelly
        
        bet_amount = current_bankroll * kelly_stake
        
        # Only bet if Kelly says to
        if bet_amount > 0:
            if y_true[i] == 1:
                current_bankroll += bet_amount * b  # Win
            else:
                current_bankroll -= bet_amount  # Lose
        
        history.append(current_bankroll)
    
    final_profit = current_bankroll - bankroll
    roi = (final_profit / bankroll) * 100
    
    return {
        'starting_bankroll': bankroll,
        'ending_bankroll': current_bankroll,
        'total_profit': final_profit,
        'roi_pct': roi,
        'bankroll_history': history
    }


def plot_profit_curves(results_dict):
    """
    Plot profit curves for multiple models
    
    Args:
        results_dict: Dict of {model_name: {'y_true': ..., 'y_pred': ..., 'odds': ...}}
    """
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    
    # Flat betting comparison
    ax1 = axes[0]
    flat_results = {}
    
    for model_name, data in results_dict.items():
        flat = simulate_flat_betting(
            data['y_true'], 
            data['y_pred'], 
            data['odds']
        )
        flat_results[model_name] = flat
        
        ax1.bar(model_name, flat['roi_pct'])
    
    ax1.set_ylabel('ROI %', fontsize=12)
    ax1.set_title('Flat Betting ROI Comparison', fontsize=14, fontweight='bold')
    ax1.axhline(y=0, color='r', linestyle='--', alpha=0.5)
    ax1.tick_params(axis='x', rotation=45)
    ax1.grid(True, alpha=0.3, axis='y')
    
    # Kelly betting comparison
    ax2 = axes[1]
    kelly_results = {}
    
    for model_name, data in results_dict.items():
        kelly = simulate_kelly_betting(
            data['y_true'],
            data['y_pred'],
            data['odds']
        )
        kelly_results[model_name] = kelly
        
        ax2.bar(model_name, kelly['roi_pct'])
    
    ax2.set_ylabel('ROI %', fontsize=12)
    ax2.set_title('Kelly Betting ROI Comparison', fontsize=14, fontweight='bold')
    ax2.axhline(y=0, color='r', linestyle='--', alpha=0.5)
    ax2.tick_params(axis='x', rotation=45)
    ax2.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    output_file = PROFIT_DIR / 'profit_comparison.png'
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
    plt.close()
    
    return flat_results, kelly_results, output_file


def generate_comprehensive_report(leaderboard_df, rankings_df=None):
    """
    Generate comprehensive text report
    """
    report_file = RESULTS_DIR / 'comprehensive_report.txt'
    
    with open(report_file, 'w') as f:
        f.write("=" * 80 + "\n")
        f.write("BTTS NORTHERN STAR INDICATOR DISCOVERY - COMPREHENSIVE REPORT\n")
        f.write("=" * 80 + "\n\n")
        
        # Model Leaderboard
        f.write("MODEL LEADERBOARD\n")
        f.write("-" * 80 + "\n")
        f.write(f"{'Rank':<6} {'Model':<25} {'AUC':<10} {'Brier':<10} {'LogLoss':<10}\n")
        f.write("-" * 80 + "\n")
        
        for idx, row in leaderboard_df.iterrows():
            rank = idx + 1
            f.write(f"{rank:<6} {row['model']:<25} {row['auc']:<10.4f} "
                   f"{row['brier']:<10.4f} {row['logloss']:<10.4f}\n")
        
        # Feature Rankings (if available)
        if rankings_df is not None:
            f.write("\n\n" + "=" * 80 + "\n")
            f.write("TOP 20 BTTS INDICATORS\n")
            f.write("=" * 80 + "\n\n")
            
            for idx, row in rankings_df.head(20).iterrows():
                f.write(f"{row['composite_rank']:.0f}. {row['feature']}\n")
                f.write(f"   Composite Score: {row['composite_score']:.4f}\n")
                if 'mi_score' in row:
                    f.write(f"   MI: {row['mi_score']:.4f} | ")
                    f.write(f"RF: {row['rf_importance']:.4f} | ")
                    f.write(f"SHAP: {row['shap_importance']:.4f}\n")
                f.write("\n")
        
        f.write("\n" + "=" * 80 + "\n")
        f.write("REPORT COMPLETE\n")
        f.write("=" * 80 + "\n")
    
    print(f"\n📄 Comprehensive report saved to: {report_file}")
    
    return report_file


# ============================================================================
# BETTING SIMULATION FUNCTIONS
# ============================================================================

def compute_classification_metrics(y_true, y_proba):
    """
    Compute standard classification metrics
    
    Args:
        y_true: Array of true labels (0/1)
        y_proba: Array of predicted probabilities (0-1)
    
    Returns:
        dict with 'auc', 'brier', 'logloss'
    """
    return {
        'auc': roc_auc_score(y_true, y_proba),
        'brier': brier_score_loss(y_true, y_proba),
        'logloss': log_loss(y_true, y_proba)
    }


def simulate_flat_bets(y_true, y_proba, yes_odds, threshold=0.55, stake=10):
    """
    Simulate flat-stake betting on BTTS YES
    
    Strategy:
    - Bet BTTS YES when model probability >= threshold
    - Use flat stake for all bets
    - Calculate profit/loss based on actual odds
    
    Args:
        y_true: Array of true BTTS outcomes (0/1)
        y_proba: Array of model BTTS probabilities
        yes_odds: Array of bookmaker BTTS YES odds (decimal, e.g., 1.85)
        threshold: Minimum probability to trigger bet (default 0.55 = 55%)
        stake: Amount wagered per bet (default 10 units)
    
    Returns:
        dict with 'roi', 'n_bets', 'profit', 'wins', 'losses'
    """
    # Filter for bets where model prob >= threshold AND odds available
    valid_mask = (y_proba >= threshold) & (pd.notna(yes_odds))
    
    if valid_mask.sum() == 0:
        return {
            'roi': 0.0,
            'n_bets': 0,
            'profit': 0.0,
            'wins': 0,
            'losses': 0,
            'total_staked': 0.0
        }
    
    y_true_bet = y_true[valid_mask]
    yes_odds_bet = yes_odds[valid_mask]
    
    # Calculate profit for each bet
    # Win: profit = stake * (odds - 1)
    # Loss: profit = -stake
    profits = np.where(
        y_true_bet == 1,
        stake * (yes_odds_bet - 1),  # Win
        -stake                        # Loss
    )
    
    total_profit = profits.sum()
    total_staked = stake * len(y_true_bet)
    roi = (total_profit / total_staked) * 100 if total_staked > 0 else 0
    
    return {
        'roi': roi,
        'n_bets': len(y_true_bet),
        'profit': total_profit,
        'wins': (y_true_bet == 1).sum(),
        'losses': (y_true_bet == 0).sum(),
        'total_staked': total_staked
    }


def run_threshold_sweep(
    y_true: np.ndarray,
    y_proba: np.ndarray,
    yes_odds: np.ndarray,
    thresholds: Iterable[float],
    stake: float = 10.0,
    require_positive_edge: bool = False,
    min_edge: float = 0.0,
    fair_yes_odds: np.ndarray | None = None
) -> List[Dict[str, float]]:
    """Compute ROI metrics across multiple probability thresholds.

    Args:
        y_true: Binary outcomes array (0/1).
        y_proba: Model probabilities (0-1).
        yes_odds: Decimal odds for BTTS Yes (same length as y_true).
        thresholds: Iterable of probability cutoffs to evaluate.
        stake: Flat stake amount per bet.
        require_positive_edge: If True, only place bets when model probability
            exceeds implied probability by at least ``min_edge``.
        min_edge: Minimum edge (p_model - implied_prob) required when
            ``require_positive_edge`` is True.

    Returns:
        List of dicts with ROI metrics for each threshold.
    """
    y_true = np.asarray(y_true)
    y_proba = np.asarray(y_proba, dtype=float)
    yes_odds = np.asarray(yes_odds, dtype=float)
    threshold_list = [float(t) for t in thresholds]

    if not (len(y_true) == len(y_proba) == len(yes_odds)):
        raise ValueError("y_true, y_proba, and yes_odds must have the same length")
    if len(threshold_list) == 0:
        raise ValueError("Threshold sweep requires at least one threshold value")

    implied_probs = np.divide(
        1.0,
        yes_odds,
        out=np.full_like(yes_odds, np.nan, dtype=float),
        where=yes_odds > 0
    )
    edges = y_proba - implied_probs

    fair_odds = fair_yes_odds if fair_yes_odds is not None else yes_odds.copy()
    fair_odds = np.asarray(fair_odds, dtype=float)

    results: List[Dict[str, float]] = []
    for threshold in threshold_list:
        mask = (y_proba >= threshold) & ~np.isnan(yes_odds)
        if require_positive_edge:
            mask &= edges > min_edge
        idx = np.where(mask)[0]

        if len(idx) == 0:
            results.append({
                'threshold': threshold,
                'bets': 0,
                'wins': 0,
                'losses': 0,
                'profit': 0.0,
                'roi': 0.0,
                'total_staked': 0.0,
                'avg_edge': float('nan'),
                'median_edge': float('nan')
            })
            continue

        bets_won = int(np.sum(y_true[idx] == 1))
        bets_lost = len(idx) - bets_won
        bet_odds = yes_odds[idx]
        bet_fair_odds = fair_odds[idx]
        bet_results = np.where(
            y_true[idx] == 1,
            stake * (bet_odds - 1),
            -stake
        )
        bet_results_fair = np.where(
            y_true[idx] == 1,
            stake * (bet_fair_odds - 1),
            -stake
        )
        total_profit = float(np.sum(bet_results))
        total_profit_fair = float(np.sum(bet_results_fair))
        total_staked = float(stake * len(idx))
        roi = (total_profit / total_staked) * 100 if total_staked > 0 else 0.0
        roi_fair = (total_profit_fair / total_staked) * 100 if total_staked > 0 else 0.0

        edge_values = edges[idx]
        avg_edge = float(np.nanmean(edge_values)) if edge_values.size else float('nan')
        median_edge = float(np.nanmedian(edge_values)) if edge_values.size else float('nan')

        results.append({
            'threshold': threshold,
            'bets': len(idx),
            'wins': bets_won,
            'losses': bets_lost,
            'profit': total_profit,
            'profit_fair': total_profit_fair,
            'roi': roi,
            'roi_fair': roi_fair,
            'total_staked': total_staked,
            'avg_edge': avg_edge,
            'median_edge': median_edge
        })

    return results


def get_yes_no_probs(y_proba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Given model output P(BTTS=Yes), return (p_yes, p_no).
    
    For a binary label with btts ∈ {0, 1}, where the model predicts
    P(btts=1), we have:
        p_yes = P(BTTS Yes) = model output
        p_no  = P(BTTS No)  = 1 - p_yes
    
    Args:
        y_proba: Model probabilities for BTTS Yes (0-1).
        
    Returns:
        tuple: (p_yes, p_no) as numpy arrays
    """
    p_yes = np.asarray(y_proba, dtype=float)
    p_no = 1.0 - p_yes
    return p_yes, p_no


def remove_vig_two_way(p_yes, p_no):
    """
    Remove bookmaker vig for a two-way market using proportional scaling.
    
    Handles both scalar and array inputs.
    """
    p_yes = np.asarray(p_yes, dtype=float)
    p_no = np.asarray(p_no, dtype=float)
    
    # Initialize output arrays
    fair_yes = np.full_like(p_yes, np.nan, dtype=float)
    fair_no = np.full_like(p_no, np.nan, dtype=float)
    
    # Valid entries
    mask = (p_yes > 0) & (p_no > 0)
    if not np.any(mask):
        return fair_yes, fair_no
    
    # Apply scaling
    total = p_yes[mask] + p_no[mask]
    scale_mask = total > 0
    
    fair_yes[mask] = np.where(scale_mask, p_yes[mask] / total, np.nan)
    fair_no[mask] = np.where(scale_mask, p_no[mask] / total, np.nan)
    
    return fair_yes, fair_no


def compute_fair_two_way(yes_odds: np.ndarray, no_odds: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Remove vig from both BTTS Yes and BTTS No odds.
    
    Given raw two-way bookmaker odds (Yes and No), applies proportional
    vig removal and returns fair odds for both sides.
    
    Args:
        yes_odds: Decimal odds for BTTS Yes
        no_odds: Decimal odds for BTTS No
        
    Returns:
        tuple: (fair_yes_odds, fair_no_odds) as numpy arrays
        
    Note:
        Where either odds value is missing or invalid, returns NaN for that
        position. Falls back to raw odds where fair calculation is impossible.
    """
    yes_odds = np.asarray(yes_odds, dtype=float)
    no_odds = np.asarray(no_odds, dtype=float)
    
    # Initialize with raw odds as fallback
    fair_yes_odds = yes_odds.copy()
    fair_no_odds = no_odds.copy()
    
    # Find valid odds pairs
    mask = (yes_odds > 0) & (no_odds > 0)
    if not np.any(mask):
        return fair_yes_odds, fair_no_odds
    
    # Convert to implied probabilities
    p_yes = 1.0 / yes_odds[mask]
    p_no = 1.0 / no_odds[mask]
    
    # Remove vig using proportional scaling
    fair_prob_yes, fair_prob_no = remove_vig_two_way(p_yes, p_no)
    
    # Convert back to odds
    fair_yes_odds[mask] = np.divide(
        1.0,
        fair_prob_yes,
        out=np.full_like(fair_prob_yes, np.nan, dtype=float),
        where=fair_prob_yes > 0
    )
    fair_no_odds[mask] = np.divide(
        1.0,
        fair_prob_no,
        out=np.full_like(fair_prob_no, np.nan, dtype=float),
        where=fair_prob_no > 0
    )
    
    return fair_yes_odds, fair_no_odds


def compute_fair_yes_odds(yes_odds: np.ndarray, no_odds: np.ndarray | None = None) -> np.ndarray:
    """
    Compute vig-free BTTS yes odds using opposing market when available.
    
    This is a convenience wrapper around compute_fair_two_way() that returns
    only the Yes side odds. Kept for backward compatibility.
    """
    yes_odds = np.asarray(yes_odds, dtype=float)
    if no_odds is None:
        return yes_odds
    
    fair_yes_odds, _ = compute_fair_two_way(yes_odds, no_odds)
    return fair_yes_odds


def run_two_sided_threshold_sweep(
    y_true: np.ndarray,
    y_proba: np.ndarray,
    yes_odds: np.ndarray,
    no_odds: np.ndarray,
    thresholds_yes: list[float],
    thresholds_no: list[float],
    stake: float = 10.0,
    fair_yes_odds: np.ndarray | None = None,
    fair_no_odds: np.ndarray | None = None,
) -> pd.DataFrame:
    """
    Evaluate ROI for both BTTS YES and BTTS NO bets across separate threshold grids.
    
    This function extends the betting evaluation to support two-sided markets.
    Given a single model that outputs P(BTTS Yes), we derive:
        - p_yes = model output
        - p_no = 1 - p_yes
        
    Then evaluate:
        - YES bets: bet when p_yes >= threshold_yes
        - NO bets: bet when p_no >= threshold_no
    
    Args:
        y_true: Binary outcomes (0/1), where 1 = BTTS Yes occurred
        y_proba: Model probabilities for BTTS Yes (0-1)
        yes_odds: Decimal odds for BTTS Yes
        no_odds: Decimal odds for BTTS No
        thresholds_yes: List of probability cutoffs for YES bets
        thresholds_no: List of probability cutoffs for NO bets
        stake: Flat stake amount per bet (default 10.0)
        fair_yes_odds: Optional vig-free Yes odds for fair ROI calculation
        fair_no_odds: Optional vig-free No odds for fair ROI calculation
        
    Returns:
        DataFrame with columns:
            - side: 'YES' or 'NO'
            - threshold: probability threshold used
            - n_bets: number of bets placed
            - n_wins: number of winning bets
            - win_rate: n_wins / n_bets
            - total_profit: total profit/loss (raw odds)
            - roi: return on investment % (raw odds)
            - total_profit_fair: total profit/loss (fair odds)
            - roi_fair: return on investment % (fair odds)
            - avg_edge: average edge per bet (model prob - implied prob)
            - median_edge: median edge per bet
    """
    # Input validation and conversion
    y_true = np.asarray(y_true, dtype=int)
    y_proba = np.asarray(y_proba, dtype=float)
    yes_odds = np.asarray(yes_odds, dtype=float)
    no_odds = np.asarray(no_odds, dtype=float)
    
    if not (len(y_true) == len(y_proba) == len(yes_odds) == len(no_odds)):
        raise ValueError("All input arrays must have the same length")
    
    # Get both probability sides from model output
    p_yes, p_no = get_yes_no_probs(y_proba)
    
    # Use provided fair odds or fall back to raw odds
    fair_yes = fair_yes_odds if fair_yes_odds is not None else yes_odds.copy()
    fair_no = fair_no_odds if fair_no_odds is not None else no_odds.copy()
    fair_yes = np.asarray(fair_yes, dtype=float)
    fair_no = np.asarray(fair_no, dtype=float)
    
    results = []
    
    # ========== YES SIDE ==========
    # For YES bets: bet when p_yes >= threshold, win when y_true == 1
    for threshold in thresholds_yes:
        # Place YES bet if model confidence >= threshold AND odds available
        mask_yes = (p_yes >= threshold) & ~np.isnan(yes_odds)
        idx_yes = np.where(mask_yes)[0]
        
        if len(idx_yes) == 0:
            results.append({
                'side': 'YES',
                'threshold': threshold,
                'n_bets': 0,
                'n_wins': 0,
                'win_rate': 0.0,
                'total_profit': 0.0,
                'roi': 0.0,
                'total_profit_fair': 0.0,
                'roi_fair': 0.0,
                'avg_edge': float('nan'),
                'median_edge': float('nan'),
            })
            continue
        
        # Calculate outcomes
        n_bets_yes = len(idx_yes)
        n_wins_yes = int(np.sum(y_true[idx_yes] == 1))  # Win when BTTS Yes occurred
        win_rate_yes = n_wins_yes / n_bets_yes if n_bets_yes > 0 else 0.0
        
        # Calculate profit/loss with raw odds
        bet_odds_yes = yes_odds[idx_yes]
        bet_results_yes = np.where(
            y_true[idx_yes] == 1,
            stake * (bet_odds_yes - 1),  # Win: profit = stake * (odds - 1)
            -stake  # Loss: lose the stake
        )
        total_profit_yes = float(np.sum(bet_results_yes))
        total_staked_yes = float(stake * n_bets_yes)
        roi_yes = (total_profit_yes / total_staked_yes) * 100 if total_staked_yes > 0 else 0.0
        
        # Calculate profit/loss with fair odds
        bet_fair_odds_yes = fair_yes[idx_yes]
        bet_results_fair_yes = np.where(
            y_true[idx_yes] == 1,
            stake * (bet_fair_odds_yes - 1),
            -stake
        )
        total_profit_fair_yes = float(np.sum(bet_results_fair_yes))
        roi_fair_yes = (total_profit_fair_yes / total_staked_yes) * 100 if total_staked_yes > 0 else 0.0
        
        # Calculate edge (model prob - implied prob from fair odds)
        implied_yes = np.divide(
            1.0,
            bet_fair_odds_yes,
            out=np.full_like(bet_fair_odds_yes, np.nan, dtype=float),
            where=bet_fair_odds_yes > 0
        )
        edge_yes = p_yes[idx_yes] - implied_yes
        avg_edge_yes = float(np.nanmean(edge_yes)) if edge_yes.size > 0 else float('nan')
        median_edge_yes = float(np.nanmedian(edge_yes)) if edge_yes.size > 0 else float('nan')
        
        results.append({
            'side': 'YES',
            'threshold': threshold,
            'n_bets': n_bets_yes,
            'n_wins': n_wins_yes,
            'win_rate': win_rate_yes,
            'total_profit': total_profit_yes,
            'roi': roi_yes,
            'total_profit_fair': total_profit_fair_yes,
            'roi_fair': roi_fair_yes,
            'avg_edge': avg_edge_yes,
            'median_edge': median_edge_yes,
        })
    
    # ========== NO SIDE ==========
    # For NO bets: bet when p_no >= threshold, win when y_true == 0
    for threshold in thresholds_no:
        # Place NO bet if model confidence >= threshold AND odds available
        mask_no = (p_no >= threshold) & ~np.isnan(no_odds)
        idx_no = np.where(mask_no)[0]
        
        if len(idx_no) == 0:
            results.append({
                'side': 'NO',
                'threshold': threshold,
                'n_bets': 0,
                'n_wins': 0,
                'win_rate': 0.0,
                'total_profit': 0.0,
                'roi': 0.0,
                'total_profit_fair': 0.0,
                'roi_fair': 0.0,
                'avg_edge': float('nan'),
                'median_edge': float('nan'),
            })
            continue
        
        # Calculate outcomes
        n_bets_no = len(idx_no)
        n_wins_no = int(np.sum(y_true[idx_no] == 0))  # Win when BTTS No occurred
        win_rate_no = n_wins_no / n_bets_no if n_bets_no > 0 else 0.0
        
        # Calculate profit/loss with raw odds
        bet_odds_no = no_odds[idx_no]
        bet_results_no = np.where(
            y_true[idx_no] == 0,
            stake * (bet_odds_no - 1),  # Win: profit = stake * (odds - 1)
            -stake  # Loss: lose the stake
        )
        total_profit_no = float(np.sum(bet_results_no))
        total_staked_no = float(stake * n_bets_no)
        roi_no = (total_profit_no / total_staked_no) * 100 if total_staked_no > 0 else 0.0
        
        # Calculate profit/loss with fair odds
        bet_fair_odds_no = fair_no[idx_no]
        bet_results_fair_no = np.where(
            y_true[idx_no] == 0,
            stake * (bet_fair_odds_no - 1),
            -stake
        )
        total_profit_fair_no = float(np.sum(bet_results_fair_no))
        roi_fair_no = (total_profit_fair_no / total_staked_no) * 100 if total_staked_no > 0 else 0.0
        
        # Calculate edge (model prob - implied prob from fair odds)
        implied_no = np.divide(
            1.0,
            bet_fair_odds_no,
            out=np.full_like(bet_fair_odds_no, np.nan, dtype=float),
            where=bet_fair_odds_no > 0
        )
        edge_no = p_no[idx_no] - implied_no
        avg_edge_no = float(np.nanmean(edge_no)) if edge_no.size > 0 else float('nan')
        median_edge_no = float(np.nanmedian(edge_no)) if edge_no.size > 0 else float('nan')
        
        results.append({
            'side': 'NO',
            'threshold': threshold,
            'n_bets': n_bets_no,
            'n_wins': n_wins_no,
            'win_rate': win_rate_no,
            'total_profit': total_profit_no,
            'roi': roi_no,
            'total_profit_fair': total_profit_fair_no,
            'roi_fair': roi_fair_no,
            'avg_edge': avg_edge_no,
            'median_edge': median_edge_no,
        })
    
    return pd.DataFrame(results)


def run_two_sided_threshold_sweep_with_bet_details(
    y_true: np.ndarray,
    y_proba: np.ndarray,
    yes_odds: np.ndarray,
    no_odds: np.ndarray,
    thresholds_yes: list[float],
    thresholds_no: list[float],
    stake: float = 10.0,
    fair_yes_odds: np.ndarray | None = None,
    fair_no_odds: np.ndarray | None = None,
    match_ids: np.ndarray | None = None,
    fold_id: int | None = None,
) -> pd.DataFrame:
    """
    Extended version of run_two_sided_threshold_sweep that returns per-bet details.
    
    This function evaluates all threshold combinations and returns one row per actual bet placed,
    allowing for downstream bucket analysis and detailed diagnostics.
    
    Args:
        y_true: Binary outcomes (0/1), where 1 = BTTS Yes occurred
        y_proba: Model probabilities for BTTS Yes (0-1)
        yes_odds: Decimal odds for BTTS Yes
        no_odds: Decimal odds for BTTS No
        thresholds_yes: List of probability cutoffs for YES bets
        thresholds_no: List of probability cutoffs for NO bets
        stake: Flat stake amount per bet (default 10.0)
        fair_yes_odds: Optional vig-free Yes odds for fair ROI calculation
        fair_no_odds: Optional vig-free No odds for fair ROI calculation
        match_ids: Optional array of match identifiers (same length as y_true)
        fold_id: Optional fold identifier to tag all bets
        
    Returns:
        DataFrame with one row per bet, columns:
            - match_id: match identifier (or index if not provided)
            - fold: fold identifier (if provided)
            - side: 'YES' or 'NO'
            - threshold: probability threshold used for this bet
            - p_yes: model probability for BTTS Yes
            - p_no: model probability for BTTS No (1 - p_yes)
            - chosen_side_prob: p_yes for YES bets, p_no for NO bets
            - decimal_odds_used: raw market odds used
            - fair_odds_used: fair (vig-free) odds used
            - implied_prob: 1 / fair_odds_used
            - edge: chosen_side_prob - implied_prob
            - is_win: 1 if bet won, 0 if lost
            - profit_raw: profit/loss using raw odds
            - profit_fair: profit/loss using fair odds
            - stake: bet size (constant)
    """
    # Input validation and conversion
    y_true = np.asarray(y_true, dtype=int)
    y_proba = np.asarray(y_proba, dtype=float)
    yes_odds = np.asarray(yes_odds, dtype=float)
    no_odds = np.asarray(no_odds, dtype=float)
    
    if not (len(y_true) == len(y_proba) == len(yes_odds) == len(no_odds)):
        raise ValueError("All input arrays must have the same length")
    
    # Get both probability sides from model output
    p_yes, p_no = get_yes_no_probs(y_proba)
    
    # Use provided fair odds or fall back to raw odds
    fair_yes = fair_yes_odds if fair_yes_odds is not None else yes_odds.copy()
    fair_no = fair_no_odds if fair_no_odds is not None else no_odds.copy()
    fair_yes = np.asarray(fair_yes, dtype=float)
    fair_no = np.asarray(fair_no, dtype=float)
    
    # Use provided match IDs or default to indices
    if match_ids is None:
        match_ids = np.arange(len(y_true))
    else:
        match_ids = np.asarray(match_ids)
    
    bet_records = []
    
    # ========== YES SIDE ==========
    for threshold in thresholds_yes:
        # Place YES bet if model confidence >= threshold AND odds available
        mask_yes = (p_yes >= threshold) & ~np.isnan(yes_odds)
        idx_yes = np.where(mask_yes)[0]
        
        for i in idx_yes:
            # Calculate implied probability and edge
            implied_yes_i = 1.0 / fair_yes[i] if fair_yes[i] > 0 else np.nan
            edge_yes_i = p_yes[i] - implied_yes_i
            
            # Determine if bet won (YES wins when y_true == 1)
            is_win = int(y_true[i] == 1)
            
            # Calculate profits
            if is_win:
                profit_raw = stake * (yes_odds[i] - 1)
                profit_fair = stake * (fair_yes[i] - 1)
            else:
                profit_raw = -stake
                profit_fair = -stake
            
            bet_records.append({
                'match_id': match_ids[i],
                'fold': fold_id,
                'side': 'YES',
                'threshold': threshold,
                'p_yes': p_yes[i],
                'p_no': p_no[i],
                'chosen_side_prob': p_yes[i],
                'decimal_odds_used': yes_odds[i],
                'fair_odds_used': fair_yes[i],
                'implied_prob': implied_yes_i,
                'edge': edge_yes_i,
                'is_win': is_win,
                'profit_raw': profit_raw,
                'profit_fair': profit_fair,
                'stake': stake,
            })
    
    # ========== NO SIDE ==========
    for threshold in thresholds_no:
        # Place NO bet if model confidence >= threshold AND odds available
        mask_no = (p_no >= threshold) & ~np.isnan(no_odds)
        idx_no = np.where(mask_no)[0]
        
        for i in idx_no:
            # Calculate implied probability and edge
            implied_no_i = 1.0 / fair_no[i] if fair_no[i] > 0 else np.nan
            edge_no_i = p_no[i] - implied_no_i
            
            # Determine if bet won (NO wins when y_true == 0)
            is_win = int(y_true[i] == 0)
            
            # Calculate profits
            if is_win:
                profit_raw = stake * (no_odds[i] - 1)
                profit_fair = stake * (fair_no[i] - 1)
            else:
                profit_raw = -stake
                profit_fair = -stake
            
            bet_records.append({
                'match_id': match_ids[i],
                'fold': fold_id,
                'side': 'NO',
                'threshold': threshold,
                'p_yes': p_yes[i],
                'p_no': p_no[i],
                'chosen_side_prob': p_no[i],
                'decimal_odds_used': no_odds[i],
                'fair_odds_used': fair_no[i],
                'implied_prob': implied_no_i,
                'edge': edge_no_i,
                'is_win': is_win,
                'profit_raw': profit_raw,
                'profit_fair': profit_fair,
                'stake': stake,
            })
    
    return pd.DataFrame(bet_records)


def simulate_kelly_bets(y_true, y_proba, yes_odds, kelly_fraction=0.25, bankroll=1000):
    """
    Simulate Kelly Criterion betting on BTTS YES
    
    Strategy:
    - Bet BTTS YES when model finds positive expected value
    - Use fractional Kelly for stake sizing: f = fraction * (bp - q) / b
        where:
        - b = odds - 1 (net odds)
        - p = model probability
        - q = 1 - p
        - fraction = kelly_fraction (0.25 = quarter Kelly)
    
    Args:
        y_true: Array of true BTTS outcomes (0/1)
        y_proba: Array of model BTTS probabilities
        yes_odds: Array of bookmaker BTTS YES odds (decimal)
        kelly_fraction: Fraction of Kelly to use (0.25 = conservative)
        bankroll: Starting bankroll (default 1000 units)
    
    Returns:
        dict with 'final_bankroll', 'roi', 'n_bets', 'max_drawdown'
    """
    # Filter for odds available
    valid_mask = pd.notna(yes_odds)
    
    if valid_mask.sum() == 0:
        return {
            'final_bankroll': bankroll,
            'roi': 0.0,
            'n_bets': 0,
            'max_drawdown': 0.0
        }
    
    y_true_bet = y_true[valid_mask]
    y_proba_bet = y_proba[valid_mask]
    yes_odds_bet = yes_odds[valid_mask]
    
    current_bankroll = bankroll
    max_bankroll = bankroll
    bankroll_history = [bankroll]
    n_bets = 0
    
    for i in range(len(y_true_bet)):
        p = y_proba_bet[i]  # Model probability
        odds = yes_odds_bet[i]
        b = odds - 1  # Net odds
        q = 1 - p
        
        # Calculate Kelly fraction: f = (bp - q) / b
        kelly_f = ((b * p) - q) / b if b > 0 else 0
        
        # Only bet if Kelly fraction is positive (edge exists)
        if kelly_f > 0:
            # Use fractional Kelly for safety
            stake = current_bankroll * kelly_f * kelly_fraction
            stake = min(stake, current_bankroll)  # Can't bet more than bankroll
            
            # Execute bet
            if y_true_bet[i] == 1:
                # Win
                profit = stake * b
                current_bankroll += profit
            else:
                # Loss
                current_bankroll -= stake
            
            n_bets += 1
            bankroll_history.append(current_bankroll)
            
            # Track max for drawdown calculation
            if current_bankroll > max_bankroll:
                max_bankroll = current_bankroll
    
    # Calculate metrics
    final_bankroll = current_bankroll
    roi = ((final_bankroll - bankroll) / bankroll) * 100
    
    # Calculate max drawdown
    peak = bankroll
    max_dd = 0
    for b in bankroll_history:
        if b > peak:
            peak = b
        dd = (peak - b) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd
    
    return {
        'final_bankroll': final_bankroll,
        'roi': roi,
        'n_bets': n_bets,
        'max_drawdown': max_dd * 100  # as percentage
    }


if __name__ == '__main__':
    print("Evaluation module loaded successfully!")
    print("Import this module to use evaluation functions.")
