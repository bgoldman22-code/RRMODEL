// scripts/preinstall-fix.js
// Permanently enforce debug@4.3.4 and sanitize any bad refs before npm install.
const fs = require('fs');

const pkgPath = 'package.json';
if (!fs.existsSync(pkgPath)) {
  console.log('[preinstall-fix] No package.json found; skipping.');
  process.exit(0);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Ensure overrides exists and pins debug
pkg.overrides = Object.assign({}, pkg.overrides, { debug: "4.3.4" });

// Normalize direct dependency if present
['dependencies','devDependencies'].forEach(sec => {
  if (pkg[sec] && pkg[sec].debug) {
    pkg[sec].debug = "4.3.4";
  }
});

// Ensure scripts.preinstall runs this script (idempotent if already set)
pkg.scripts = pkg.scripts || {};
const hook = 'node scripts/preinstall-fix.js';
if (!pkg.scripts.preinstall || !pkg.scripts.preinstall.includes('scripts/preinstall-fix.js')) {
  pkg.scripts.preinstall = pkg.scripts.preinstall
    ? `${pkg.scripts.preinstall} && ${hook}`
    : hook;
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('[preinstall-fix] Applied overrides.debug=4.3.4 and ensured preinstall hook.');
