
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
const content = `<!doctype html>
<meta charset="utf-8">
<title>RRModel build OK</title>
<style>body{font:16px system-ui;margin:3rem;} code{background:#f4f4f4;padding:.15rem .3rem;border-radius:.3rem}</style>
<h1>RRModel: Build OK</h1>
<p>Generated 2025-09-15T16:28:45.632548</p>
<p>If you have a frontend build, replace this debug builder with your real one.</p>`;
fs.writeFileSync(path.join(dist, 'index.html'), content);
console.log('Created dist/index.html');
