# NFL V5 Layout Regression Debug Log

## 1. Repository & History Check (2025-11-18)
- Current branch: `main42`
- `git status -sb` shows untracked NBA backtest files plus modified `dist/data/...`; CSS-related files clean.
- Recent commits of interest:
  - `91136260` `chore: regenerate dist redirects`
  - `55122671` `chore: remove invalid netlify redirect`
  - `bfd90a55` redirect + NFL V5 function update
  - `8f5d4c0a` NHL top-level await fix (possible shared impact)
  - `82bc9102`, `87b04cdb`, `3ffd4f5e` – EPA calibration + spread display (model logic only).

> Next: reproduce locally and compare asset loading.

## 2. Diagnosis (2025-11-18)
- `dist/index.html` still injects Tailwind via `<script src="https://cdn.tailwindcss.com">`; no compiled CSS ships with the bundle.
- Production fetch (`curl -I https://rrmodel.netlify.app/nfl-v5`) confirms Netlify serves the same HTML shell, so if the CDN script is blocked (CSP tightening, browser extension, flaky CDN), there is **zero fallback CSS** and every Tailwind class becomes a no-op.
- Local dev works because the CDN script loads unhindered; the unstyled `/nfl-v5` screenshot is exactly what the DOM looks like with pure HTML but no Tailwind utilities.

**Root cause:** CSS is loaded via Tailwind Play CDN at runtime instead of the Vite build. Any CSP/extension/ad blocker that blocks the CDN script leaves the entire React app unstyled.

## 3. Fix (2025-11-18)
- Installed `tailwindcss@3.4.16`, `postcss`, and `autoprefixer` as dev deps.
- Added `tailwind.config.js` (scanning `index.html` + `src/**/*.{js,ts,jsx,tsx}`) and `postcss.config.js`.
- Created `src/index.css` with Tailwind directives + baseline body styles and imported it in `src/main.jsx`.
- Removed the CDN `<script>` from `index.html`; Vite now emits `dist/assets/index-*.css` that ships with the build.

## 4. Verification (2025-11-18)
- `npm run build` ✓ (Vite bundles 67 modules, Tailwind CSS output = `dist/assets/index-LhyHhcpS.css`).
- `dist/index.html` now references bundled CSS and no longer depends on remote scripts.
- NFL V5 route + nav should regain full styling once the new build deploys (Netlify will serve the generated CSS alongside JS).
