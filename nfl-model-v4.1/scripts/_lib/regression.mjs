/**
 * Linear Regression Utilities for V5 Coefficient Fitting
 * 
 * Implements ordinary least squares (OLS) regression for fitting
 * spread and total model coefficients.
 */

/**
 * Perform simple linear regression
 * 
 * Fits: y = β₀ + β₁*x₁ + β₂*x₂ + ... + βₙ*xₙ
 * 
 * @param {Array<Array<number>>} X - Feature matrix (each row is a sample, each column is a feature)
 * @param {Array<number>} y - Target values
 * @param {Array<string>} featureNames - Names of features (for reporting)
 * @returns {Object} Regression results with coefficients, R², MAE, RMSE, etc.
 */
export function ordinaryLeastSquares(X, y, featureNames = []) {
  const n = X.length;  // Number of samples
  const p = X[0].length;  // Number of features
  
  if (n !== y.length) {
    throw new Error(`Dimension mismatch: X has ${n} rows but y has ${y.length} values`);
  }
  
  // Add intercept column (all ones) to X
  const X_with_intercept = X.map(row => [1, ...row]);
  
  // Compute coefficients using normal equation: β = (X'X)⁻¹X'y
  const coefficients = solveNormalEquation(X_with_intercept, y);
  
  // Compute predictions
  const predictions = X_with_intercept.map(row =>
    row.reduce((sum, x, i) => sum + x * coefficients[i], 0)
  );
  
  // Compute residuals
  const residuals = y.map((yi, i) => yi - predictions[i]);
  
  // Compute R² (coefficient of determination)
  const yMean = y.reduce((sum, yi) => sum + yi, 0) / n;
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  const ssRes = residuals.reduce((sum, r) => sum + r * r, 0);
  const r2 = 1 - (ssRes / ssTot);
  
  // Compute MAE and RMSE
  const mae = residuals.reduce((sum, r) => sum + Math.abs(r), 0) / n;
  const rmse = Math.sqrt(ssRes / n);
  
  // Format coefficients with feature names
  const namedCoefficients = {
    intercept: coefficients[0]
  };
  for (let i = 0; i < p; i++) {
    const name = featureNames[i] || `x${i + 1}`;
    namedCoefficients[name] = coefficients[i + 1];
  }
  
  return {
    coefficients: namedCoefficients,
    coefficientsArray: coefficients,
    predictions,
    residuals,
    metrics: {
      r2,
      r2_adjusted: 1 - ((1 - r2) * (n - 1) / (n - p - 1)),
      mae,
      rmse,
      mse: ssRes / n,
      n_samples: n,
      n_features: p
    },
    diagnostics: computeDiagnostics(residuals, predictions, y)
  };
}

/**
 * Solve normal equation: (X'X)β = X'y
 * 
 * Uses Cholesky decomposition for numerical stability
 */
function solveNormalEquation(X, y) {
  const n = X.length;
  const p = X[0].length;
  
  // Compute X'X
  const XtX = new Array(p).fill(0).map(() => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * X[k][j];
      }
      XtX[i][j] = sum;
      if (i !== j) XtX[j][i] = sum;  // Symmetric
    }
  }
  
  // Compute X'y
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      sum += X[k][i] * y[k];
    }
    Xty[i] = sum;
  }
  
  // Solve XtX * β = Xty using Gaussian elimination
  return gaussianElimination(XtX, Xty);
}

/**
 * Gaussian elimination to solve Aβ = b
 */
function gaussianElimination(A, b) {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);
  
  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    
    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }
  
  // Back substitution
  const solution = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    solution[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      solution[i] -= augmented[i][j] * solution[j];
    }
    solution[i] /= augmented[i][i];
  }
  
  return solution;
}

/**
 * Compute diagnostic statistics for residuals
 */
function computeDiagnostics(residuals, predictions, actuals) {
  const n = residuals.length;
  
  // Residual statistics
  const residualMean = residuals.reduce((sum, r) => sum + r, 0) / n;
  const residualStd = Math.sqrt(
    residuals.reduce((sum, r) => sum + Math.pow(r - residualMean, 2), 0) / (n - 1)
  );
  
  // Percentiles of residuals
  const sortedResiduals = [...residuals].sort((a, b) => a - b);
  const p25 = sortedResiduals[Math.floor(n * 0.25)];
  const p50 = sortedResiduals[Math.floor(n * 0.50)];
  const p75 = sortedResiduals[Math.floor(n * 0.75)];
  
  // Prediction vs actual correlation
  const predMean = predictions.reduce((sum, p) => sum + p, 0) / n;
  const actualMean = actuals.reduce((sum, a) => sum + a, 0) / n;
  
  let covPredActual = 0;
  let varPred = 0;
  let varActual = 0;
  
  for (let i = 0; i < n; i++) {
    const predDiff = predictions[i] - predMean;
    const actualDiff = actuals[i] - actualMean;
    covPredActual += predDiff * actualDiff;
    varPred += predDiff * predDiff;
    varActual += actualDiff * actualDiff;
  }
  
  const correlation = covPredActual / Math.sqrt(varPred * varActual);
  
  return {
    residual_mean: residualMean,
    residual_std: residualStd,
    residual_p25: p25,
    residual_median: p50,
    residual_p75: p75,
    residual_min: Math.min(...residuals),
    residual_max: Math.max(...residuals),
    prediction_correlation: correlation
  };
}

/**
 * Perform k-fold cross-validation
 * 
 * @param {Array<Array<number>>} X - Feature matrix
 * @param {Array<number>} y - Target values
 * @param {number} k - Number of folds
 * @param {Array<string>} featureNames - Feature names
 * @returns {Object} Cross-validation results
 */
export function crossValidate(X, y, k = 5, featureNames = []) {
  const n = X.length;
  const foldSize = Math.floor(n / k);
  
  const foldResults = [];
  
  for (let fold = 0; fold < k; fold++) {
    // Split into train and test
    const testStart = fold * foldSize;
    const testEnd = fold === k - 1 ? n : (fold + 1) * foldSize;
    
    const X_train = [...X.slice(0, testStart), ...X.slice(testEnd)];
    const y_train = [...y.slice(0, testStart), ...y.slice(testEnd)];
    const X_test = X.slice(testStart, testEnd);
    const y_test = y.slice(testStart, testEnd);
    
    // Fit model on training data
    const model = ordinaryLeastSquares(X_train, y_train, featureNames);
    
    // Predict on test data
    const testPredictions = X_test.map(row => {
      const rowWithIntercept = [1, ...row];
      return rowWithIntercept.reduce((sum, x, i) => sum + x * model.coefficientsArray[i], 0);
    });
    
    // Compute test metrics
    const testResiduals = y_test.map((yi, i) => yi - testPredictions[i]);
    const testMAE = testResiduals.reduce((sum, r) => sum + Math.abs(r), 0) / y_test.length;
    const testRMSE = Math.sqrt(testResiduals.reduce((sum, r) => sum + r * r, 0) / y_test.length);
    
    foldResults.push({
      fold,
      train_size: X_train.length,
      test_size: X_test.length,
      test_mae: testMAE,
      test_rmse: testRMSE,
      coefficients: model.coefficients
    });
  }
  
  // Aggregate results
  const avgMAE = foldResults.reduce((sum, r) => sum + r.test_mae, 0) / k;
  const avgRMSE = foldResults.reduce((sum, r) => sum + r.test_rmse, 0) / k;
  
  return {
    k,
    folds: foldResults,
    average_test_mae: avgMAE,
    average_test_rmse: avgRMSE,
    std_test_mae: Math.sqrt(
      foldResults.reduce((sum, r) => sum + Math.pow(r.test_mae - avgMAE, 2), 0) / k
    ),
    std_test_rmse: Math.sqrt(
      foldResults.reduce((sum, r) => sum + Math.pow(r.test_rmse - avgRMSE, 2), 0) / k
    )
  };
}

/**
 * Quantile regression (simple implementation)
 * 
 * Fits a linear model to predict a specific quantile
 * 
 * @param {Array<Array<number>>} X - Feature matrix
 * @param {Array<number>} y - Target values
 * @param {number} tau - Quantile to fit (0 < tau < 1)
 * @param {Array<string>} featureNames - Feature names
 * @returns {Object} Quantile regression results
 */
export function quantileRegression(X, y, tau = 0.5, featureNames = []) {
  // For simplicity, use iterative reweighted least squares (IRLS)
  // This is an approximation; full quantile regression is more complex
  
  // Start with OLS as initial estimate
  let model = ordinaryLeastSquares(X, y, featureNames);
  
  // Iteratively reweight based on quantile loss
  const maxIterations = 10;
  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute weights based on quantile loss
    const weights = model.residuals.map(r => {
      return r >= 0 ? tau : (1 - tau);
    });
    
    // Weighted least squares
    const X_weighted = X.map((row, i) => row.map(x => x * Math.sqrt(weights[i])));
    const y_weighted = y.map((yi, i) => yi * Math.sqrt(weights[i]));
    
    model = ordinaryLeastSquares(X_weighted, y_weighted, featureNames);
  }
  
  return {
    ...model,
    tau,
    method: 'IRLS approximation'
  };
}
