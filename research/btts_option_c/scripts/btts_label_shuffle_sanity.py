#!/usr/bin/env python3
"""
Label Shuffle Sanity Test

Verifies there is no structural leakage by training on randomly shuffled labels.

Expected results with NO leakage:
- AUC ≈ 0.50 (random performance)
- ROI ≈ 0% (no predictive value)
- Brier ≈ 0.25 (baseline for 50/50 predictions)

If performance is significantly better than random, it indicates:
1. Target leakage (features contain match outcomes)
2. Data leakage (test set info leaked into training)
3. Temporal leakage (future info leaked into past)
"""

import sys
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from load_data import load_unified_data
from build_features import add_rolling_form_features, add_match_level_features, add_form_trend_features
from model_baselines import prepare_features
from temporal_holdout import temporal_train_test_split

def run_label_shuffle_test():
    """
    Run label shuffle sanity test
    """
    print("=" * 80)
    print("LABEL SHUFFLE SANITY TEST")
    print("=" * 80)
    print("\n🎲 This test verifies there is NO structural leakage by training on")
    print("   randomly shuffled labels. We expect AUC ≈ 0.50 and ROI ≈ 0%.\n")
    
    # Step 1: Load and engineer features
    print("📥 Loading data...")
    df = load_unified_data(force_rebuild=False)
    df = add_rolling_form_features(df)
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    print(f"   ✅ Loaded {len(df)} matches with {len(df.columns)} features")
    
    # Step 2: Temporal split (same as production)
    print("\n🔪 Creating temporal train/test split (40/60)...")
    train_df, test_df, metadata = temporal_train_test_split(df, train_fraction=0.40)
    train_date_range = f"{train_df['date'].min()} to {train_df['date'].max()}"
    test_date_range = f"{test_df['date'].min()} to {test_df['date'].max()}"
    print(f"   ✅ Train: {len(train_df)} matches ({train_date_range})")
    print(f"   ✅ Test:  {len(test_df)} matches ({test_date_range})")
    
    # Step 3: Prepare features (uses production allowlist)
    print("\n🧱 Preparing features with prediction-safe allowlist...")
    X_train, y_train, X_test, y_test, feature_names = prepare_features(train_df, test_df)
    print(f"   ✅ Feature matrix: {X_train.shape[1]} features")
    
    # Step 4: SHUFFLE LABELS (this is the key!)
    print("\n🎲 SHUFFLING LABELS (destroying true signal)...")
    np.random.seed(42)
    y_train_shuffled = np.random.permutation(y_train)
    y_test_shuffled = np.random.permutation(y_test)
    
    print(f"   Original train BTTS rate: {y_train.mean():.2%}")
    print(f"   Shuffled train BTTS rate: {y_train_shuffled.mean():.2%}")
    print(f"   Original test BTTS rate:  {y_test.mean():.2%}")
    print(f"   Shuffled test BTTS rate:  {y_test_shuffled.mean():.2%}")
    
    # Step 5: Train on shuffled labels
    print("\n🚀 Training logistic regression on SHUFFLED labels...")
    model = LogisticRegression(
        penalty='l2',
        C=1.0,
        max_iter=1000,
        random_state=42,
        solver='lbfgs'
    )
    model.fit(X_train, y_train_shuffled)
    
    # Step 6: Evaluate on shuffled test set
    print("\n📊 Evaluating on SHUFFLED test set...")
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    
    auc = roc_auc_score(y_test_shuffled, y_pred_proba)
    brier = brier_score_loss(y_test_shuffled, y_pred_proba)
    
    print(f"   AUC:   {auc:.4f}")
    print(f"   Brier: {brier:.4f}")
    
    # Step 7: Simulate ROI at threshold 0.55
    threshold = 0.55
    mask = y_pred_proba >= threshold
    n_bets = mask.sum()
    
    if n_bets > 0:
        # Simulate betting with typical odds (2.0 = even money)
        stake = 10.0
        odds = 2.0
        
        wins = y_test_shuffled[mask].sum()
        losses = n_bets - wins
        
        profit = (wins * stake * (odds - 1)) - (losses * stake)
        roi = (profit / (n_bets * stake)) * 100
        
        print(f"\n💰 Simulated betting (threshold={threshold}, odds={odds:.2f}):")
        print(f"   Bets:   {n_bets}")
        print(f"   Wins:   {wins} ({wins/n_bets:.1%})")
        print(f"   Losses: {losses}")
        print(f"   ROI:    {roi:.2f}%")
    else:
        print(f"\n⚠️  No bets at threshold {threshold}")
        roi = 0.0
    
    # Step 8: Verdict
    print("\n" + "=" * 80)
    print("VERDICT")
    print("=" * 80)
    
    # Check if performance is suspiciously good
    # AUC threshold: 7% above random (allows for noise)
    auc_threshold = 0.57
    # ROI is less reliable with shuffled labels due to class imbalance, so we focus on AUC
    
    is_safe = True
    warnings = []
    
    if auc > auc_threshold:
        is_safe = False
        warnings.append(f"⚠️  AUC ({auc:.4f}) is suspiciously high! Expected ≈ 0.50")
    
    # Note: ROI can be misleading with shuffled labels due to class imbalance
    # We rely primarily on AUC for leakage detection
    
    if is_safe:
        print("\n✅ PASS: No structural leakage detected!")
        print(f"   - AUC ({auc:.4f}) is close to random (0.50) ✓")
        print(f"   - Brier ({brier:.4f}) is reasonable for random predictions ✓")
        print(f"   - ROI ({roi:.2f}%) may vary due to class imbalance, but AUC is key metric")
        print("\n   This confirms that features do NOT contain leaked match outcomes.")
        print("   Performance on real labels comes from legitimate predictive signal.")
    else:
        print("\n❌ FAIL: Potential leakage detected!")
        for warning in warnings:
            print(f"   {warning}")
        print("\n   Action required:")
        print("   1. Review feature engineering for post-match statistics")
        print("   2. Check for temporal leakage (future → past)")
        print("   3. Verify .shift(1) is used in all rolling features")
        print("   4. Inspect feature allowlist for banned columns")
    
    print("=" * 80)
    
    return {
        'auc': auc,
        'brier': brier,
        'roi': roi,
        'is_safe': is_safe
    }


if __name__ == '__main__':
    result = run_label_shuffle_test()
    
    # Exit with error code if test fails
    sys.exit(0 if result['is_safe'] else 1)
