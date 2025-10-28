#!/usr/bin/env python3
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch
import numpy as np

# Set up the figure with dark theme
plt.style.use('dark_background')
fig, ax = plt.subplots(figsize=(16, 20))
fig.patch.set_facecolor('#1a1a2e')
ax.set_facecolor('#1a1a2e')

# Remove axes
ax.set_xlim(0, 10)
ax.set_ylim(0, 30)
ax.axis('off')

# Title section
title_box = FancyBboxPatch((0.5, 28), 9, 1.5, 
                          boxstyle="round,pad=0.1", 
                          facecolor='#4CAF50', 
                          edgecolor='white', 
                          linewidth=2)
ax.add_patch(title_box)
ax.text(5, 28.75, '🏒 NHL SOG ELITE PICKS', 
        fontsize=24, fontweight='bold', ha='center', va='center', color='white')
ax.text(5, 28.25, 'October 28, 2025 • ZINB Model v4.1 • 30 Picks • 87.3U Total', 
        fontsize=12, ha='center', va='center', color='white')

# Stats boxes
stats = [
    ("Total Picks", "30"),
    ("Avg Edge", "14.2%"),
    ("Elite Picks (20%+)", "6"),
    ("Total Units", "87.3U")
]

for i, (label, value) in enumerate(stats):
    x_pos = 0.5 + i * 2.25
    stat_box = FancyBboxPatch((x_pos, 26.5), 2, 0.8,
                             boxstyle="round,pad=0.05",
                             facecolor='rgba(76, 175, 80, 0.2)',
                             edgecolor='#4CAF50')
    ax.add_patch(stat_box)
    ax.text(x_pos + 1, 27.1, value, fontsize=14, fontweight='bold', 
            ha='center', va='center', color='#4CAF50')
    ax.text(x_pos + 1, 26.7, label, fontsize=9, 
            ha='center', va='center', color='white')

# Picks data
picks = [
    {"rank": 1, "name": "Erik Karlsson", "pos": "D-PIT", "matchup": "PIT@PHI", "dir": "UNDER", "line": "1.5", "odds": "+115", "book": "DK", "proj": "1.0", "edge": "34.1%", "tier": "elite"},
    {"rank": 2, "name": "Sam Bennett", "pos": "C-FLA", "matchup": "FLA@ANA", "dir": "UNDER", "line": "2.5", "odds": "+115", "book": "DK", "proj": "1.9", "edge": "30.5%", "tier": "elite"},
    {"rank": 3, "name": "Gustav Forsling", "pos": "D-FLA", "matchup": "FLA@ANA", "dir": "UNDER", "line": "1.5", "odds": "+110", "book": "MGM", "proj": "1.1", "edge": "25.3%", "tier": "elite"},
    {"rank": 4, "name": "Michael Bunting", "pos": "L-NSH", "matchup": "NSH@TBL", "dir": "UNDER", "line": "1.5", "odds": "-135", "book": "DK", "proj": "1.0", "edge": "24.1%", "tier": "elite"},
    {"rank": 5, "name": "Drew Doughty", "pos": "D-LAK", "matchup": "LAK@SJS", "dir": "UNDER", "line": "1.5", "odds": "-120", "book": "FD", "proj": "1.0", "edge": "23.9%", "tier": "elite"},
    {"rank": 6, "name": "Thomas Chabot", "pos": "D-OTT", "matchup": "OTT@CHI", "dir": "UNDER", "line": "1.5", "odds": "+120", "book": "DK", "proj": "1.5", "edge": "21.2%", "tier": "elite"},
    {"rank": 7, "name": "Seth Jones", "pos": "D-FLA", "matchup": "FLA@ANA", "dir": "UNDER", "line": "1.5", "odds": "+120", "book": "DK", "proj": "1.6", "edge": "17.7%", "tier": "high"},
    {"rank": 8, "name": "Aaron Ekblad", "pos": "D-FLA", "matchup": "FLA@ANA", "dir": "UNDER", "line": "1.5", "odds": "+105", "book": "DK", "proj": "1.5", "edge": "17.0%", "tier": "high"},
    {"rank": 9, "name": "Mattias Ekholm", "pos": "D-EDM", "matchup": "EDM@UTA", "dir": "UNDER", "line": "1.5", "odds": "-120", "book": "DK", "proj": "1.3", "edge": "16.5%", "tier": "high"},
    {"rank": 10, "name": "Jake Sanderson", "pos": "D-OTT", "matchup": "OTT@CHI", "dir": "UNDER", "line": "2.5", "odds": "-162", "book": "DK", "proj": "1.8", "edge": "16.2%", "tier": "high"},
    {"rank": 11, "name": "Matt Boldy", "pos": "L-MIN", "matchup": "MIN@WPG", "dir": "OVER", "line": "3.5", "odds": "+105", "book": "DK", "proj": "5.8", "edge": "13.2%", "tier": "good"},
    {"rank": 12, "name": "Brock Faber", "pos": "D-MIN", "matchup": "MIN@WPG", "dir": "OVER", "line": "1.5", "odds": "-110", "book": "MGM", "proj": "2.9", "edge": "13.2%", "tier": "good"},
    {"rank": 13, "name": "Morgan Frost", "pos": "C-CGY", "matchup": "CGY@TOR", "dir": "UNDER", "line": "1.5", "odds": "+100", "book": "DK", "proj": "1.6", "edge": "12.8%", "tier": "good"},
    {"rank": 14, "name": "Sidney Crosby", "pos": "C-PIT", "matchup": "PIT@PHI", "dir": "UNDER", "line": "2.5", "odds": "-154", "book": "DK", "proj": "2.1", "edge": "12.6%", "tier": "good"},
    {"rank": 15, "name": "Will Cuylle", "pos": "L-NYR", "matchup": "NYR@VAN", "dir": "UNDER", "line": "1.5", "odds": "+110", "book": "DK", "proj": "1.8", "edge": "12.6%", "tier": "good"},
    {"rank": 16, "name": "Elias Lindholm", "pos": "C-BOS", "matchup": "BOS@NYI", "dir": "UNDER", "line": "1.5", "odds": "+135", "book": "DK", "proj": "2.2", "edge": "12.0%", "tier": "good"},
    {"rank": 17, "name": "Ryan Hartman", "pos": "R-MIN", "matchup": "MIN@WPG", "dir": "OVER", "line": "2.5", "odds": "+126", "book": "DK", "proj": "3.8", "edge": "11.8%", "tier": "good"},
    {"rank": 18, "name": "Mikael Backlund", "pos": "C-CGY", "matchup": "CGY@TOR", "dir": "UNDER", "line": "1.5", "odds": "+105", "book": "DK", "proj": "1.8", "edge": "11.2%", "tier": "good"},
    {"rank": 19, "name": "Artemi Panarin", "pos": "L-NYR", "matchup": "NYR@VAN", "dir": "UNDER", "line": "2.5", "odds": "+135", "book": "DK", "proj": "3.3", "edge": "10.8%", "tier": "good"},
    {"rank": 20, "name": "Anton Lundell", "pos": "C-FLA", "matchup": "FLA@ANA", "dir": "UNDER", "line": "2.5", "odds": "-130", "book": "DK", "proj": "2.5", "edge": "10.1%", "tier": "good"}
]

# Color scheme for tiers
tier_colors = {
    'elite': '#FF6B6B',    # Red for 20%+ edge
    'high': '#4ECDC4',     # Teal for 15-20% edge  
    'good': '#45B7D1',     # Blue for 10-15% edge
    'solid': '#96CEB4'     # Green for 5-10% edge
}

# Draw picks
y_start = 25
for i, pick in enumerate(picks):
    y_pos = y_start - (i * 1.2)
    
    # Pick box
    pick_box = FancyBboxPatch((0.5, y_pos - 0.5), 9, 1, 
                             boxstyle="round,pad=0.05",
                             facecolor=f'{tier_colors[pick["tier"]]}20',
                             edgecolor=tier_colors[pick["tier"]],
                             linewidth=2)
    ax.add_patch(pick_box)
    
    # Rank badge
    rank_circle = plt.Circle((1, y_pos), 0.2, color=tier_colors[pick["tier"]], zorder=10)
    ax.add_patch(rank_circle)
    ax.text(1, y_pos, f'#{pick["rank"]}', fontsize=8, fontweight='bold', 
            ha='center', va='center', color='white', zorder=11)
    
    # Player name and position
    ax.text(1.5, y_pos + 0.15, pick["name"], fontsize=11, fontweight='bold', 
            ha='left', va='center', color='white')
    ax.text(1.5, y_pos - 0.15, f'{pick["pos"]} • {pick["matchup"]}', fontsize=8, 
            ha='left', va='center', color='#CCCCCC')
    
    # Direction badge
    dir_color = '#F44336' if pick["dir"] == "UNDER" else '#4CAF50'
    dir_box = FancyBboxPatch((4.2, y_pos - 0.2), 1.2, 0.4,
                            boxstyle="round,pad=0.05",
                            facecolor=dir_color,
                            edgecolor='none')
    ax.add_patch(dir_box)
    ax.text(4.8, y_pos, f'{pick["dir"]} {pick["line"]}', fontsize=8, fontweight='bold',
            ha='center', va='center', color='white')
    
    # Odds and book
    ax.text(5.8, y_pos, f'{pick["odds"]} ({pick["book"]})', fontsize=9, 
            ha='left', va='center', color='#FFD700', fontweight='bold')
    
    # Projection
    ax.text(7.2, y_pos, f'Proj: {pick["proj"]}', fontsize=9, 
            ha='left', va='center', color='#81C784')
    
    # Edge
    ax.text(8.2, y_pos, f'+{pick["edge"]}', fontsize=10, fontweight='bold',
            ha='left', va='center', color='#4CAF50')
    
    # Stake
    ax.text(9.2, y_pos, '3.0U', fontsize=9, fontweight='bold',
            ha='center', va='center', color='#FFD700')

# Legend
legend_y = 2.5
ax.text(5, legend_y, 'Tier Legend:', fontsize=12, fontweight='bold', 
        ha='center', va='center', color='white')

legend_items = [
    ("🔥 Elite (20%+)", tier_colors['elite']),
    ("⭐ High (15-20%)", tier_colors['high']),
    ("✅ Good (10-15%)", tier_colors['good'])
]

for i, (label, color) in enumerate(legend_items):
    x_pos = 2 + i * 2
    legend_box = FancyBboxPatch((x_pos - 0.5, legend_y - 0.7), 2, 0.4,
                               boxstyle="round,pad=0.05",
                               facecolor=f'{color}30',
                               edgecolor=color)
    ax.add_patch(legend_box)
    ax.text(x_pos + 0.5, legend_y - 0.5, label, fontsize=9,
            ha='center', va='center', color='white')

# Footer
footer_text = ("ZINB Model v4.1 • Kelly Sizing • 5% Edge Threshold\n"
              "5-Game Cap REMOVED ⚡ Full Slate Coverage • Bet Responsibly")
ax.text(5, 0.5, footer_text, fontsize=10, ha='center', va='center', 
        color='#999999', style='italic')

plt.tight_layout()
plt.savefig('/Users/brentgoldman/Downloads/NHL-SOG-Elite-Picks-Oct28-2025.png', 
           dpi=300, bbox_inches='tight', facecolor='#1a1a2e', 
           edgecolor='none', pad_inches=0.5)

print("✅ NHL picks PNG saved to Downloads folder!")
print("📁 File: NHL-SOG-Elite-Picks-Oct28-2025.png")
plt.close()