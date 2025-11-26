#!/usr/bin/env python3
"""
Merge 2024-25 + 2025-26 seasons into single file
"""
import json

print("🔗 Merging seasons...")

with open('data/nba/boxscores-2024-25.json') as f:
    season1 = json.load(f)
print(f"✅ 2024-25: {len(season1)} games")

with open('data/nba/boxscores-2025-26.json') as f:
    season2 = json.load(f)
print(f"✅ 2025-26: {len(season2)} games")

combined = season1 + season2
print(f"✅ Combined: {len(combined)} games")

# Sort by date (newest first)
combined.sort(key=lambda x: x['gameDate'], reverse=True)

# Save
with open('data/nba/player-history-2024-2026.json', 'w') as f:
    json.dump(combined, f, indent=2)

dates = sorted([b['gameDate'] for b in combined])
print(f"📅 Range: {dates[0]} → {dates[-1]}")
print(f"💾 Saved: data/nba/player-history-2024-2026.json")

# Quality check
sample = combined[0]
print(f"\n🔍 Most recent: {sample['playerName']} on {sample['gameDate']}")
print(f"   {sample['points']}p / {sample['rebounds']}r / {sample['assists']}a")
