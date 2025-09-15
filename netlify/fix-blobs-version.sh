#!/usr/bin/env bash
set -euo pipefail

PKG=package.json
if ! [ -f "$PKG" ]; then
  echo "package.json not found in current directory" >&2
  exit 1
fi

# Try jq first (safer JSON edit)
if command -v jq >/dev/null 2>&1; then
  tmp=$(mktemp)
  cat "$PKG" | jq '
    ( .dependencies     |= ( . // {} | .["@netlify/blobs"] = "^6" ) ) |
    ( .devDependencies  |= ( . // {} ) )
  ' > "$tmp"
  mv "$tmp" "$PKG"
  echo "Updated @netlify/blobs to ^6 using jq."
else
  # Fallback to sed: replace any @netlify/blobs version with ^6
  # Works for both dependencies and devDependencies blocks.
  sed -E -i.bak 's/"@netlify\/blobs"\s*:\s*"[^"]+"/"@netlify\/blobs": "^6"/g' "$PKG" || true
  echo "Updated @netlify/blobs to ^6 using sed (created package.json.bak)."
fi

echo "Done."
