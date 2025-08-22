# Variance Knobs — Adjusted-v2

This function recalculates on **every POST** and outputs three tracks:
- `control` — lineup validation only
- `adjusted-v1` — slugger floor + cluster bump (mid)
- `adjusted-v2` — variance knobs (PEP, odds band, repeat dampener, form nudge, second-tier)

## Endpoint
`/.netlify/functions/mlb-hr-generate-exp2`

### POST body
```json
{
  "picks": [ { "player":"...", "team":"...", "model_hrp":0.29, "odds":340 } ],
  "known_out": ["Shohei Ohtani"],
  "ctx": {
    "yesterday": ["Aaron Judge","Giancarlo Stanton"],
    "form": {
      "Brenton Doyle": { "xwoba7_pct": 0.90, "barrel7": 0.11, "k7": 0.26 }
    },
    "pep_names": ["Willson Contreras","James Wood"],
    "matchup": {
      "Willson Contreras": { "opponent": "Sandy Alcantara" }
    },
    "pep_map": {
      "Sandy Alcantara": { "hr9_30": 0.6, "brl_allowed_30": 0.7, "punished_pitch": true }
    }
  }
}
```

All `ctx` fields are **optional**. If omitted, those features simply don't fire.

## Knobs
See `src/utils/knobs.cjs` for defaults. Tweak numbers as you like; the function will apply caps:
- Max combined bump per player: **+0.03**
- Max HR probability: **0.60**

## Outputs
Blobs are written to:
- `mlb-hr/experiments/YYYY-MM-DD/control.json`
- `mlb-hr/experiments/YYYY-MM-DD/adjusted-v1.json`
- `mlb-hr/experiments/YYYY-MM-DD/adjusted-v2.json`
