import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
}
const indexPath = path.join(dist, 'index.html');
if (!fs.existsSync(indexPath)) {
  fs.writeFileSync(indexPath, '<!doctype html><meta charset="utf-8"><title>RRModel</title><p>Build OK.</p>');
}
console.log('[build-debug] Wrote dist/index.html');
