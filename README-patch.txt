# Patch: nfl-train URL fix + logs

Updated the trainer to use the **correct nflfastR paths**:

- `data/games/games_{YEAR}.csv.gz` (primary)
- fallback to uncompressed `.csv`
- fallback to legacy `data/games/{YEAR}.csv.gz`

Also keeps the Blobs helper you already integrated. Lots of logs added.

Deployed at: 2025-09-14T05:40:46.428417Z
