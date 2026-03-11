import json
from collections import defaultdict
from datetime import datetime

with open('/Users/brentgoldman/Desktop/REPO33/RRMODEL/data/nba/models/totals_v3_comparison_results.json') as f:
    data = json.load(f)

print("Keys in comparison results:", list(data.keys()))
print()

# Check if raw test results are stored
if 'testResults' in data:
    print(f"Found testResults: {len(data['testResults'])} entries")
    # Peek at structure
    if data['testResults']:
        print("Sample entry keys:", list(data['testResults'][0].keys()))
        print("Sample:", json.dumps(data['testResults'][0], indent=2)[:500])
elif 'results' in data:
    print(f"Found results: {len(data['results'])} entries")
elif 'roiBreakdown' in data:
    print("Found roiBreakdown")
    for k, v in data['roiBreakdown'].items():
        print(f"  {k}: {v}")

# Print all top-level info
for k, v in data.items():
    if isinstance(v, (str, int, float, bool)):
        print(f"  {k}: {v}")
    elif isinstance(v, list):
        print(f"  {k}: list of {len(v)}")
    elif isinstance(v, dict):
        print(f"  {k}: dict with {len(v)} keys")
