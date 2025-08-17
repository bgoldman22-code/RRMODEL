# React Build Fix (No UI changes)

This package guarantees `react`, `react-dom`, `vite`, and `@vitejs/plugin-react` are available
at build time **without you editing files manually**.

## What it does
- Adds a prebuild script: `scripts/prebuild-install-react.mjs`
  - If any of the four packages are missing, it installs them (adds to package.json & lockfile).
- Provides a `netlify.toml` that runs that prebuild before `npm run build`.

## How to use
1) Drop these two paths into your repo (keep the same locations):
   - `scripts/prebuild-install-react.mjs`
   - `netlify.toml` (replace if you already have one; it preserves SPA redirect).
2) Push to your production branch on Netlify.

That’s it — the next deploy will install what’s missing automatically and proceed with your build.
