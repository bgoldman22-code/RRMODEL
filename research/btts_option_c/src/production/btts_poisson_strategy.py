#!/usr/bin/env python3
"""
Production BTTS Poisson Strategy Module

Implements production-ready BTTS betting strategy with:
- Frozen Poisson model loading
- Guardrails (max 1 bet per match, edge + probability thresholds)
- Clean decision outputs (YES/NO/NO_BET)
- Confidence buckets and Kelly fraction guidance
"""

import joblib
import pandas as pd
import numpy as np
from dataclasses import dataclass, asdict
from typing import Literal, Optional, List, Dict, Any
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

Decision = Literal["YES", "NO", "NO_BET"]


@dataclass
class BttsStrategyConfig:
    """Configuration for production BTTS strategy guardrails"""
    
    yes_prob_threshold: float = 0.55
    no_prob_threshold: float = 0.65
    min_edge: float = 0.02  # Based on bucket analysis showing better ROI > 0.02
    max_vig: float = 0.08   # Reject markets with excessive vig
    prefer_higher_edge: bool = True
    stake: float = 10.0
    
    def __post_init__(self):
        """Validate configuration parameters"""
        assert 0.0 <= self.yes_prob_threshold <= 1.0, "yes_prob_threshold must be in [0, 1]"
        assert 0.0 <= self.no_prob_threshold <= 1.0, "no_prob_threshold must be in [0, 1]"
        assert self.min_edge >= 0.0, "min_edge must be non-negative"
        assert self.max_vig >= 0.0, "max_vig must be non-negative"
        assert self.stake > 0.0, "stake must be positive"


@dataclass
class BttsDecision:
    """Individual match decision with full betting context"""
    
    # Match identification
    match_id: str
    league: str
    kickoff_iso: str
    home_team: str
    away_team: str
    
    # Model probabilities
    p_yes: float
    p_no: float
    
    # Market odds and fair values
    market_yes_odds: Optional[float] = None
    market_no_odds: Optional[float] = None
    fair_yes_odds: Optional[float] = None
    fair_no_odds: Optional[float] = None
    
    # Implied probabilities from fair odds
    implied_p_yes: Optional[float] = None
    implied_p_no: Optional[float] = None
    
    # Edges
    edge_yes: Optional[float] = None
    edge_no: Optional[float] = None
    
    # Decision
    chosen_side: Decision = "NO_BET"
    chosen_edge: float = 0.0
    chosen_prob: float = 0.0
    
    # Guidance
    confidence_bucket: str = "NONE"
    kelly_fraction: float = 0.0
    vig: Optional[float] = None
    rejection_reason: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)


def load_production_poisson_model(model_path: str = "models/btts_poisson_production.joblib"):
    """
    Load frozen Poisson BTTS model from disk
    
    Args:
        model_path: Path to serialized model (relative to research dir or absolute)
        
    Returns:
        Loaded model object (PoissonBTTSModel)
        
    Raises:
        FileNotFoundError: If model file doesn't exist
        ValueError: If model file is corrupted
    """
    path = Path(model_path)
    
    # If relative path, resolve from research directory
    if not path.is_absolute():
        research_dir = Path(__file__).parent.parent.parent
        path = research_dir / model_path
    
    if not path.exists():
        raise FileNotFoundError(
            f"Production model not found at {path}\n"
            f"Please run: python3 scripts/train_btts_poisson_production_model.py"
        )
    
    try:
        model = joblib.load(path)
        print(f"✅ Loaded production Poisson model from {path}")
        return model
    except Exception as e:
        raise ValueError(f"Failed to load model from {path}: {e}")


def compute_fair_two_way_odds(yes_odds: float, no_odds: float) -> tuple[float, float, float]:
    """
    Remove vig from two-way market using proportional scaling
    
    Args:
        yes_odds: Decimal odds for BTTS YES
        no_odds: Decimal odds for BTTS NO
        
    Returns:
        tuple: (fair_yes_odds, fair_no_odds, vig)
        
    Note:
        Returns (None, None, None) if odds are invalid
    """
    if yes_odds is None or no_odds is None or yes_odds <= 1.0 or no_odds <= 1.0:
        return None, None, None
    
    # Convert to implied probabilities
    implied_yes = 1.0 / yes_odds
    implied_no = 1.0 / no_odds
    
    # Calculate vig (overround)
    vig = implied_yes + implied_no - 1.0
    
    # Proportional vig removal
    total_implied = implied_yes + implied_no
    fair_p_yes = implied_yes / total_implied
    fair_p_no = implied_no / total_implied
    
    # Convert back to odds
    fair_yes_odds = 1.0 / fair_p_yes
    fair_no_odds = 1.0 / fair_p_no
    
    return fair_yes_odds, fair_no_odds, vig


def compute_kelly_fraction(odds: float, prob: float, edge: float) -> float:
    """
    Calculate Kelly criterion fraction for a bet
    
    Args:
        odds: Decimal odds
        prob: Model probability
        edge: Edge (model_prob - implied_prob)
        
    Returns:
        Kelly fraction (0 if edge <= 0 or invalid inputs)
        
    Formula:
        kelly = (odds * prob - 1) / (odds - 1)
    """
    if odds is None or odds <= 1.0 or prob <= 0.0 or edge <= 0.0:
        return 0.0
    
    kelly = (odds * prob - 1.0) / (odds - 1.0)
    return max(0.0, kelly)


def assign_confidence_bucket(edge: float, prob: float) -> str:
    """
    Assign confidence bucket based on edge and probability
    
    Args:
        edge: Edge for chosen side
        prob: Model probability for chosen side
        
    Returns:
        "LOW", "MEDIUM", or "HIGH"
        
    Logic:
        - HIGH: edge >= 0.08 OR prob >= 0.75
        - MEDIUM: edge >= 0.04 OR prob >= 0.65
        - LOW: otherwise
    """
    if edge >= 0.08 or prob >= 0.75:
        return "HIGH"
    elif edge >= 0.04 or prob >= 0.65:
        return "MEDIUM"
    else:
        return "LOW"


def compute_btts_decisions_for_fixtures(
    model,
    fixtures_df: pd.DataFrame,
    odds_df: pd.DataFrame,
    config: Optional[BttsStrategyConfig] = None
) -> List[BttsDecision]:
    """
    Generate BTTS betting decisions for a set of fixtures
    
    Args:
        model: Fitted Poisson BTTS model (from load_production_poisson_model)
        fixtures_df: DataFrame with columns:
            - match_id (str): unique match identifier
            - kickoff_iso (str): ISO timestamp
            - home_team (str)
            - away_team (str)
            - home_xg (float): expected goals home
            - away_xg (float): expected goals away
        odds_df: DataFrame with columns:
            - match_id (str): matching fixtures_df.match_id
            - btts_yes_odds (float): decimal odds for BTTS YES
            - btts_no_odds (float): decimal odds for BTTS NO
        config: Optional strategy configuration (uses defaults if None)
        
    Returns:
        List of BttsDecision objects (one per match)
        
    Guardrails:
        - Max 1 bet per match
        - Requires both edge >= min_edge AND prob >= threshold
        - Rejects markets with vig > max_vig
        - Chooses higher edge side when both qualify
    """
    if config is None:
        config = BttsStrategyConfig()
    
    # Merge fixtures with odds
    merged = fixtures_df.merge(
        odds_df,
        on='match_id',
        how='left'
    )
    
    decisions = []
    
    for _, row in merged.iterrows():
        match_id = row['match_id']
        kickoff_iso = row['kickoff_iso']
        home_team = row['home_team']
        away_team = row['away_team']
        
        # Get market odds
        yes_odds = row.get('btts_yes_odds')
        no_odds = row.get('btts_no_odds')
        
        # Create base decision object
        decision = BttsDecision(
            match_id=match_id,
            league="EPL",
            kickoff_iso=kickoff_iso,
            home_team=home_team,
            away_team=away_team,
            p_yes=0.0,  # Will be filled by model
            p_no=0.0,
            market_yes_odds=yes_odds,
            market_no_odds=no_odds
        )
        
        # Check if odds are available
        if pd.isna(yes_odds) or pd.isna(no_odds):
            decision.rejection_reason = "Missing odds"
            decisions.append(decision)
            continue
        
        # Compute fair odds and vig
        fair_yes, fair_no, vig = compute_fair_two_way_odds(yes_odds, no_odds)
        
        if fair_yes is None:
            decision.rejection_reason = "Invalid odds"
            decisions.append(decision)
            continue
        
        decision.fair_yes_odds = fair_yes
        decision.fair_no_odds = fair_no
        decision.vig = vig
        
        # Reject if vig too high
        if vig > config.max_vig:
            decision.rejection_reason = f"Vig too high ({vig:.3f} > {config.max_vig})"
            decisions.append(decision)
            continue
        
        # Get model predictions
        # Create mini dataframe with required features for prediction
        pred_df = pd.DataFrame([{
            'home_xg': row.get('home_xg', 1.5),
            'away_xg': row.get('away_xg', 1.5)
        }])
        
        try:
            p_yes = model.predict_proba(pred_df)[0]
            p_no = 1.0 - p_yes
        except Exception as e:
            decision.rejection_reason = f"Model prediction failed: {e}"
            decisions.append(decision)
            continue
        
        decision.p_yes = float(p_yes)
        decision.p_no = float(p_no)
        
        # Compute implied probabilities from fair odds
        decision.implied_p_yes = 1.0 / fair_yes
        decision.implied_p_no = 1.0 / fair_no
        
        # Compute edges
        edge_yes = p_yes - decision.implied_p_yes
        edge_no = p_no - decision.implied_p_no
        
        decision.edge_yes = float(edge_yes)
        decision.edge_no = float(edge_no)
        
        # Apply guardrails: check YES side
        candidate_yes = (
            p_yes >= config.yes_prob_threshold and
            edge_yes >= config.min_edge
        )
        
        # Apply guardrails: check NO side
        candidate_no = (
            p_no >= config.no_prob_threshold and
            edge_no >= config.min_edge
        )
        
        # Decision logic: max 1 bet per match
        if not candidate_yes and not candidate_no:
            # No bet
            decision.chosen_side = "NO_BET"
            decision.chosen_edge = 0.0
            decision.chosen_prob = 0.0
            decision.rejection_reason = "No side meets criteria"
            
        elif candidate_yes and not candidate_no:
            # Bet YES
            decision.chosen_side = "YES"
            decision.chosen_edge = float(edge_yes)
            decision.chosen_prob = float(p_yes)
            decision.confidence_bucket = assign_confidence_bucket(edge_yes, p_yes)
            decision.kelly_fraction = compute_kelly_fraction(yes_odds, p_yes, edge_yes)
            
        elif candidate_no and not candidate_yes:
            # Bet NO
            decision.chosen_side = "NO"
            decision.chosen_edge = float(edge_no)
            decision.chosen_prob = float(p_no)
            decision.confidence_bucket = assign_confidence_bucket(edge_no, p_no)
            decision.kelly_fraction = compute_kelly_fraction(no_odds, p_no, edge_no)
            
        else:
            # Both qualify: choose higher edge (or break tie by probability)
            if config.prefer_higher_edge:
                if edge_yes >= edge_no:
                    decision.chosen_side = "YES"
                    decision.chosen_edge = float(edge_yes)
                    decision.chosen_prob = float(p_yes)
                    decision.confidence_bucket = assign_confidence_bucket(edge_yes, p_yes)
                    decision.kelly_fraction = compute_kelly_fraction(yes_odds, p_yes, edge_yes)
                else:
                    decision.chosen_side = "NO"
                    decision.chosen_edge = float(edge_no)
                    decision.chosen_prob = float(p_no)
                    decision.confidence_bucket = assign_confidence_bucket(edge_no, p_no)
                    decision.kelly_fraction = compute_kelly_fraction(no_odds, p_no, edge_no)
            else:
                # Break tie by probability
                if p_yes >= p_no:
                    decision.chosen_side = "YES"
                    decision.chosen_edge = float(edge_yes)
                    decision.chosen_prob = float(p_yes)
                    decision.confidence_bucket = assign_confidence_bucket(edge_yes, p_yes)
                    decision.kelly_fraction = compute_kelly_fraction(yes_odds, p_yes, edge_yes)
                else:
                    decision.chosen_side = "NO"
                    decision.chosen_edge = float(edge_no)
                    decision.chosen_prob = float(p_no)
                    decision.confidence_bucket = assign_confidence_bucket(edge_no, p_no)
                    decision.kelly_fraction = compute_kelly_fraction(no_odds, p_no, edge_no)
        
        decisions.append(decision)
    
    # Guardrail assertion: max 1 bet per match
    match_ids = [d.match_id for d in decisions]
    assert len(match_ids) == len(set(match_ids)), "Duplicate match_ids detected!"
    
    # Summary logging
    total_bets = sum(1 for d in decisions if d.chosen_side != "NO_BET")
    yes_bets = sum(1 for d in decisions if d.chosen_side == "YES")
    no_bets = sum(1 for d in decisions if d.chosen_side == "NO")
    no_bet_count = len(decisions) - total_bets
    
    print(f"\n📊 Decision Summary:")
    print(f"   Total matches: {len(decisions)}")
    print(f"   Total bets: {total_bets} ({total_bets / len(decisions) * 100:.1f}%)")
    print(f"   YES bets: {yes_bets}")
    print(f"   NO bets: {no_bets}")
    print(f"   NO BET: {no_bet_count}")
    
    if total_bets > 0:
        avg_edge = np.mean([d.chosen_edge for d in decisions if d.chosen_side != "NO_BET"])
        avg_prob = np.mean([d.chosen_prob for d in decisions if d.chosen_side != "NO_BET"])
        print(f"   Avg edge (bets): {avg_edge:.3f}")
        print(f"   Avg prob (bets): {avg_prob:.3f}")
    
    return decisions


def decisions_to_dataframe(decisions: List[BttsDecision]) -> pd.DataFrame:
    """
    Convert list of decisions to pandas DataFrame for CSV export
    
    Args:
        decisions: List of BttsDecision objects
        
    Returns:
        DataFrame with all decision fields
    """
    return pd.DataFrame([d.to_dict() for d in decisions])


def decisions_to_json_payload(decisions: List[BttsDecision], metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert list of decisions to JSON payload for API serving
    
    Args:
        decisions: List of BttsDecision objects
        metadata: Additional metadata (generated_at, model_version, etc.)
        
    Returns:
        Dictionary ready for JSON serialization
    """
    return {
        **metadata,
        "matches": [d.to_dict() for d in decisions]
    }


if __name__ == '__main__':
    """
    Self-test: load model and compute dummy predictions
    """
    import sys
    from pathlib import Path
    
    print("=" * 80)
    print("BTTS PRODUCTION STRATEGY - SELF TEST")
    print("=" * 80)
    
    # Create dummy fixtures
    fixtures = pd.DataFrame([
        {
            'match_id': 'test_1',
            'kickoff_iso': '2025-12-12T20:00:00Z',
            'home_team': 'Arsenal',
            'away_team': 'Chelsea',
            'home_xg': 1.8,
            'away_xg': 1.5
        },
        {
            'match_id': 'test_2',
            'kickoff_iso': '2025-12-12T20:00:00Z',
            'home_team': 'Man City',
            'away_team': 'Liverpool',
            'home_xg': 2.1,
            'away_xg': 1.9
        }
    ])
    
    # Create dummy odds
    odds = pd.DataFrame([
        {
            'match_id': 'test_1',
            'btts_yes_odds': 1.85,
            'btts_no_odds': 2.05
        },
        {
            'match_id': 'test_2',
            'btts_yes_odds': 1.75,
            'btts_no_odds': 2.20
        }
    ])
    
    print("\n📥 Loading production model...")
    try:
        model = load_production_poisson_model()
    except FileNotFoundError as e:
        print(f"⚠️  {e}")
        print("   Skipping self-test (model not trained yet)")
        sys.exit(0)
    
    print("\n🎯 Computing decisions...")
    config = BttsStrategyConfig(
        yes_prob_threshold=0.55,
        no_prob_threshold=0.65,
        min_edge=0.02
    )
    
    decisions = compute_btts_decisions_for_fixtures(
        model=model,
        fixtures_df=fixtures,
        odds_df=odds,
        config=config
    )
    
    print("\n📋 Decisions:")
    for d in decisions:
        print(f"\n{d.home_team} vs {d.away_team}")
        print(f"  Model: YES={d.p_yes:.3f}, NO={d.p_no:.3f}")
        print(f"  Edges: YES={d.edge_yes:.3f}, NO={d.edge_no:.3f}")
        print(f"  Decision: {d.chosen_side} (edge={d.chosen_edge:.3f}, confidence={d.confidence_bucket})")
    
    print("\n✅ Self-test complete")
