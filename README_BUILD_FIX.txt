If you see the same error again, double-check:
1) Commit your package-lock.json if you want to keep `npm ci`. Otherwise this bundle switches to `npm install` in netlify.toml.
2) Ensure `src/utils/why.js` exists and exports `buildWhy` (the prebuild script will fail early if not).
3) If you use CommonJS functions, rename them to .cjs in a `"type":"module"` package.
