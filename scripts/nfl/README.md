# NFL Predictions - Local Development

Run NFL prediction models locally without deploying to Netlify.

## Scripts

### NFL V1 (Production System)
```bash
node scripts/nfl/run-v1-local.mjs [season] [week]
```

**Features:**
- Full production V1 system with injury penalties, EPA, Kelly sizing
- Uses Netlify Blobs for data storage
- 4100+ lines of sophisticated logic

**Example:**
```bash
# Run for current week
node scripts/nfl/run-v1-local.mjs 2025

# Run for specific week
node scripts/nfl/run-v1-local.mjs 2025 14
```

### NFL V5 (Frozen Coefficients)
```bash
node scripts/nfl/run-v5-local.mjs [season] [week]
```

**Features:**
- Frozen V5 coefficients (no dependency on V1)
- Generates predictions to `nfl-model-v4.1/output/`
- Clean separation from production codebase

**Example:**
```bash
# Run for specific week (week is required)
node scripts/nfl/run-v5-local.mjs 2025 14
```

## Requirements

- Node.js 18+
- Netlify Blobs access (for V1)
- Data files populated in Netlify Blobs

## Output

### V1 Output
- Returns JSON with predictions, recommended bets, Kelly sizing
- Stores results in Netlify Blobs

### V5 Output
- Writes to `nfl-model-v4.1/output/v5-predictions-week-{week}.json`
- Self-contained prediction bundle with all game data

## Environment Variables

V1 requires these environment variables (from `.env`):
```
NETLIFY_AUTH_TOKEN=your_token
NETLIFY_SITE_ID=your_site_id
```

V5 runs standalone without environment variables.

## Troubleshooting

### V1 Issues
- **Missing data**: Ensure Netlify Blobs are populated with:
  - Advanced metrics
  - Injury data
  - Depth charts
  - Schedule data

- **Authentication errors**: Check `NETLIFY_AUTH_TOKEN` is set

### V5 Issues
- **Script not found**: Ensure `nfl-model-v4.1/scripts/generate-v5-week.mjs` exists
- **Output errors**: Check write permissions on `nfl-model-v4.1/output/` directory

## Development Workflow

1. **Test locally** with these scripts
2. **Verify output** matches expectations
3. **Deploy** via git push (triggers Netlify build)
4. **Compare** local vs production results

## Notes

- V1 is the **production system** used on bgroundrobin.com
- V5 is a **comparison model** with frozen coefficients
- Both can run independently
- Local runs don't affect production data (unless you explicitly save to Blobs)
