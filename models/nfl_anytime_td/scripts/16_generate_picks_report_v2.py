#!/usr/bin/env python3
"""
Generate Week 16 Picks Report (PNG/PDF) - V2 with Unit Sizing
==============================================================
Creates a professional visual report of all profitable picks
with Kelly-based unit recommendations.

Unit Sizing: 0.25 Kelly, assumes $10 unit on $1200 bankroll (120 units total)
"""

import pandas as pd
import numpy as np
from pathlib import Path
import matplotlib.pyplot as plt
from datetime import datetime
import os

# Paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / 'data'
PICKS_DIR = DATA_DIR / 'live_picks'

# Output to Downloads folder
DOWNLOADS_DIR = Path.home() / 'Downloads'


def get_player_top_factor(position, edge):
    """Get a brief explanation for the pick based on position and edge."""
    position_factors = {
        'RB': ['RZ Carries', 'Goal Line', 'Inside-10', 'TD Rate', 'Touches'],
        'WR': ['Targets', 'RZ Share', 'Explosives', 'RZ Targets', 'Volume'],
        'TE': ['RZ Targets', 'Snap Rate', 'Goal Line', 'Short Yardage', 'Usage'],
        'QB': ['Rush TDs', 'Keeper', 'Designed Run', 'Mobility', 'Scramble'],
    }
    
    factors = position_factors.get(position, ['Model'])
    
    if edge >= 0.20:
        return factors[0]
    elif edge >= 0.15:
        return factors[1] if len(factors) > 1 else factors[0]
    elif edge >= 0.10:
        return factors[2] if len(factors) > 2 else factors[0]
    elif edge >= 0.07:
        return factors[3] if len(factors) > 3 else factors[0]
    else:
        return factors[4] if len(factors) > 4 else factors[0]


def calculate_units(kelly_pct, kelly_fraction=0.25, max_units=5.0):
    """
    Calculate bet size in units using fractional Kelly.
    
    Args:
        kelly_pct: Full Kelly percentage (0-1)
        kelly_fraction: Fraction of Kelly to use (default 0.25 = quarter Kelly)
        max_units: Maximum units per bet (default 5.0)
    
    Returns:
        Units to bet (rounded to 0.5)
    """
    if kelly_pct <= 0:
        return 0.0
    
    # Apply fractional Kelly
    fractional_kelly = kelly_pct * kelly_fraction
    
    # Convert to units (assuming 120 unit bankroll, so 1% = 1.2 units)
    # But simpler: just use Kelly% * 100 * fraction, capped at max
    units = fractional_kelly * 100  # Convert decimal to percentage units
    
    # Cap at max units
    units = min(units, max_units)
    
    # Round to nearest 0.5
    units = round(units * 2) / 2
    
    # Minimum 0.5 units if positive edge
    if units < 0.5 and kelly_pct > 0:
        units = 0.5
    
    return units


def load_picks():
    """Load the most recent picks file."""
    picks_files = list(PICKS_DIR.glob('week*_full_analysis_*.csv'))
    if not picks_files:
        raise FileNotFoundError("No full-analysis picks found in data/live_picks")
    
    latest = max(picks_files, key=lambda x: x.stat().st_mtime)
    print(f"Loading: {latest.name}")
    return pd.read_csv(latest)


def create_report_data():
    """Create the report data with unit sizing."""
    picks_df = load_picks()
    
    # Filter to profitable picks only
    profitable = picks_df[picks_df['strat_any_profitable'] == True].copy()
    
    # Build report data
    report_data = []
    
    for _, pick in profitable.iterrows():
        # Calculate units using 0.25 Kelly
        kelly_raw = pick['kelly_raw'] if pick['kelly_raw'] > 0 else 0
        units = calculate_units(kelly_raw, kelly_fraction=0.25, max_units=5.0)
        
        # Get factor
        factor = get_player_top_factor(pick['position'], pick['edge'])
        
        report_data.append({
            'Player': pick['player_name'],
            'Team': pick['team'],
            'Pos': pick['position'],
            'Opp': pick['opponent'],
            'Model_Prob': pick['p_model'],
            'Vegas_Odds': pick['odds_american'],
            'Vegas_Implied': pick['implied_prob'],
            'Edge': pick['edge'],
            'Units': units,
            'Factor': factor
        })
    
    report_df = pd.DataFrame(report_data)
    report_df = report_df.sort_values('Edge', ascending=False)
    
    return report_df


def create_png_report(report_df, output_path):
    """Create a professional PNG report."""
    
    # Prepare display data
    display_df = report_df.copy()
    display_df['Model_Prob'] = (display_df['Model_Prob'] * 100).round(1).astype(str) + '%'
    display_df['Vegas_Implied'] = (display_df['Vegas_Implied'] * 100).round(1).astype(str) + '%'
    display_df['Edge'] = (display_df['Edge'] * 100).round(1).astype(str) + '%'
    display_df['Vegas_Odds'] = display_df['Vegas_Odds'].apply(lambda x: f"+{int(x)}" if x > 0 else str(int(x)))
    display_df['Units'] = display_df['Units'].apply(lambda x: f"{x:.1f}U")
    
    # Select and rename columns for display
    display_df = display_df[['Player', 'Team', 'Pos', 'Opp', 'Model_Prob', 'Vegas_Odds', 'Vegas_Implied', 'Edge', 'Units', 'Factor']]
    display_df.columns = ['Player', 'Team', 'Pos', 'Opp', 'Model%', 'Odds', 'Implied%', 'Edge%', 'Stake', 'Factor']
    
    # Create figure
    n_rows = len(display_df)
    fig_height = max(14, 3 + n_rows * 0.45)
    fig, ax = plt.subplots(figsize=(16, fig_height))
    ax.axis('off')
    
    # Title
    title = f"NFL Anytime TD Picks"
    fig.suptitle(title, fontsize=20, fontweight='bold', y=0.97)
    
    # Subtitle with date and info
    subtitle = f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')} | Model: LightGBM v1.5 | {len(display_df)} Profitable Picks"
    ax.text(0.5, 0.97, subtitle, transform=ax.transAxes, ha='center', fontsize=11, color='gray')
    
    # Stake info
    stake_info = "Stake = 0.25 Kelly | Max 5U per bet"
    ax.text(0.5, 0.94, stake_info, transform=ax.transAxes, ha='center', fontsize=10, color='#666666', style='italic')
    
    # Create table
    columns = display_df.columns.tolist()
    cell_text = display_df.values.tolist()
    
    # Color coding for edge
    cell_colors = []
    for i, row in enumerate(report_df.itertuples()):
        edge_val = row.Edge
        row_colors = []
        for j, col in enumerate(columns):
            if col == 'Edge%':
                if edge_val >= 0.15:
                    row_colors.append('#90EE90')  # Light green (15%+)
                elif edge_val >= 0.10:
                    row_colors.append('#98FB98')  # Pale green (10%+)
                elif edge_val >= 0.07:
                    row_colors.append('#F0FFF0')  # Honeydew (7%+)
                else:
                    row_colors.append('#FFFACD')  # Lemon chiffon (<7%)
            elif col == 'Stake':
                # Highlight bigger stakes
                units = row.Units
                if units >= 3.0:
                    row_colors.append('#FFD700')  # Gold
                elif units >= 2.0:
                    row_colors.append('#FFEFD5')  # Papaya whip
                else:
                    row_colors.append('white' if i % 2 == 0 else '#f8f8f8')
            else:
                row_colors.append('white' if i % 2 == 0 else '#f8f8f8')
        cell_colors.append(row_colors)
    
    table = ax.table(
        cellText=cell_text,
        colLabels=columns,
        cellLoc='center',
        loc='center',
        cellColours=cell_colors,
        colColours=['#2E5A88'] * len(columns)
    )
    
    # Style the table
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1.2, 1.8)
    
    # Style header
    for (row, col), cell in table.get_celld().items():
        if row == 0:
            cell.set_text_props(fontweight='bold', color='white')
            cell.set_facecolor('#2E5A88')
        cell.set_edgecolor('#cccccc')
    
    # Adjust column widths
    col_widths = [0.14, 0.05, 0.04, 0.05, 0.08, 0.08, 0.09, 0.07, 0.06, 0.10]
    for i, width in enumerate(col_widths):
        for row in range(n_rows + 1):
            table[(row, i)].set_width(width)
    
    # Add legend/footer
    legend_text = """
    Strategies: TIER 1 (7%+ Edge) = 40% historical ROI | TIER 2 (5%+ Edge) = 26% historical ROI
    Edge = Model Probability - Vegas Implied | Filter: L10 TD Rate > 0
    """
    ax.text(0.5, 0.02, legend_text.strip(), transform=ax.transAxes, ha='center', 
            fontsize=9, color='#666666', style='italic')
    
    plt.tight_layout(rect=[0, 0.03, 1, 0.93])
    
    # Save PNG
    png_path = output_path.with_suffix('.png')
    plt.savefig(png_path, dpi=150, bbox_inches='tight', facecolor='white', edgecolor='none')
    print(f"Saved PNG: {png_path}")
    
    # Save PDF
    pdf_path = output_path.with_suffix('.pdf')
    plt.savefig(pdf_path, format='pdf', bbox_inches='tight', facecolor='white', edgecolor='none')
    print(f"Saved PDF: {pdf_path}")
    
    plt.close()
    
    return png_path, pdf_path


def main():
    print("="*60)
    print("NFL PICKS REPORT - V2 (with Unit Sizing)")
    print("="*60)
    
    # Create report data
    print("\nBuilding picks table...")
    report_df = create_report_data()
    print(f"Found {len(report_df)} profitable picks")
    
    # Calculate total units
    total_units = report_df['Units'].sum()
    print(f"Total stake: {total_units:.1f} units")
    
    # Output to Downloads
    output_path = DOWNLOADS_DIR / f'NFL_Picks_{datetime.now().strftime("%Y%m%d")}'
    
    print(f"\nGenerating report...")
    png_path, pdf_path = create_png_report(report_df, output_path)
    
    # Also save CSV
    csv_path = output_path.with_suffix('.csv')
    report_df.to_csv(csv_path, index=False)
    print(f"Saved CSV: {csv_path}")
    
    print("\n" + "="*60)
    print("REPORT COMPLETE!")
    print("="*60)
    print(f"\nFiles saved to: {DOWNLOADS_DIR}")
    
    # Summary
    print(f"\n{'='*40}")
    print("PICKS SUMMARY")
    print(f"{'='*40}")
    print(f"Total Picks: {len(report_df)}")
    print(f"Total Units: {total_units:.1f}U")
    print(f"Avg Edge: {report_df['Edge'].mean()*100:.1f}%")
    print(f"Top Pick: {report_df.iloc[0]['Player']} ({report_df.iloc[0]['Edge']*100:.1f}% edge, {report_df.iloc[0]['Units']:.1f}U)")


if __name__ == '__main__':
    main()
