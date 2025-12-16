"""
Team Mapping Audit Script

Validates that all team names from all sources can be mapped to canonical IDs.

Sources audited:
1. Historical data (unified_matches.csv)
2. Matchday 16 fixtures (hardcoded)
3. Future: API-Football, TheOddsAPI

Author: Co-CTO
Date: December 12, 2025
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

import pandas as pd
from team_mapping import resolve_team_name, validate_team_mapping, CANONICAL_TEAMS

# Matchday 16 fixtures
MATCHDAY_16_TEAMS = [
    'Chelsea', 'Everton', 'Liverpool', 'Brighton',
    'Burnley', 'Fulham', 'Arsenal', 'Wolves',
    'Crystal Palace', 'Man City', 'Sunderland', 'Newcastle',
    'Nottm Forest', 'Tottenham', 'West Ham', 'Aston Villa',
    'Brentford', 'Leeds United', 'Man United', 'Bournemouth'
]


def audit_historical_data():
    """Audit team names from historical data."""
    print("\n" + "="*80)
    print("📊 AUDITING HISTORICAL DATA")
    print("="*80)
    
    data_path = Path(__file__).parent.parent / 'data' / 'unified_matches.csv'
    
    if not data_path.exists():
        print(f"   ⚠️  Historical data not found: {data_path}")
        return [], []
    
    df = pd.read_csv(data_path)
    df = df[df['season'].isin(['2023-24', '2024-25'])]
    
    home_teams = df['home'].dropna().unique().tolist()
    away_teams = df['away'].dropna().unique().tolist()
    all_teams = sorted(set(home_teams + away_teams))
    
    print(f"\n   Found {len(all_teams)} unique teams in 2023-24, 2024-25 seasons")
    
    mapped, unmapped = validate_team_mapping(all_teams, source="historical_data")
    
    print(f"\n   ✅ Mapped: {len(mapped)}/{len(all_teams)} teams")
    if mapped:
        for raw, canonical in sorted(mapped.items()):
            print(f"      • {raw:30s} → {canonical}")
    
    if unmapped:
        print(f"\n   ❌ UNMAPPED: {len(unmapped)} teams")
        for raw in sorted(unmapped):
            print(f"      • {raw}")
    
    return mapped, unmapped


def audit_matchday_fixtures():
    """Audit team names from Matchday 16 fixtures."""
    print("\n" + "="*80)
    print("⚽ AUDITING MATCHDAY 16 FIXTURES")
    print("="*80)
    
    print(f"\n   Testing {len(MATCHDAY_16_TEAMS)} teams from upcoming fixtures")
    
    mapped, unmapped = validate_team_mapping(MATCHDAY_16_TEAMS, source="matchday_16")
    
    print(f"\n   ✅ Mapped: {len(mapped)}/{len(MATCHDAY_16_TEAMS)} teams")
    if mapped:
        for raw, canonical in sorted(mapped.items()):
            print(f"      • {raw:30s} → {canonical}")
    
    if unmapped:
        print(f"\n   ❌ UNMAPPED: {len(unmapped)} teams")
        for raw in sorted(unmapped):
            print(f"      • {raw}")
    
    return mapped, unmapped


def audit_canonical_registry():
    """Audit the canonical registry itself."""
    print("\n" + "="*80)
    print("📋 CANONICAL TEAM REGISTRY")
    print("="*80)
    
    # Get unique canonical IDs
    canonical_ids = sorted(set(CANONICAL_TEAMS.values()))
    
    print(f"\n   Total canonical teams: {len(canonical_ids)}")
    print(f"   Total mappings: {len(CANONICAL_TEAMS)}")
    print(f"   Average aliases per team: {len(CANONICAL_TEAMS) / len(canonical_ids):.1f}")
    
    print(f"\n   Canonical team IDs:")
    for i, team_id in enumerate(canonical_ids, 1):
        # Count aliases
        aliases = [k for k, v in CANONICAL_TEAMS.items() if v == team_id]
        print(f"      {i:2d}. {team_id:25s} ({len(aliases)} aliases)")
    
    return canonical_ids


def main():
    """Run full audit."""
    print("\n" + "="*80)
    print("🔍 TEAM MAPPING AUDIT")
    print("="*80)
    
    # Audit historical data
    hist_mapped, hist_unmapped = audit_historical_data()
    
    # Audit Matchday 16
    md16_mapped, md16_unmapped = audit_matchday_fixtures()
    
    # Audit registry
    canonical_ids = audit_canonical_registry()
    
    # Final summary
    print("\n" + "="*80)
    print("📊 AUDIT SUMMARY")
    print("="*80)
    
    total_unmapped = len(hist_unmapped) + len(md16_unmapped)
    
    print(f"\n   Historical data: {len(hist_mapped)} mapped, {len(hist_unmapped)} unmapped")
    print(f"   Matchday 16: {len(md16_mapped)} mapped, {len(md16_unmapped)} unmapped")
    print(f"   Canonical registry: {len(canonical_ids)} teams, {len(CANONICAL_TEAMS)} total mappings")
    
    if total_unmapped == 0:
        print(f"\n   ✅ SUCCESS: All teams mapped successfully!")
        print(f"   🚀 Ready for production pipeline")
        return 0
    else:
        print(f"\n   ❌ FAILURE: {total_unmapped} teams unmapped")
        print(f"   🛑 Fix mappings in src/team_mapping.py before running production")
        
        if hist_unmapped:
            print(f"\n   Historical unmapped teams:")
            for team in sorted(hist_unmapped):
                print(f"      • {team}")
        
        if md16_unmapped:
            print(f"\n   Matchday 16 unmapped teams:")
            for team in sorted(md16_unmapped):
                print(f"      • {team}")
        
        return 1
    
    print("="*80)


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
