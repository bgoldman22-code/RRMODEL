#!/usr/bin/env python3
# scripts/load-nflverse-results.py
# Load actual NFL results from NFLVerse for bias analysis

import nfl_data_py as nfl
import json
import requests
from datetime import datetime
import pandas as pd

class NFLResultsLoader:
    def __init__(self, prediction_url="https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate"):
        self.prediction_url = prediction_url
        self.results = []
        
    def fetch_actual_results(self, weeks=[1, 2], season=2025):
        """Fetch actual game results from NFLVerse"""
        print(f"Fetching NFL results for {season} weeks {weeks}...")
        
        try:
            # Load schedule and results
            schedule_df = nfl.import_schedules([season])
            
            # Filter to specified weeks with completed games
            completed_games = schedule_df[
                (schedule_df['week'].isin(weeks)) & 
                (schedule_df['home_score'].notna()) & 
                (schedule_df['away_score'].notna())
            ]
            
            print(f"Found {len(completed_games)} completed games")
            
            results = []
            for _, game in completed_games.iterrows():
                # Calculate actual spread (home team perspective)
                actual_spread = game['home_score'] - game['away_score']
                actual_total = game['home_score'] + game['away_score']
                
                result = {
                    "week": int(game['week']),
                    "game_id": f"{game['away_team']}_{game['home_team']}_week_{int(game['week'])}",
                    "home_team": game['home_team'],
                    "away_team": game['away_team'], 
                    "home_score": int(game['home_score']),
                    "away_score": int(game['away_score']),
                    "actual_spread": actual_spread,  # Positive = home team won by X
                    "actual_total": actual_total,
                    "gameday": game['gameday'].strftime('%Y-%m-%d') if pd.notna(game['gameday']) else None,
                    
                    # Include betting lines if available in NFLVerse
                    "closing_spread": game.get('spread_line', None),
                    "closing_total": game.get('total_line', None),
                    "home_moneyline": game.get('home_moneyline', None),
                    "away_moneyline": game.get('away_moneyline', None)
                }
                
                results.append(result)
            
            self.results = results
            print(f"Loaded {len(results)} game results")
            return results
            
        except Exception as e:
            print(f"Error fetching results: {e}")
            return []
    
    def fetch_your_predictions(self, games_data):
        """Fetch what your model predicted for these games"""
        print("Fetching your model's predictions for historical games...")
        
        predictions_with_results = []
        
        for result in games_data:
            try:
                # Prepare game data in your API format
                game_input = {
                    "home_team": result["home_team"],
                    "away_team": result["away_team"],
                    "game_id": result["game_id"]
                }
                
                # Call your prediction API
                response = requests.post(
                    self.prediction_url,
                    json={
                        "games": [game_input],
                        "season": "2025"
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=30
                )
                
                if response.status_code == 200:
                    prediction_data = response.json()
                    
                    if isinstance(prediction_data, dict) and 'predictions' in prediction_data:
                        predictions = prediction_data['predictions']
                    else:
                        predictions = prediction_data
                    
                    if predictions and len(predictions) > 0:
                        pred = predictions[0]
                        
                        # Extract predictions
                        ml_pred = pred.get('predictions', {}).get('moneyline', {})
                        spread_pred = pred.get('predictions', {}).get('spread', {})
                        total_pred = pred.get('predictions', {}).get('total', {})
                        
                        # Combine with actual results
                        combined = {
                            **result,  # Actual results
                            "predictions": {
                                "ml_pick": ml_pred.get('pick'),
                                "ml_confidence": ml_pred.get('confidence'),
                                "ml_edge": ml_pred.get('edge'),
                                
                                "spread_pick": spread_pred.get('pick'),
                                "spread_confidence": spread_pred.get('confidence'), 
                                "spread_predicted": spread_pred.get('predicted'),
                                "spread_edge": spread_pred.get('edge'),
                                
                                "total_pick": total_pred.get('pick'),
                                "total_confidence": total_pred.get('confidence'),
                                "total_predicted": total_pred.get('predicted'),
                                "total_edge": total_pred.get('edge')
                            }
                        }
                        
                        predictions_with_results.append(combined)
                        print(f"✓ {result['away_team']} @ {result['home_team']}")
                    else:
                        print(f"✗ No predictions returned for {result['game_id']}")
                        
                else:
                    print(f"✗ API error for {result['game_id']}: {response.status_code}")
                    
            except Exception as e:
                print(f"✗ Error getting predictions for {result['game_id']}: {e}")
        
        print(f"Successfully matched {len(predictions_with_results)} games with predictions")
        return predictions_with_results
    
    def analyze_prediction_accuracy(self, data):
        """Analyze how well your model performed"""
        if not data:
            return {"error": "No data to analyze"}
        
        analysis = {
            "summary": {
                "total_games": len(data),
                "ml_wins": 0,
                "spread_wins": 0, 
                "total_wins": 0,
                "ml_accuracy": 0,
                "spread_accuracy": 0,
                "total_accuracy": 0
            },
            "bias_analysis": {
                "home_pick_rate": 0,
                "favorite_pick_rate": 0, 
                "over_pick_rate": 0,
                "avg_spread_error": 0,
                "avg_total_error": 0
            },
            "confidence_calibration": {},
            "detailed_results": []
        }
        
        ml_correct = 0
        spread_correct = 0
        total_correct = 0
        home_picks = 0
        over_picks = 0
        spread_errors = []
        total_errors = []
        confidence_buckets = {"50-60": [], "60-70": [], "70-80": [], "80+": []}
        
        for game in data:
            pred = game.get("predictions", {})
            
            # Moneyline analysis
            ml_pick = pred.get("ml_pick")
            if ml_pick:
                actual_winner = game["home_team"] if game["actual_spread"] > 0 else game["away_team"]
                if game["actual_spread"] == 0:  # Tie
                    actual_winner = "tie" 
                
                if ml_pick == actual_winner:
                    ml_correct += 1
                
                # Home bias check
                if ml_pick == game["home_team"]:
                    home_picks += 1
            
            # Spread analysis  
            spread_pick = pred.get("spread_pick")
            spread_predicted = pred.get("spread_predicted")
            
            if spread_pick and spread_predicted is not None:
                # Your model's prediction vs actual
                spread_error = abs(spread_predicted - game["actual_spread"])
                spread_errors.append(spread_error)
                
                # Did the pick win? (simplified - assumes your pick was correct direction)
                if spread_pick == game["home_team"] and game["actual_spread"] > 0:
                    spread_correct += 1
                elif spread_pick == game["away_team"] and game["actual_spread"] < 0:
                    spread_correct += 1
                elif spread_pick == "push":
                    spread_correct += 0.5  # Half credit for pushes
            
            # Total analysis
            total_pick = pred.get("total_pick")
            total_predicted = pred.get("total_predicted")
            
            if total_pick and total_predicted is not None:
                total_error = abs(total_predicted - game["actual_total"])
                total_errors.append(total_error)
                
                if total_pick == "over":
                    over_picks += 1
                
                # Did total pick win?
                if total_pick == "over" and game["actual_total"] > total_predicted:
                    total_correct += 1
                elif total_pick == "under" and game["actual_total"] < total_predicted:
                    total_correct += 1
            
            # Confidence calibration
            ml_conf = pred.get("ml_confidence", 50)
            ml_was_correct = (ml_pick == actual_winner) if ml_pick else False
            
            if ml_conf >= 80:
                confidence_buckets["80+"].append(ml_was_correct)
            elif ml_conf >= 70:
                confidence_buckets["70-80"].append(ml_was_correct)
            elif ml_conf >= 60:
                confidence_buckets["60-70"].append(ml_was_correct)
            else:
                confidence_buckets["50-60"].append(ml_was_correct)
            
            # Store detailed result
            analysis["detailed_results"].append({
                "game": f"{game['away_team']} @ {game['home_team']}",
                "actual_score": f"{game['away_score']}-{game['home_score']}", 
                "ml_result": "✓" if ml_was_correct else "✗",
                "spread_error": spread_errors[-1] if spread_errors else None,
                "total_error": total_errors[-1] if total_errors else None
            })
        
        # Calculate final metrics
        total_games = len(data)
        analysis["summary"]["ml_accuracy"] = round(ml_correct / total_games * 100, 1)
        analysis["summary"]["spread_accuracy"] = round(spread_correct / total_games * 100, 1) 
        analysis["summary"]["total_accuracy"] = round(total_correct / total_games * 100, 1)
        
        analysis["bias_analysis"]["home_pick_rate"] = round(home_picks / total_games * 100, 1)
        analysis["bias_analysis"]["over_pick_rate"] = round(over_picks / total_games * 100, 1)
        
        if spread_errors:
            analysis["bias_analysis"]["avg_spread_error"] = round(sum(spread_errors) / len(spread_errors), 2)
        if total_errors:
            analysis["bias_analysis"]["avg_total_error"] = round(sum(total_errors) / len(total_errors), 2)
        
        # Confidence calibration analysis
        for bucket, results in confidence_buckets.items():
            if results:
                accuracy = sum(results) / len(results) * 100
                analysis["confidence_calibration"][bucket] = {
                    "games": len(results),
                    "accuracy": round(accuracy, 1),
                    "well_calibrated": abs(accuracy - float(bucket.split('-')[0])) < 10
                }
        
        return analysis
    
    def save_results(self, data, filename=None):
        """Save results to JSON file"""
        if not filename:
            filename = f"nfl_results_analysis_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
        
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        
        print(f"Results saved to {filename}")
        return filename

def main():
    """Main execution function"""
    print("NFL Prediction Analysis using NFLVerse Data")
    print("=" * 50)
    
    loader = NFLResultsLoader()
    
    # Step 1: Get actual results from NFLVerse
    actual_results = loader.fetch_actual_results(weeks=[1, 2], season=2025)
    
    if not actual_results:
        print("No results found. Check if games have been completed.")
        return
    
    # Step 2: Get your model's predictions for those games
    prediction_results = loader.fetch_your_predictions(actual_results)
    
    if not prediction_results:
        print("No predictions could be retrieved.")
        return
    
    # Step 3: Analyze accuracy
    analysis = loader.analyze_prediction_accuracy(prediction_results)
    
    # Step 4: Display results
    print("\n" + "="*50)
    print("PREDICTION ANALYSIS RESULTS")
    print("="*50)
    
    print(f"\nACCURACY SUMMARY:")
    print(f"Moneyline: {analysis['summary']['ml_accuracy']}%")
    print(f"Spreads: {analysis['summary']['spread_accuracy']}%") 
    print(f"Totals: {analysis['summary']['total_accuracy']}%")
    
    print(f"\nBIAS ANALYSIS:")
    print(f"Home team pick rate: {analysis['bias_analysis']['home_pick_rate']}% (should be ~50%)")
    print(f"Over pick rate: {analysis['bias_analysis']['over_pick_rate']}% (should be ~50%)")
    print(f"Average spread error: {analysis['bias_analysis']['avg_spread_error']} points")
    print(f"Average total error: {analysis['bias_analysis']['avg_total_error']} points")
    
    print(f"\nCONFIDENCE CALIBRATION:")
    for bucket, data in analysis['confidence_calibration'].items():
        status = "✓" if data['well_calibrated'] else "⚠"
        print(f"{bucket}%: {data['accuracy']}% accuracy ({data['games']} games) {status}")
    
    # Step 5: Save detailed results
    filename = loader.save_results({
        "analysis": analysis,
        "raw_data": prediction_results,
        "metadata": {
            "analysis_date": datetime.now().isoformat(),
            "weeks_analyzed": [1, 2],
            "season": 2025
        }
    })
    
    print(f"\n✓ Complete analysis saved to {filename}")
    
    # Step 6: Generate recommendations
    print(f"\nRECOMMENDATIONS:")
    
    if analysis['bias_analysis']['home_pick_rate'] > 60:
        print("• REDUCE home field advantage - showing home bias")
    
    if analysis['bias_analysis']['over_pick_rate'] > 60:
        print("• REDUCE total predictions - showing over bias")
        
    if analysis['summary']['total_accuracy'] < 45:
        print("• MAJOR totals calibration needed - accuracy too low")
        
    if analysis['bias_analysis']['avg_spread_error'] > 8:
        print("• Spread predictions need calibration - error too high")
    
    for bucket, data in analysis['confidence_calibration'].items():
        if not data['well_calibrated'] and data['games'] > 3:
            print(f"• Confidence calibration off for {bucket}% games")

if __name__ == "__main__":
    main()
