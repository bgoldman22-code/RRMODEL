// scripts/check-sass.mjs
import { readFileSync, existsSync } from 'node:fs';

function hasDep(name) {
  try {
    const pkg = JSON.parse(readFileSync('package.json','utf8'));
    return (pkg.dependencies && pkg.dependencies[name]) || (pkg.devDependencies && pkg.devDependencies[name]);
  } catch { return false; }
}

const hasNodeSass = hasDep('node-sass');
const hasSass = hasDep('sass');

if (hasNodeSass && !hasSass) {
  console.error('[sass-check] ERROR: "node-sass" detected without "sass". On Node 20 this will fail. Install "sass".');
  process.exit(2);
}

if (!hasSass) {
  console.warn('[sass-check] WARN: "sass" is not in your dependencies. If you import .scss/.sass, install it: npm i -D sass');
} else {
  console.log('[sass-check] OK: "sass" present');
}

console.log('[sass-check] Node', process.version);
