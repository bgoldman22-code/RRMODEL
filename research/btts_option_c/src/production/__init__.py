"""
Production BTTS Strategy Module

Provides production-ready BTTS prediction functionality with:
- Frozen model loading
- Guardrails (max 1 bet per match, edge/probability thresholds)
- Clean decision outputs (YES/NO/NO_BET)
- JSON/CSV export capabilities
"""

from .btts_poisson_strategy import (
    BttsDecision,
    BttsStrategyConfig,
    load_production_poisson_model,
    compute_btts_decisions_for_fixtures,
    decisions_to_dataframe,
    decisions_to_json_payload
)

__all__ = [
    'BttsDecision',
    'BttsStrategyConfig',
    'load_production_poisson_model',
    'compute_btts_decisions_for_fixtures',
    'decisions_to_dataframe',
    'decisions_to_json_payload'
]
