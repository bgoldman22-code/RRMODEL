#!/usr/bin/env node

/**
 * Build a date-based sample file for the NHL odds fetcher.
 * Usage:
 *   node scripts/nhl/build-date-sample.mjs --out=data/nhl/pass3_7k_dates.json \
 *        --ranges=2024-02-01:2024-04-30,2024-10-01:2024-12-31,2025-01-01:2025-03-31
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const argv = process.argv.slice(2);
function getArg(name, def) {
  const a = argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}

const outFile = getArg('out', path.join(REPO_ROOT, 'data/nhl/pass3_7k_dates.json'));
const rangesArg = getArg('ranges', '2024-02-01:2024-04-30,2024-10-01:2024-12-31,2025-01-01:2025-03-31');

function parseDate(str) { return new Date(str + 'T00:00:00Z'); }

const ranges = rangesArg.split(',').map(r => {
  const [s, e] = r.split(':');
  return { start: parseDate(s), end: parseDate(e) };
});

const gamesPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
const raw = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
const allGames = raw.games || [];

const dateSet = new Set();
for (const g of allGames) {
  const d = parseDate(g.gameDate);
  for (const r of ranges) {
    if (d >= r.start && d <= r.end) {
      dateSet.add(g.gameDate);
      break;
    }
  }
}

const dates = Array.from(dateSet).sort();
const payload = { dates: dates.map(date => ({ date })) };

fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(`✅ Wrote ${dates.length} dates to ${outFile}`);
