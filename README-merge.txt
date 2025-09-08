# patch-step3n-netlify-toml-cron

This patch provides a ready-to-use `netlify.toml` that:
- Keeps your build command and functions directory settings
- Preserves SPA redirect
- Adds a daily scheduled function for the FantasyPros depth chart importer at 11:30 AM ET (15:30 UTC).

If you already have a `netlify.toml` with additional sections, you can **merge** just the block below into your existing file:

```toml
[[scheduled.functions]]
name = "nfl-depthcharts-import-fantasypros"
cron = "30 15 * * *"   # 11:30 AM ET daily
```

Make sure the function exists at: `netlify/functions/nfl-depthcharts-import-fantasypros/index.cjs`.
