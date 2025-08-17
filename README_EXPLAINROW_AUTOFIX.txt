ExplainRow Auto-fix Pack (v3)
=============================

This ensures `explainRow` is defined and imported, without manual edits.

Adds:
- src/utils/why.js  (exports { explainRow })
- scripts/ensure-explain-import.mjs  (inserts the import if missing)
- scripts/fix-explain-call.mjs      (converts invalid call syntax to object-form)

How to wire:
1) Commit these files.
2) In package.json scripts, set:
   {
     "scripts": {
       "prebuild": "node ./scripts/ensure-explain-import.mjs && node ./scripts/fix-explain-call.mjs",
       "build": "vite build"
     }
   }

If you already have a prebuild, append the two node commands with &&.
The scripts are idempotent and safe — they only modify src/MLB.jsx if needed.
