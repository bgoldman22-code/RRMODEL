#!/usr/bin/env python3
"""
Quick Start Guide - BTTS Research Pipeline

This script provides a simplified entry point for the research pipeline.
It checks dependencies, verifies data, and launches the experiment.
"""

import sys
from pathlib import Path
import subprocess

def print_banner():
    banner = """
    ╔════════════════════════════════════════════════════════════════╗
    ║                                                                ║
    ║         🌟 BTTS NORTHERN STAR DISCOVERY PIPELINE 🌟           ║
    ║                                                                ║
    ║   Comprehensive research to identify strongest BTTS           ║
    ║   predictors and train state-of-the-art models                ║
    ║                                                                ║
    ╚════════════════════════════════════════════════════════════════╝
    """
    print(banner)

def check_dependencies():
    """Check if required packages are installed"""
    print("\n🔍 Checking dependencies...")
    
    required = [
        'pandas', 'numpy', 'scikit-learn', 'lightgbm', 
        'xgboost', 'catboost', 'optuna', 'shap', 'matplotlib'
    ]
    
    missing = []
    for package in required:
        try:
            __import__(package)
            print(f"   ✅ {package}")
        except ImportError:
            print(f"   ❌ {package} - MISSING")
            missing.append(package)
    
    if missing:
        print(f"\n⚠️  Missing packages: {', '.join(missing)}")
        print("   Install with: pip install -r requirements.txt")
        return False
    
    print("\n✅ All dependencies satisfied!")
    return True

def check_data():
    """Check if external data is available"""
    print("\n🔍 Checking external data...")
    
    base_dir = Path(__file__).parent.parent.parent / 'scripts' / 'data' / 'premier_league'
    
    api_file = base_dir / 'api_football_statistics.csv'
    fpl_file = base_dir / 'fpl_player_context.csv'
    
    data_ok = True
    
    if api_file.exists():
        print(f"   ✅ API-Football data found ({api_file.name})")
    else:
        print(f"   ❌ API-Football data NOT found")
        print(f"      Expected: {api_file}")
        data_ok = False
    
    if fpl_file.exists():
        print(f"   ✅ FPL data found ({fpl_file.name})")
    else:
        print(f"   ❌ FPL data NOT found")
        print(f"      Expected: {fpl_file}")
        data_ok = False
    
    if not data_ok:
        print("\n⚠️  External data missing!")
        print("   Run these commands first:")
        print("   1. python3 scripts/soccer/fetchers/fetch_api_football.py")
        print("   2. python3 scripts/soccer/fetchers/fetch_fpl_data.py")
        return False
    
    print("\n✅ External data ready!")
    return True

def show_menu():
    """Show interactive menu"""
    print("\n" + "=" * 70)
    print("QUICK START OPTIONS")
    print("=" * 70)
    print("\n1. Run complete pipeline (30 min)")
    print("   → Loads data, engineers features, trains 6 models, ranks features")
    print("\n2. Load & explore data only (2 min)")
    print("   → Check data quality, coverage, basic stats")
    print("\n3. Feature engineering only (3 min)")
    print("   → Build L5/L10 rolling features")
    print("\n4. Feature importance only (5 min)")
    print("   → Discover top indicators with MI + RF + SHAP")
    print("\n5. Train baselines only (2 min)")
    print("   → Phase 1: Logistic, Poisson, Random Forest")
    print("\n6. Train modern ML only (20 min)")
    print("   → Phase 2: LightGBM, XGBoost, CatBoost with Optuna")
    print("\n7. Exit")
    
    choice = input("\nSelect option (1-7): ").strip()
    return choice

def run_option(choice):
    """Execute selected option"""
    src_dir = Path(__file__).parent / 'src'
    
    if choice == '1':
        print("\n🚀 Launching complete pipeline...")
        subprocess.run([sys.executable, 'RUN_EXPERIMENT.py'])
    
    elif choice == '2':
        print("\n📥 Loading data...")
        subprocess.run([sys.executable, str(src_dir / 'load_data.py')])
    
    elif choice == '3':
        print("\n🔧 Engineering features...")
        subprocess.run([sys.executable, str(src_dir / 'build_features.py')])
    
    elif choice == '4':
        print("\n🔍 Analyzing feature importance...")
        subprocess.run([sys.executable, str(src_dir / 'feature_importance.py')])
    
    elif choice == '5':
        print("\n📊 Training baseline models...")
        subprocess.run([sys.executable, str(src_dir / 'model_baselines.py')])
    
    elif choice == '6':
        print("\n⚡ Training modern ML models...")
        subprocess.run([sys.executable, str(src_dir / 'model_ml.py')])
    
    elif choice == '7':
        print("\n👋 Goodbye!")
        return False
    
    else:
        print("\n❌ Invalid option. Please select 1-7.")
    
    return True

def main():
    """Main entry point"""
    print_banner()
    
    # Check system readiness
    if not check_dependencies():
        print("\n❌ Please install dependencies first.")
        print("   Run: pip install -r requirements.txt")
        return
    
    if not check_data():
        print("\n❌ Please run data fetchers first.")
        return
    
    # Show menu and run
    while True:
        choice = show_menu()
        if not run_option(choice):
            break
        
        if choice != '7':
            input("\nPress Enter to continue...")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Interrupted by user. Goodbye!")
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
