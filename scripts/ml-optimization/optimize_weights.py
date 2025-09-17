# scripts/ml-optimization/optimize_weights.py
# Machine Learning Parameter Optimization for NFL Prediction Model
# Run this to automatically optimize all model weights based on historical performance

import json
import numpy as np
from scipy.optimize import minimize, differential_evolution
import requests
import os
from datetime import datetime
import pandas as pd

class NFLModelOptimizer:
    def __init__(self, base_url="https://bgroundrobin.com"):
        self.base_url = base_url
        self.historical_results = []
        self.current_weights = {}
        self.optimization_results = {}
        
    def load_historical_results(self, weeks=[1, 2]):
        """Load actual game results for Weeks 1-2 to train optimization"""
        # This would load your actual results data
        # For now, using placeholder structure
        print(f"Loading historical results for weeks: {weeks}")
        
        # Example structure - replace with actual data loading
        self.historical_results = [
            {
                "week": 1,
                "home_team": "KC",
                "away_team": "DET", 
                "final_home_score": 21,
                "final_away_score": 20,
                "closing_spread": -6.5,  # KC favored
                "closing_total": 47.5,
                "home_covered": False,  # KC didn't cover
                "total_result": "under"
            }
            # Add all 32 games from Weeks 1-2 here
        ]
        
        print(f"Loaded {len(self.historical_results)} historical games")
        return self.historical_results
    
    def load_current_weights(self):
        """Extract current model weights from prediction engine"""
        self.current_weights = {
            # Base weights
            "pressure_diff": 0.22,
            "explosive_diff": 0.18, 
            "turnover_diff": 0.12,
            "rz_td": 0.15,
            "third_down": 0.10,
            "eds": 0.08,
            "fourth_down_agg": 0.06,
            "penalty_diff": 0.05,
            "top_eff": 0.04,
            
            # Advanced weights
            "form": 0.08,
            "consistency": 0.02,
            "tempo": 0.02,
            "formations": 0.02,
            "script_adaptation": 0.01,
            
            # Special teams weights
            "field_goal_net": 0.025,
            "punt_net": 0.015,
            "return_advantage": 0.008,
            "coverage_efficiency": 0.002,
            
            # Scoring multipliers
            "core_epa_multiplier": 25,
            "tier_base_multiplier": 8,
            "advanced_base_multiplier": 6,
            "matchup_base_multiplier": 3.2,
            "special_teams_multiplier": 3,
            
            # Bias correction parameters
            "home_field_advantage": 2.2,
            "base_points_per_team": 24.0,
            "defensive_drag_multiplier": 25,
            "explosive_scoring_boost": 8,
            "neutral_conditions_boost": 1.5
        }
        
        print(f"Loaded {len(self.current_weights)} current weight parameters")
        return self.current_weights
    
    def weights_to_array(self, weights_dict):
        """Convert weights dictionary to optimization array"""
        return np.array(list(weights_dict.values()))
    
    def array_to_weights(self, weights_array):
        """Convert optimization array back to weights dictionary"""
        keys = list(self.current_weights.keys())
        return dict(zip(keys, weights_array))
    
    def run_predictions_with_weights(self, weights_dict, test_games):
        """Run prediction engine with custom weights"""
        # This would call your prediction API with modified weights
        # For optimization, we simulate this with a simplified model
        
        predictions = []
        for game in test_games:
            # Simplified prediction logic for optimization
            # In reality, this would call your full prediction engine
            
            # Simulate spread prediction
            predicted_spread = (
                weights_dict["pressure_diff"] * 2.5 +  # Mock pressure advantage
                weights_dict["explosive_diff"] * 1.8 +  # Mock explosive advantage  
                weights_dict["home_field_advantage"]    # Home field
            )
            
            # Simulate total prediction
            predicted_total = (
                weights_dict["base_points_per_team"] * 2 +
                weights_dict["explosive_scoring_boost"] * 0.5 +
                weights_dict["neutral_conditions_boost"]
            )
            
            predictions.append({
                "game_id": f"{game['away_team']}_{game['home_team']}",
                "predicted_spread": predicted_spread,
                "predicted_total": predicted_total,
                "actual_spread": game["final_home_score"] - game["final_away_score"],
                "actual_total": game["final_home_score"] + game["final_away_score"],
                "closing_spread": game["closing_spread"],
                "closing_total": game["closing_total"]
            })
        
        return predictions
    
    def calculate_prediction_accuracy(self, predictions):
        """Calculate accuracy metrics for optimization objective"""
        spread_errors = []
        total_errors = []
        
        for pred in predictions:
            # Spread error (model vs actual)
            spread_error = abs(pred["predicted_spread"] - pred["actual_spread"])
            spread_errors.append(spread_error)
            
            # Total error (model vs actual)  
            total_error = abs(pred["predicted_total"] - pred["actual_total"])
            total_errors.append(total_error)
        
        spread_mae = np.mean(spread_errors)
        total_mae = np.mean(total_errors)
        
        # Combined objective (weight totals more heavily due to worse performance)
        combined_error = spread_mae + (total_mae * 1.5)  # 1.5x weight on totals
        
        return {
            "spread_mae": spread_mae,
            "total_mae": total_mae, 
            "combined_error": combined_error,
            "spread_errors": spread_errors,
            "total_errors": total_errors
        }
    
    def objective_function(self, weights_array):
        """Objective function for optimization (minimize prediction error)"""
        try:
            # Convert array to weights
            weights_dict = self.array_to_weights(weights_array)
            
            # Run predictions with these weights
            predictions = self.run_predictions_with_weights(weights_dict, self.historical_results)
            
            # Calculate accuracy
            accuracy = self.calculate_prediction_accuracy(predictions)
            
            # Return error to minimize
            return accuracy["combined_error"]
            
        except Exception as e:
            print(f"Error in objective function: {e}")
            return 999  # High penalty for invalid weights
    
    def define_optimization_bounds(self):
        """Define reasonable bounds for each parameter"""
        bounds = []
        
        for param, current_value in self.current_weights.items():
            if "multiplier" in param:
                # Multipliers can vary more widely
                bounds.append((current_value * 0.5, current_value * 2.0))
            elif param == "home_field_advantage":
                # Home field advantage between 1.0 and 3.5 points
                bounds.append((1.0, 3.5))
            elif param == "base_points_per_team":
                # Base scoring between 20 and 28 points per team
                bounds.append((20.0, 28.0))
            elif param in ["defensive_drag_multiplier", "explosive_scoring_boost"]:
                # These can vary significantly
                bounds.append((current_value * 0.3, current_value * 3.0))
            elif param in ["neutral_conditions_boost"]:
                # Small boost parameters
                bounds.append((0.0, 5.0))
            else:
                # Weight parameters - stay within reasonable ranges
                if current_value < 0.01:
                    bounds.append((0.001, 0.02))
                elif current_value < 0.05:
                    bounds.append((0.005, 0.15))
                elif current_value < 0.20:
                    bounds.append((0.05, 0.35))
                else:
                    bounds.append((0.10, 0.40))
        
        return bounds
    
    def run_optimization(self, method="differential_evolution"):
        """Run the optimization process"""
        print(f"Starting optimization with method: {method}")
        print(f"Optimizing {len(self.current_weights)} parameters")
        
        # Get bounds
        bounds = self.define_optimization_bounds()
        
        # Initial guess (current weights)
        x0 = self.weights_to_array(self.current_weights)
        
        if method == "differential_evolution":
            # Global optimization - good for avoiding local minima
            result = differential_evolution(
                self.objective_function,
                bounds,
                seed=42,
                maxiter=100,
                popsize=15,
                polish=True
            )
        else:
            # Local optimization - faster but may find local minima
            result = minimize(
                self.objective_function,
                x0,
                bounds=bounds,
                method='L-BFGS-B'
            )
        
        # Convert result back to weights
        optimized_weights = self.array_to_weights(result.x)
        
        # Calculate improvement
        original_error = self.objective_function(x0)
        optimized_error = result.fun
        improvement = ((original_error - optimized_error) / original_error) * 100
        
        self.optimization_results = {
            "success": result.success,
            "original_error": original_error,
            "optimized_error": optimized_error,
            "improvement_percent": improvement,
            "optimized_weights": optimized_weights,
            "optimization_details": {
                "method": method,
                "iterations": getattr(result, 'nit', 'N/A'),
                "function_evaluations": getattr(result, 'nfev', 'N/A'),
                "message": getattr(result, 'message', 'N/A')
            }
        }
        
        print(f"Optimization completed!")
        print(f"Original error: {original_error:.3f}")
        print(f"Optimized error: {optimized_error:.3f}")
        print(f"Improvement: {improvement:.1f
