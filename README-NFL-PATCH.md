# NFL Blobs Patch
- Ensures NFL Netlify Functions use the correct Blobs store.
- No `node-fetch` import (uses global fetch).
- Files:
  - netlify/functions/nfl-bootstrap.mjs
  - netlify/functions/nfl-td-candidates.mjs

**Env var required**
- BLOBS_STORE_NFL = nfl-td  (or your chosen store name)

**Sanity checks after deploy**
- /.netlify/functions/nfl-bootstrap?debug=1
- /.netlify/functions/nfl-td-candidates?debug=1
