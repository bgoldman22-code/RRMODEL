import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal "build" to satisfy Netlify. Ensures dist/index.html exists.
const dist = path.join(__dirname, '..', 'dist');
const index = path.join(dist, 'index.html');
if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
if (!fs.existsSync(index)) {
  fs.writeFileSync(index, '<!doctype html><title>RRModel</title><h1>RRModel</h1>');
}

// Print small env/debug block
console.log('Build OK at', new Date().toISOString());
