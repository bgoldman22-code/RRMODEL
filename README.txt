# patch-step1i-deps-hardfix
This patch replaces `netlify/build-debug.sh` with a stronger script that fixes npm integrity issues for `debug`:
- Cleans npm cache
- Deletes `package-lock.json` and `node_modules`
- Forces registry to npmjs.org
- Prefetches `debug@4.3.4` tarball to warm cache
- Sets `overrides.debug = "4.3.4"` and normalizes any direct `debug` dependency
- Installs with `--prefer-online --no-audit` and retries

## Apply
1) Upload this entire `patch-step1i-deps-hardfix` folder to your repo root and commit.
2) Ensure Netlify build command is: `bash netlify/build-debug.sh`
3) Redeploy.
