#!/usr/bin/env python3
"""
scripts/nfl/export-hybrid-reports.py

NFL Hybrid Model Report Generator

Generates two PNG reports:
1. Full Slate Analysis (all games, model vs market)
2. Recommended Picks with Stakes (filtered picks with color-coding)

USAGE:
    python3 scripts/nfl/export-hybrid-reports.py 2025 14

OUTPUT:
    ~/Downloads/nfl_full_slate_week14_2025.png
    ~/Downloads/nfl_recommended_picks_week14_2025.png
"""

import json
import sys
import os
from pathlib import Path
from datetime import datetime
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch
import numpy as np

# ========================================
# CONFIGURATION
# ========================================

DOWNLOADS_DIR = Path.home() / 'Downloads'
REPO_ROOT = Path(__file__).parent.parent.parent
OUTPUT_DIR = REPO_ROOT / 'output'

# Color scheme (matching NBA screenshots)
COLORS = {
    'background': '#1a1a2e',
    'header': '#16213e',
    'strong': '#4CAF50',      # Green
    'consider': '#FFC107',    # Yellow/Amber
    'track': '#f44336',       # Red
    'text': '#ffffff',
    'subtext': '#CCCCCC',
    'accent': '#00D9FF'
}

# ========================================
# HELPER: Load Hybrid Data
# ========================================

def load_hybrid_data(season, week):
    """Load hybrid predictions JSON"""
    json_path = OUTPUT_DIR / f'nfl_hybrid_{season}_week{week}.json'
    
    if not json_path.exists():
        raise FileNotFoundError(f'Hybrid data not found: {json_path}')
    
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    print(f'✅ Loaded hybrid data: {len(data["games"])} games')
    return data

# ========================================
# HELPER: Compute Win % from Spread
# ========================================

def spread_to_win_pct(spread_margin):
    """Convert spread margin to approximate win probability"""
    # Simple logistic conversion: P(win) ≈ 1 / (1 + exp(-0.25 × margin))
    # For margin in points (positive = home favored)
    import math
    return 1 / (1 + math.exp(-0.25 * spread_margin))

# ========================================
# HELPER: Compute Confidence % from Stakes
# ========================================

def units_to_confidence_pct(units, category):
    """Map units + category to confidence percentage"""
    if category == 'STRONG':
        return 75 + (units * 2.5)  # 75-85%
    elif category == 'CONSIDER':
        return 65 + (units * 2.5)  # 65-75%
    else:  # TRACK
        return 55 + (units * 2.5)  # 55-65%

# ========================================
# REPORT #1: Full Slate Analysis
# ========================================

def generate_full_slate_report(data, season, week):
    """Generate Full Slate Projections PNG with V5 vs V1 comparison"""
    
    games = data['games']
    date_str = datetime.now().strftime('%B %d, %Y')
    
    # Set up figure (wider to accommodate more columns)
    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(24, 4 + len(games) * 0.6))
    fig.patch.set_facecolor(COLORS['background'])
    ax.set_facecolor(COLORS['background'])
    ax.set_xlim(0, 140)
    ax.set_ylim(0, 10 + len(games) * 1.2)
    ax.axis('off')
    
    # Title
    y_pos = 10 + len(games) * 1.2 - 2
    title_box = FancyBboxPatch((5, y_pos), 130, 1.5,
                              boxstyle="round,pad=0.1",
                              facecolor=COLORS['header'],
                              edgecolor=COLORS['accent'],
                              linewidth=2)
    ax.add_patch(title_box)
    ax.text(70, y_pos + 1.0, 'NFL Hybrid Analysis - V5 vs V1 Model Comparison',
            fontsize=28, fontweight='bold', ha='center', va='center',
            color=COLORS['text'])
    ax.text(70, y_pos + 0.3, f'Date: {date_str}     Week {week}, {season}',
            fontsize=14, ha='center', va='center', color=COLORS['subtext'])
    
    # Table header
    y_pos -= 2.5
    header_box = FancyBboxPatch((5, y_pos), 130, 1.0,
                               boxstyle="round,pad=0.05",
                               facecolor=COLORS['header'],
                               edgecolor=COLORS['accent'],
                               linewidth=1)
    ax.add_patch(header_box)
    
    # Column headers (expanded to show V5 vs V1)
    headers = [
        ('Game', 15),
        ('V5 Spread', 28),
        ('V1 Spread', 41),
        ('Agree?', 50),
        ('V5 Total', 62),
        ('V1 Total', 74),
        ('Agree?', 83),
        ('Hybrid Pick', 96),
        ('Vegas Line', 110),
        ('Edge', 122),
        ('Units', 133)
    ]
    
    for header, x in headers:
        ax.text(x, y_pos + 0.5, header, fontsize=10, fontweight='bold',
                ha='center', va='center', color=COLORS['text'])
    
    # Table rows
    y_pos -= 1.5
    for i, game in enumerate(games):
        # Alternate row colors
        row_color = '#0f3460' if i % 2 == 0 else COLORS['header']
        row_box = FancyBboxPatch((5, y_pos - 0.5), 130, 1.0,
                                boxstyle="round,pad=0.02",
                                facecolor=row_color,
                                edgecolor='none')
        ax.add_patch(row_box)
        
        # Extract data
        matchup = game['matchup']
        v5_margin = game['model']['v5']['spread_home_margin']
        v1_margin = game['model']['v1']['home_margin']
        hybrid_margin = game['model']['hybrid']['spread_home_margin']
        
        v5_total = game['model']['v5']['total_p50']
        v1_total = game['model']['v1']['total_estimate']
        hybrid_total = game['model']['hybrid']['total_p50']
        
        spread_disagreement = game['meta']['spread_disagreement']
        total_disagreement = game['meta']['total_disagreement']
        
        market_spread = game['market']['spread_display']
        market_total = game['market']['total']
        
        # Spread agreement indicator
        spread_agree_color = COLORS['strong'] if abs(spread_disagreement) < 3 else (
            COLORS['consider'] if abs(spread_disagreement) < 5 else COLORS['track']
        )
        spread_agree_text = '✓' if abs(spread_disagreement) < 3 else (
            '~' if abs(spread_disagreement) < 5 else '✗'
        )
        
        # Total agreement indicator (if V1 exists)
        if v1_total is not None and total_disagreement is not None:
            total_agree_color = COLORS['strong'] if abs(total_disagreement) < 5 else (
                COLORS['consider'] if abs(total_disagreement) < 7 else COLORS['track']
            )
            total_agree_text = '✓' if abs(total_disagreement) < 5 else (
                '~' if abs(total_disagreement) < 7 else '✗'
            )
        else:
            total_agree_color = COLORS['subtext']
            total_agree_text = '-'
        
        # Hybrid pick
        spread_pick = game['picks']['spread']
        total_pick = game['picks']['total']
        
        # Determine favorite for display
        if hybrid_margin > 0:
            spread_display = f"{game['home_team']} -{abs(hybrid_margin):.1f}"
        else:
            spread_display = f"{game['away_team']} -{abs(hybrid_margin):.1f}"
        
        total_display = f"{total_pick['side'].upper()} {market_total:.1f}" if total_pick['side'] != 'no_bet' else 'PASS'
        
        # Combined pick display
        if spread_pick['units'] > 0:
            hybrid_pick_display = f"SP: {spread_display}"
        else:
            hybrid_pick_display = f"SP: PASS"
        
        if total_pick['units'] > 0:
            hybrid_pick_display += f"\nTO: {total_display}"
        else:
            hybrid_pick_display += f"\nTO: PASS"
        
        # Edge and units
        best_edge = max(spread_pick['edge_pts'], total_pick['edge_pts'])
        total_units = spread_pick['units'] + total_pick['units']
        
        # Render row
        ax.text(15, y_pos, matchup, fontsize=9, ha='center', va='center',
                color=COLORS['text'])
        
        # V5 spread
        v5_spread_display = f"{'+' if v5_margin > 0 else ''}{v5_margin:.1f}"
        ax.text(28, y_pos, v5_spread_display, fontsize=9, ha='center',
                va='center', color=COLORS['accent'])
        
        # V1 spread (or N/A)
        if v1_margin is not None:
            v1_spread_display = f"{'+' if v1_margin > 0 else ''}{v1_margin:.1f}"
            ax.text(41, y_pos, v1_spread_display, fontsize=9, ha='center',
                    va='center', color=COLORS['accent'])
        else:
            ax.text(41, y_pos, 'N/A', fontsize=9, ha='center',
                    va='center', color=COLORS['subtext'])
        
        # Spread agreement
        ax.text(50, y_pos, spread_agree_text, fontsize=11, ha='center',
                va='center', color=spread_agree_color, fontweight='bold')
        
        # V5 total
        ax.text(62, y_pos, f"{v5_total:.1f}", fontsize=9, ha='center',
                va='center', color=COLORS['accent'])
        
        # V1 total (or N/A)
        if v1_total is not None:
            ax.text(74, y_pos, f"{v1_total:.1f}", fontsize=9, ha='center',
                    va='center', color=COLORS['accent'])
        else:
            ax.text(74, y_pos, 'N/A', fontsize=9, ha='center',
                    va='center', color=COLORS['subtext'])
        
        # Total agreement
        ax.text(83, y_pos, total_agree_text, fontsize=11, ha='center',
                va='center', color=total_agree_color, fontweight='bold')
        
        # Hybrid pick
        ax.text(96, y_pos, hybrid_pick_display.split('\n')[0], fontsize=8, ha='center',
                va='center', color=COLORS['text'])
        if '\n' in hybrid_pick_display:
            ax.text(96, y_pos - 0.3, hybrid_pick_display.split('\n')[1], fontsize=7, ha='center',
                    va='center', color=COLORS['subtext'])
        
        # Vegas line
        ax.text(110, y_pos, f"{market_spread}\n{market_total:.1f}", fontsize=8, ha='center',
                va='center', color=COLORS['text'], linespacing=0.8)
        
        # Edge
        ax.text(122, y_pos, f"{best_edge:.1f}", fontsize=9, ha='center',
                va='center', color=COLORS['strong'] if best_edge > 3 else COLORS['text'])
        
        # Units
        units_color = COLORS['strong'] if total_units >= 2.5 else (
            COLORS['consider'] if total_units > 0 else COLORS['subtext']
        )
        ax.text(133, y_pos, f"{total_units:.1f}U", fontsize=10, ha='center',
                va='center', color=units_color, fontweight='bold')
        
        y_pos -= 1.2
    
    # Legend
    y_pos -= 0.5
    legend_box = FancyBboxPatch((10, y_pos - 1.0), 120, 0.8,
                               boxstyle="round,pad=0.05",
                               facecolor=COLORS['header'],
                               edgecolor=COLORS['accent'],
                               linewidth=1)
    ax.add_patch(legend_box)
    
    legend_text = (
        "Agreement: ✓ = Models agree (spread <3pts, total <5pts)  |  "
        "~ = Moderate disagreement (spread 3-5pts, total 5-7pts)  |  "
        "✗ = Strong disagreement (spread >5pts, total >7pts)"
    )
    ax.text(70, y_pos - 0.6, legend_text, fontsize=9, ha='center',
            va='center', color=COLORS['subtext'])
    
    # Save
    output_path = DOWNLOADS_DIR / f'nfl_full_slate_week{week}_{season}.png'
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight',
               facecolor=COLORS['background'], edgecolor='none', pad_inches=0.5)
    plt.close()
    
    print(f'✅ Full Slate Report saved: {output_path}')
    return output_path

# ========================================
# REPORT #2: Recommended Picks with Stakes
# ========================================

def generate_recommended_picks_report(data, season, week):
    """Generate Recommended Picks with Stakes PNG - Model Comparison"""
    
    games = data['games']
    date_str = datetime.now().strftime('%B %d, %Y')
    
    # Extract all bets (spread + total) with model data
    bets = []
    for game in games:
        # Spread bet
        spread_pick = game['picks']['spread']
        if spread_pick['units'] > 0 or spread_pick['category'] == 'TRACK':
            bets.append({
                'category': spread_pick['category'],
                'game': game['matchup'],
                'bet_type': 'Spread',
                'pick': spread_pick['display'],
                'v5_value': game['model']['v5']['spread_home_margin'],
                'v1_value': game['model']['v1']['home_margin'],
                'hybrid_value': game['model']['hybrid']['spread_home_margin'],
                'disagreement': game['meta']['spread_disagreement'],
                'edge': spread_pick['edge_pts'],
                'odds': '-110',  # Placeholder
                'book': game['market'].get('bookmaker', 'DraftKings'),
                'stake': spread_pick['units']
            })
        
        # Total bet
        total_pick = game['picks']['total']
        if total_pick['units'] > 0 or total_pick['category'] == 'TRACK':
            side = total_pick['side'].capitalize()
            line = total_pick['line']
            bets.append({
                'category': total_pick['category'],
                'game': game['matchup'],
                'bet_type': 'Total',
                'pick': f"{side} {line}",
                'v5_value': game['model']['v5']['total_p50'],
                'v1_value': game['model']['v1']['total_estimate'],
                'hybrid_value': game['model']['hybrid']['total_p50'],
                'disagreement': game['meta']['total_disagreement'],
                'edge': total_pick['edge_pts'],
                'odds': '-110',  # Placeholder
                'book': game['market'].get('bookmaker', 'DraftKings'),
                'stake': total_pick['units']
            })
    
    # Sort by stake (descending)
    bets.sort(key=lambda x: x['stake'], reverse=True)
    
    # Set up figure (wider for model comparison)
    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(22, 5 + len(bets) * 0.8))
    fig.patch.set_facecolor(COLORS['background'])
    ax.set_facecolor(COLORS['background'])
    ax.set_xlim(0, 130)
    ax.set_ylim(0, 10 + len(bets) * 1.2)
    ax.axis('off')
    
    # Title
    y_pos = 10 + len(bets) * 1.2 - 2
    title_box = FancyBboxPatch((5, y_pos), 120, 1.5,
                              boxstyle="round,pad=0.1",
                              facecolor=COLORS['header'],
                              edgecolor=COLORS['accent'],
                              linewidth=2)
    ax.add_patch(title_box)
    ax.text(65, y_pos + 1.0, 'Recommended Picks - Model Analysis & Stakes',
            fontsize=28, fontweight='bold', ha='center', va='center',
            color=COLORS['text'])
    ax.text(65, y_pos + 0.3,
            f'Week {week}, {season}  |  Color Key: 🟢 STRONG (High Confidence)  🟡 CONSIDER (Moderate)  🔴 TRACK (Observe)',
            fontsize=11, ha='center', va='center', color=COLORS['subtext'])
    
    # Table header
    y_pos -= 2.5
    header_box = FancyBboxPatch((5, y_pos), 120, 1.0,
                               boxstyle="round,pad=0.05",
                               facecolor=COLORS['header'],
                               edgecolor=COLORS['accent'],
                               linewidth=1)
    ax.add_patch(header_box)
    
    # Column headers (expanded for model comparison)
    headers = [
        ('Cat.', 10),
        ('Game', 22),
        ('Type', 32),
        ('Pick', 42),
        ('V5', 52),
        ('V1', 61),
        ('Hybrid', 71),
        ('Agree?', 80),
        ('Source', 91),
        ('Edge', 100),
        ('Odds', 108),
        ('Book', 116),
        ('Stake', 125)
    ]
    
    for header, x in headers:
        ax.text(x, y_pos + 0.5, header, fontsize=10, fontweight='bold',
                ha='center', va='center', color=COLORS['text'])
    
    # Table rows (color-coded)
    y_pos -= 1.6
    category_colors = {
        'STRONG': COLORS['strong'],
        'CONSIDER': COLORS['consider'],
        'TRACK': COLORS['track']
    }
    
    for i, bet in enumerate(bets):
        # Row background color
        cat_color = category_colors.get(bet['category'], COLORS['track'])
        row_box = FancyBboxPatch((5, y_pos - 0.55), 120, 1.1,
                                boxstyle="round,pad=0.02",
                                facecolor=f"{cat_color}33",  # 20% opacity
                                edgecolor=cat_color,
                                linewidth=2)
        ax.add_patch(row_box)
        
        # Category (abbreviated)
        cat_abbrev = bet['category'][:3] if bet['category'] == 'STRONG' else (
            'CON' if bet['category'] == 'CONSIDER' else 'TRK'
        )
        ax.text(10, y_pos, cat_abbrev, fontsize=9, ha='center',
                va='center', color=cat_color, fontweight='bold')
        
        # Game
        ax.text(22, y_pos, bet['game'], fontsize=8, ha='center',
                va='center', color=COLORS['text'])
        
        # Bet Type
        ax.text(32, y_pos, bet['bet_type'], fontsize=9, ha='center',
                va='center', color=COLORS['text'])
        
        # Pick
        ax.text(42, y_pos, bet['pick'], fontsize=9, ha='center',
                va='center', color=COLORS['accent'], fontweight='bold')
        
        # V5, V1, Hybrid values
        v5_val = bet['v5_value']
        v1_val = bet['v1_value']
        hybrid_val = bet['hybrid_value']
        
        if bet['bet_type'] == 'Spread':
            ax.text(52, y_pos, f"{v5_val:+.1f}" if v5_val is not None else 'N/A',
                    fontsize=8, ha='center', va='center', color=COLORS['accent'])
            ax.text(61, y_pos, f"{v1_val:+.1f}" if v1_val is not None else 'N/A',
                    fontsize=8, ha='center', va='center', color=COLORS['accent'])
            ax.text(71, y_pos, f"{hybrid_val:+.1f}",
                    fontsize=8, ha='center', va='center',
                    color=COLORS['text'], fontweight='bold')
        else:  # Total
            ax.text(52, y_pos, f"{v5_val:.1f}" if v5_val is not None else 'N/A',
                    fontsize=8, ha='center', va='center', color=COLORS['accent'])
            ax.text(61, y_pos, f"{v1_val:.1f}" if v1_val is not None else 'N/A',
                    fontsize=8, ha='center', va='center', color=COLORS['accent'])
            ax.text(71, y_pos, f"{hybrid_val:.1f}",
                    fontsize=8, ha='center', va='center',
                    color=COLORS['text'], fontweight='bold')
        
        # Agreement indicator
        disagreement = bet['disagreement']
        if disagreement is not None and v1_val is not None:
            if bet['bet_type'] == 'Spread':
                # Spread thresholds
                if abs(disagreement) < 3:
                    agree_text = '✓'
                    agree_color = COLORS['strong']
                elif abs(disagreement) < 5:
                    agree_text = '~'
                    agree_color = COLORS['consider']
                else:
                    agree_text = '✗'
                    agree_color = COLORS['track']
            else:  # Total
                # Total thresholds
                if abs(disagreement) < 5:
                    agree_text = '✓'
                    agree_color = COLORS['strong']
                elif abs(disagreement) < 7:
                    agree_text = '~'
                    agree_color = COLORS['consider']
                else:
                    agree_text = '✗'
                    agree_color = COLORS['track']
            
            ax.text(80, y_pos, agree_text, fontsize=11, ha='center',
                    va='center', color=agree_color, fontweight='bold')
        else:
            ax.text(80, y_pos, '-', fontsize=9, ha='center',
                    va='center', color=COLORS['subtext'])
        
        # Model source (which drove the pick)
        if v1_val is None or disagreement is None:
            model_source = 'V5'
        elif abs(disagreement) < 3:  # Strong agreement
            model_source = 'Both'
        else:  # Hybrid blend
            model_source = 'Hybrid'
        
        ax.text(91, y_pos, model_source, fontsize=8, ha='center',
                va='center', color=COLORS['accent'], fontweight='bold')
        
        # Edge
        ax.text(100, y_pos, f"{bet['edge']:.1f}", fontsize=9, ha='center',
                va='center', color=COLORS['strong'] if bet['edge'] > 3 else COLORS['text'])
        
        # Odds
        ax.text(108, y_pos, bet['odds'], fontsize=8, ha='center',
                va='center', color=COLORS['text'])
        
        # Book
        ax.text(116, y_pos, bet['book'], fontsize=7, ha='center',
                va='center', color=COLORS['text'])
        
        # Stake
        ax.text(125, y_pos, f"{bet['stake']:.1f}U", fontsize=10, ha='center',
                va='center', color='#FFD700', fontweight='bold')
        
        y_pos -= 1.2
    
    # Summary footer
    y_pos -= 0.5
    strong_bets = [b for b in bets if b['category'] == 'STRONG']
    consider_bets = [b for b in bets if b['category'] == 'CONSIDER']
    track_bets = [b for b in bets if b['category'] == 'TRACK']
    
    strong_units = sum(b['stake'] for b in strong_bets)
    consider_units = sum(b['stake'] for b in consider_bets)
    total_active_bets = len(strong_bets) + len(consider_bets)
    total_units = strong_units + consider_units
    
    summary_box = FancyBboxPatch((10, y_pos - 1.5), 110, 1.2,
                                boxstyle="round,pad=0.05",
                                facecolor=COLORS['header'],
                                edgecolor=COLORS['accent'],
                                linewidth=1)
    ax.add_patch(summary_box)
    
    summary_text = (
        f"Strong: {len(strong_bets)} picks ({strong_units:.1f}U)  |  "
        f"Consider: {len(consider_bets)} picks ({consider_units:.1f}U)  |  "
        f"Track: {len(track_bets)} picks (0.0U)  |  "
        f"Total Action: {total_active_bets} picks | {total_units:.1f}U"
    )
    
    ax.text(65, y_pos - 0.9, summary_text, fontsize=11, ha='center',
            va='center', color=COLORS['text'])
    
    # Legend
    y_pos -= 1.8
    legend_box = FancyBboxPatch((10, y_pos - 0.8), 110, 0.6,
                               boxstyle="round,pad=0.05",
                               facecolor=COLORS['header'],
                               edgecolor=COLORS['accent'],
                               linewidth=1)
    ax.add_patch(legend_box)
    
    legend_text = (
        "Source: Both = Models agree strongly  |  Hybrid = V5 + 40% V1 adjustment  |  "
        "V5 = V5 only (no V1)  |  Agree?: ✓ = Aligned  ~ = Moderate  ✗ = Divergent"
    )
    ax.text(65, y_pos - 0.5, legend_text, fontsize=8, ha='center',
            va='center', color=COLORS['subtext'])
    
    # Save
    output_path = DOWNLOADS_DIR / f'nfl_recommended_picks_week{week}_{season}.png'
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight',
               facecolor=COLORS['background'], edgecolor='none', pad_inches=0.5)
    plt.close()
    
    print(f'✅ Recommended Picks Report saved: {output_path}')
    return output_path

# ========================================
# MAIN
# ========================================

def main():
    if len(sys.argv) < 3:
        print('Usage: python3 export-hybrid-reports.py <season> <week>')
        print('Example: python3 export-hybrid-reports.py 2025 14')
        sys.exit(1)
    
    season = sys.argv[1]
    week = sys.argv[2]
    
    print('\n' + '='*70)
    print(f'🏈 NFL HYBRID REPORT GENERATOR - Week {week}, {season}')
    print('='*70)
    print('')
    
    try:
        # Load data
        data = load_hybrid_data(season, week)
        
        # Generate reports
        print('\n📊 Generating reports...\n')
        
        full_slate_path = generate_full_slate_report(data, season, week)
        recommended_path = generate_recommended_picks_report(data, season, week)
        
        # Summary
        print('\n' + '='*70)
        print('✅ REPORTS GENERATED SUCCESSFULLY')
        print('='*70)
        print(f'📁 Full Slate: {full_slate_path}')
        print(f'📁 Recommended: {recommended_path}')
        print('')
        
    except Exception as e:
        print(f'\n❌ ERROR: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
