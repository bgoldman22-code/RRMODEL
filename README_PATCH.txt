Repo patch for Netlify Functions (.cjs) — explicit Blobs credentials using object form

Changed files:
- netlify/functions/odds-refresh-multi.cjs
- netlify/functions/odds-get.cjs
- netlify/functions/odds-refresh.cjs

What changed:
- Replaced getStore(name, { siteID, token }) and getStore(name) calls with object form:
  getStore({ name: storeName, siteID: SITE_ID, token: BLOBS_TOKEN })

Action items:
- Remove any conflicting files:
  netlify/functions/odds-refresh-multi.js
  netlify/functions/odds-refresh-multi.mjs
  netlify/functions/odds-refresh.js
  netlify/functions/odds-get.js
  netlify/functions/odds-refresh-multi.js.bak
- Commit these three .cjs files and redeploy.
