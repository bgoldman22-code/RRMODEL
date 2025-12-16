# DEBUG: Test the prepare_features_ml function

import pandas as pd
import numpy as np
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / 'src'))

from model_ml import prepare_features_ml

# Create fake train and test data
np.random.seed(42)

train_df = pd.DataFrame({
    'btts': [1, 0, 1, 0, 1],
    'feature1': [1.0, 2.0, np.nan, 4.0, 5.0],
    'feature2': [10.0, 20.0, 30.0, np.nan, 50.0],
    'date': pd.date_range('2023-01-01', periods=5),
    'home_norm': ['A', 'B', 'C', 'D', 'E'],
    'away_norm': ['F', 'G', 'H', 'I', 'J'],
})

test_df = pd.DataFrame({
    'btts': [0, 1, 0],
    'feature1': [6.0, np.nan, 8.0],
    'feature2': [60.0, 70.0, np.nan],
    'date': pd.date_range('2023-01-06', periods=3),
    'home_norm': ['K', 'L', 'M'],
    'away_norm': ['N', 'O', 'P'],
})

print("="*80)
print("TESTING PREPARE_FEATURES_ML")
print("="*80)

print("\nTRAIN DATA:")
print(train_df)
print("\nTEST DATA:")
print(test_df)

# Test the function
X_train, y_train, X_test, y_test, feature_names = prepare_features_ml(train_df, test_df)

print("\n" + "="*80)
print("RESULTS")
print("="*80)

print(f"\nFeature names: {feature_names}")

print(f"\nTRAIN medians computed from train_df:")
train_feature1_median = train_df['feature1'].median()
train_feature2_median = train_df['feature2'].median()
print(f"  feature1 median: {train_feature1_median}")
print(f"  feature2 median: {train_feature2_median}")

print(f"\nX_train (should fill NaN with train medians):")
print(X_train)
print(f"Expected feature1 row 2 = {train_feature1_median} (was NaN)")
print(f"Expected feature2 row 3 = {train_feature2_median} (was NaN)")

print(f"\nX_test (should ALSO fill NaN with TRAIN medians):")
print(X_test)
print(f"Expected feature1 row 1 = {train_feature1_median} (was NaN)")
print(f"Expected feature2 row 2 = {train_feature2_median} (was NaN)")

print(f"\nCHECK: If test medians were used instead, they would be:")
test_feature1_median = test_df['feature1'].median()
test_feature2_median = test_df['feature2'].median()
print(f"  feature1 test median: {test_feature1_median}")
print(f"  feature2 test median: {test_feature2_median}")

if X_test[1, 0] == train_feature1_median:
    print("\n✅ CORRECT: Test uses TRAIN medians (no leakage)")
elif X_test[1, 0] == test_feature1_median:
    print("\n❌ BUG: Test uses TEST medians (LEAKAGE!)")
else:
    print(f"\n❓ UNKNOWN: Test feature1[1] = {X_test[1, 0]}")

print("="*80)
