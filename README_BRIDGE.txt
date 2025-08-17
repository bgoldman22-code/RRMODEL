Bridge/Probe Instructions
=========================

Goal: Safely re-introduce your real app without white-screen crashes.

1) In your repo, rename your current app entry:
   src/App.jsx  -->  src/App.real.jsx

2) Drop THIS file in place as the new src/App.jsx (from the zip). It lazy-loads
   App.real.jsx inside an ErrorBoundary. If your real app throws during render or
   has a bad import, you'll see a readable error panel instead of a blank page.

3) Commit and deploy. If the page errors, the yellow ErrorBoundary panel will show
   the exact file/line. Fix that file, redeploy, repeat.

Notes:
- You already have ErrorBoundary.jsx and main.jsx mounting <App /> from previous steps.
- Keep import paths case-exact and include .js extension when importing plain JS (e.g. "./utils/why.js").
