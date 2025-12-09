#!/usr/bin/env python3
"""
Team Name Utilities for EPL BTTS System
========================================

Canonical team name normalization for merging results and odds data.

This module provides a single source of truth for mapping:
- Results file names: "Manchester City FC", "Brighton & Hove Albion FC", etc.
- Odds file names: "mancity", "brighton", etc.

Both map to the same short canonical form (e.g., "mancity").
"""

import re

def standardize_team_name(name):
    """
    Normalize team names for consistent matching between results and odds files.
    
    This function handles multiple input formats and maps them all to a canonical
    short form used throughout the EPL BTTS system.
    
    Examples:
        "Manchester City FC" → "mancity"
        "mancity" → "mancity"
        "Man City" → "mancity"
        "Brighton & Hove Albion FC" → "brighton"
        "brighton" → "brighton"
        "Wolverhampton Wanderers FC" → "wolves"
        "wolves" → "wolves"
    
    Args:
        name (str): Team name in any format
        
    Returns:
        str: Canonical short name (lowercase, no spaces)
    """
    if not isinstance(name, str):
        name = str(name)
    
    name = name.lower().strip()
    
    # Direct mappings (highest priority)
    # These handle exact matches from both files
    direct_mappings = {
        # Manchester teams
        'manchester city fc': 'mancity',
        'manchester city': 'mancity',
        'man city': 'mancity',
        'mancity': 'mancity',
        'manchester united fc': 'manutd',
        'manchester united': 'manutd',
        'man united': 'manutd',
        'manutd': 'manutd',
        
        # London teams
        'arsenal fc': 'arsenal',
        'arsenal': 'arsenal',
        'chelsea fc': 'chelsea',
        'chelsea': 'chelsea',
        'tottenham hotspur fc': 'tottenham',
        'tottenham hotspur': 'tottenham',
        'tottenham': 'tottenham',
        'crystal palace fc': 'palace',
        'crystal palace': 'palace',
        'palace': 'palace',
        'west ham united fc': 'westham',
        'west ham united': 'westham',
        'west ham': 'westham',
        'westham': 'westham',
        'fulham fc': 'fulham',
        'fulham': 'fulham',
        'brentford fc': 'brentford',
        'brentford': 'brentford',
        
        # Other big clubs
        'liverpool fc': 'liverpool',
        'liverpool': 'liverpool',
        'aston villa fc': 'villa',
        'aston villa': 'villa',
        'villa': 'villa',
        'everton fc': 'everton',
        'everton': 'everton',
        'newcastle united fc': 'newcastle',
        'newcastle united': 'newcastle',
        'newcastle': 'newcastle',
        
        # Midlands/North
        'leicester city fc': 'leicester',
        'leicester city': 'leicester',
        'leicester': 'leicester',
        'nottingham forest fc': 'forest',
        'nottingham forest': 'forest',
        'forest': 'forest',
        'wolverhampton wanderers fc': 'wolves',
        'wolverhampton wanderers': 'wolves',
        'wolverhampton': 'wolves',
        'wolves': 'wolves',
        'leeds united fc': 'leeds',
        'leeds united': 'leeds',
        'leeds': 'leeds',
        'sheffield united fc': 'sheffieldutd',
        'sheffield united': 'sheffieldutd',
        'sheffield': 'sheffieldutd',
        
        # South coast
        'brighton & hove albion fc': 'brighton',
        'brighton and hove albion fc': 'brighton',
        'brighton & hove albion': 'brighton',
        'brighton': 'brighton',
        'southampton fc': 'southampton',
        'southampton': 'southampton',
        'afc bournemouth': 'bournemouth',
        'bournemouth': 'bournemouth',
        
        # Smaller clubs
        'burnley fc': 'burnley',
        'burnley': 'burnley',
        'watford fc': 'watford',
        'watford': 'watford',
        'norwich city fc': 'norwich',
        'norwich city': 'norwich',
        'norwich': 'norwich',
        'luton town fc': 'luton',
        'luton town': 'luton',
        'luton': 'luton',
        'ipswich town fc': 'ipswich',
        'ipswich town': 'ipswich',
        'ipswich': 'ipswich',
        'sunderland afc': 'sunderland',
        'sunderland': 'sunderland',
        
        # Historical/other clubs
        'west bromwich albion fc': 'westbrom',
        'west bromwich albion': 'westbrom',
        'west brom': 'westbrom',
        'westbrom': 'westbrom',
        'stoke city fc': 'stoke',
        'stoke city': 'stoke',
        'stoke': 'stoke',
        'swansea city': 'swansea',
        'swansea': 'swansea',
        'huddersfield town fc': 'huddersfield',
        'huddersfield town': 'huddersfield',
        'huddersfield': 'huddersfield',
        'cardiff city fc': 'cardiff',
        'cardiff city': 'cardiff',
        'cardiff': 'cardiff',
    }
    
    # Check direct mapping first
    if name in direct_mappings:
        return direct_mappings[name]
    
    # Fallback: algorithmic normalization
    # Remove common suffixes and clean up
    name = re.sub(r'\s+(fc|afc)$', '', name)
    name = re.sub(r'\s+united$', '', name)
    name = re.sub(r'\s+city$', '', name)
    name = re.sub(r'\s+hotspur$', '', name)
    name = re.sub(r'\s+town$', '', name)
    name = re.sub(r'\s+&.*$', '', name)  # Remove "& Hove Albion"
    name = re.sub(r'\s+and\s+.*$', '', name)  # Remove "and ..."
    name = re.sub(r'\s+', '', name)  # Remove all remaining spaces
    
    # Secondary fallback mappings
    fallback = {
        'manchester': 'mancity',
        'tottenham': 'tottenham',
        'westham': 'westham',
        'astonvilla': 'villa',
        'newcastle': 'newcastle',
        'brighton': 'brighton',
        'nottinghamforest': 'forest',
        'wolverhamptonwanderers': 'wolves',
        'wolverhampton': 'wolves',
        'leicester': 'leicester',
        'crystalpalace': 'palace',
        'sheffield': 'sheffieldutd',
        'westbromwich': 'westbrom',
        'westbromwichalbion': 'westbrom',
        'luton': 'luton',
        'ipswich': 'ipswich',
        'sunderland': 'sunderland',
    }
    
    return fallback.get(name, name)


# Alias for backward compatibility
normalize_team_name = standardize_team_name
