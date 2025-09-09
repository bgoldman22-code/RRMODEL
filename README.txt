# NFL TD explicit Blobs store patch

- Forces NFL functions to use `getStore('nfl-td')`.
- Avoids any overlap with MLB stores.
- Works in Netlify production without extra env vars.

Test after deploy:
1) /.netlify/functions/nfl-depthcharts-seed?season=2025&week=1
2) /.netlify/functions/nfl-depthcharts-get?season=2025&week=1
3) /.netlify/functions/nfl-depthcharts-get