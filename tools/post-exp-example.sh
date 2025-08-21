#!/usr/bin/env bash
# Example: Post baseline picks directly to your Netlify function
# Replace YOUR_SITE with your Netlify site host
set -euo pipefail
SITE="https://YOUR_SITE.netlify.app"
curl -sS -X POST "$SITE/.netlify/functions/mlb-hr-generate-exp"   -H "content-type: application/json"   --data @tools/post-exp-example.json | jq .
