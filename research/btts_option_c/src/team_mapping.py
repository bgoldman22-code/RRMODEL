"""
Canonical Team Name Mapping for BTTS Production Pipeline

This module provides a single source of truth for team name normalization across:
- Historical EPL data (unified_matches.csv)
- Live fixtures (API-Football, user input)
- Live odds (TheOddsAPI)

Design Principles:
1. FAIL LOUD - Unmapped teams raise ValueError (no silent fallbacks)
2. Canonical IDs use snake_case and match historical dataset
3. Reusable across all experiments (features, profiles, predictions)
4. Zero data leakage risk (pure string mapping)

Author: Co-CTO
Date: December 12, 2025
"""

import re
from typing import Dict

# ============================================================================
# CANONICAL TEAM REGISTRY
# ============================================================================
# Key: normalized name (lowercase, alphanumeric only)
# Value: canonical team ID (snake_case, matches historical data)

CANONICAL_TEAMS: Dict[str, str] = {
    # Arsenal
    "arsenal": "arsenal",
    "arsenal fc": "arsenal",
    
    # Aston Villa
    "aston villa": "aston_villa",
    "villa": "aston_villa",
    
    # Bournemouth
    "bournemouth": "bournemouth",
    "afc bournemouth": "bournemouth",
    "bmouth": "bournemouth",
    
    # Brentford
    "brentford": "brentford",
    "brentford fc": "brentford",
    
    # Brighton
    "brighton": "brighton",
    "brighton hove albion": "brighton",
    "brighton and hove albion": "brighton",
    "brighton  hove albion": "brighton",
    
    # Burnley
    "burnley": "burnley",
    "burnley fc": "burnley",
    
    # Chelsea
    "chelsea": "chelsea",
    "chelsea fc": "chelsea",
    
    # Crystal Palace
    "crystal palace": "crystal_palace",
    "palace": "crystal_palace",
    
    # Everton
    "everton": "everton",
    "everton fc": "everton",
    
    # Fulham
    "fulham": "fulham",
    "fulham fc": "fulham",
    
    # Ipswich
    "ipswich": "ipswich",
    "ipswich town": "ipswich",
    
    # Leeds United
    "leeds": "leeds",
    "leeds united": "leeds",
    "lufc": "leeds",
    
    # Leicester
    "leicester": "leicester",
    "leicester city": "leicester",
    
    # Liverpool
    "liverpool": "liverpool",
    "liverpool fc": "liverpool",
    "lfc": "liverpool",
    
    # Luton
    "luton": "luton",
    "luton town": "luton",
    
    # Manchester City
    "manchester city": "manchester_city",
    "man city": "manchester_city",
    "mancity": "manchester_city",
    "mcfc": "manchester_city",
    "man c": "manchester_city",
    
    # Manchester United
    "manchester united": "manchester_united",
    "manchester utd": "manchester_united",
    "man united": "manchester_united",
    "man utd": "manchester_united",
    "manutd": "manchester_united",
    "mufc": "manchester_united",
    "man u": "manchester_united",
    
    # Newcastle
    "newcastle": "newcastle",
    "newcastle united": "newcastle",
    "nufc": "newcastle",
    
    # Nottingham Forest
    "nottingham forest": "nottingham_forest",
    "nottm forest": "nottingham_forest",
    "nott forest": "nottingham_forest",
    "forest": "nottingham_forest",
    "nffc": "nottingham_forest",
    
    # Sheffield United
    "sheffield united": "sheffield_utd",
    "sheffield utd": "sheffield_utd",
    "sheff utd": "sheffield_utd",
    "sheff united": "sheffield_utd",
    "sufc": "sheffield_utd",
    
    # Southampton
    "southampton": "southampton",
    "soton": "southampton",
    "saints": "southampton",
    
    # Sunderland (Championship)
    "sunderland": "sunderland",
    "safc": "sunderland",
    
    # Tottenham
    "tottenham": "tottenham",
    "tottenham hotspur": "tottenham",
    "spurs": "tottenham",
    "thfc": "tottenham",
    
    # West Ham
    "west ham": "west_ham",
    "west ham united": "west_ham",
    "whufc": "west_ham",
    
    # Wolverhampton
    "wolverhampton": "wolves",
    "wolverhampton wanderers": "wolves",
    "wolves": "wolves",
    "wwfc": "wolves",
}


# ============================================================================
# NORMALIZATION FUNCTIONS
# ============================================================================

def normalize_team_name(raw_name: str) -> str:
    """
    Normalize team name to lowercase alphanumeric.
    
    Steps:
    1. Lowercase
    2. Remove all non-alphabetic characters (except spaces)
    3. Collapse multiple spaces
    4. Strip leading/trailing whitespace
    
    Args:
        raw_name: Raw team name from any source
        
    Returns:
        Normalized team name (lowercase, alphanumeric + spaces only)
        
    Examples:
        >>> normalize_team_name("Man City")
        'man city'
        >>> normalize_team_name("Brighton & Hove Albion")
        'brighton  hove albion'
        >>> normalize_team_name("Nottm Forest")
        'nottm forest'
    """
    if not raw_name or not isinstance(raw_name, str):
        raise ValueError(f"Invalid team name: {raw_name} (type: {type(raw_name)})")
    
    # Lowercase
    name = raw_name.lower()
    
    # Remove non-alphabetic (keep spaces)
    name = re.sub(r"[^a-z\s]", " ", name)
    
    # Collapse multiple spaces
    name = re.sub(r"\s+", " ", name)
    
    # Strip
    name = name.strip()
    
    return name


def resolve_team_name(raw_name: str, source: str = "unknown") -> str:
    """
    Resolve raw team name to canonical team ID.
    
    FAIL-LOUD DESIGN:
    - If team cannot be mapped, raises ValueError
    - No silent fallbacks or defaults
    - Forces explicit additions to CANONICAL_TEAMS registry
    
    Args:
        raw_name: Raw team name from any source
        source: Source of the name (for error messages)
        
    Returns:
        Canonical team ID (snake_case)
        
    Raises:
        ValueError: If team name cannot be mapped
        
    Examples:
        >>> resolve_team_name("Man City")
        'manchester_city'
        >>> resolve_team_name("Nottm Forest")
        'nottingham_forest'
        >>> resolve_team_name("Unknown Team")
        ValueError: [TEAM MAPPING ERROR] ...
    """
    # Normalize
    norm = normalize_team_name(raw_name)
    
    # Lookup
    if norm not in CANONICAL_TEAMS:
        # FAIL LOUD - force explicit mapping
        available = sorted(set(CANONICAL_TEAMS.values()))
        raise ValueError(
            f"\n{'='*80}\n"
            f"[TEAM MAPPING ERROR] Unmapped team name\n"
            f"{'='*80}\n"
            f"  Raw name: '{raw_name}'\n"
            f"  Normalized: '{norm}'\n"
            f"  Source: {source}\n"
            f"\n"
            f"This team is not in the canonical registry (CANONICAL_TEAMS).\n"
            f"\n"
            f"Available canonical teams ({len(available)}):\n"
            f"  {', '.join(available)}\n"
            f"\n"
            f"ACTION REQUIRED:\n"
            f"  Add mapping to src/team_mapping.py:\n"
            f"    '{norm}': 'canonical_team_id',\n"
            f"{'='*80}\n"
        )
    
    return CANONICAL_TEAMS[norm]


def resolve_team_batch(team_names: list, source: str = "unknown") -> Dict[str, str]:
    """
    Resolve multiple team names at once.
    
    Args:
        team_names: List of raw team names
        source: Source of the names
        
    Returns:
        Dict mapping raw_name → canonical_id
        
    Raises:
        ValueError: If any team cannot be mapped (stops at first failure)
    """
    return {raw: resolve_team_name(raw, source=source) for raw in team_names}


def validate_team_mapping(team_names: list, source: str = "unknown") -> tuple:
    """
    Validate team mapping without raising errors.
    
    Args:
        team_names: List of raw team names
        source: Source of the names
        
    Returns:
        (mapped_dict, unmapped_list)
    """
    mapped = {}
    unmapped = []
    
    for raw_name in team_names:
        try:
            canonical = resolve_team_name(raw_name, source=source)
            mapped[raw_name] = canonical
        except ValueError:
            unmapped.append(raw_name)
    
    return mapped, unmapped


# ============================================================================
# CANONICAL ID → DISPLAY NAME (for output formatting)
# ============================================================================

DISPLAY_NAMES: Dict[str, str] = {
    "arsenal": "Arsenal",
    "aston_villa": "Aston Villa",
    "bournemouth": "Bournemouth",
    "brentford": "Brentford",
    "brighton": "Brighton",
    "burnley": "Burnley",
    "chelsea": "Chelsea",
    "crystal_palace": "Crystal Palace",
    "everton": "Everton",
    "fulham": "Fulham",
    "ipswich": "Ipswich",
    "leeds": "Leeds United",
    "leicester": "Leicester",
    "liverpool": "Liverpool",
    "luton": "Luton",
    "manchester_city": "Man City",
    "manchester_united": "Man United",
    "newcastle": "Newcastle",
    "nottingham_forest": "Nottm Forest",
    "sheffield_utd": "Sheffield Utd",
    "southampton": "Southampton",
    "sunderland": "Sunderland",
    "tottenham": "Tottenham",
    "west_ham": "West Ham",
    "wolves": "Wolves",
}


def get_display_name(canonical_id: str) -> str:
    """Get human-readable display name from canonical ID."""
    return DISPLAY_NAMES.get(canonical_id, canonical_id.replace("_", " ").title())


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    print("="*80)
    print("TEAM MAPPING MODULE - VALIDATION")
    print("="*80)
    
    # Test cases from Matchday 16
    test_cases = [
        ("Chelsea", "fixtures"),
        ("Everton", "fixtures"),
        ("Liverpool", "fixtures"),
        ("Brighton", "fixtures"),
        ("Burnley", "fixtures"),
        ("Fulham", "fixtures"),
        ("Arsenal", "fixtures"),
        ("Wolves", "fixtures"),
        ("Crystal Palace", "fixtures"),
        ("Man City", "fixtures"),
        ("Sunderland", "fixtures"),
        ("Newcastle", "fixtures"),
        ("Nottm Forest", "fixtures"),
        ("Tottenham", "fixtures"),
        ("West Ham", "fixtures"),
        ("Aston Villa", "fixtures"),
        ("Brentford", "fixtures"),
        ("Leeds United", "fixtures"),
        ("Man United", "fixtures"),
        ("Bournemouth", "fixtures"),
    ]
    
    print(f"\n✅ Testing {len(test_cases)} team names from Matchday 16...\n")
    
    success_count = 0
    for raw_name, source in test_cases:
        try:
            canonical = resolve_team_name(raw_name, source=source)
            display = get_display_name(canonical)
            print(f"  ✅ '{raw_name}' → '{canonical}' (display: '{display}')")
            success_count += 1
        except ValueError as e:
            print(f"  ❌ '{raw_name}' → FAILED")
            print(f"     {e}")
    
    print(f"\n{'='*80}")
    print(f"RESULT: {success_count}/{len(test_cases)} teams mapped successfully")
    
    if success_count == len(test_cases):
        print("✅ ALL TEAMS MAPPED - Ready for production!")
    else:
        print(f"❌ {len(test_cases) - success_count} TEAMS UNMAPPED - Fix before production!")
    print(f"{'='*80}")
