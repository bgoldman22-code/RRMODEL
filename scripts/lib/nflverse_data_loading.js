// scripts/lib/nflverse_data_loading.js
// Robust NFLverse loader with gzip handling, CSV parsing, retries, and timeouts.

import { setTimeout as sleep } from 'timers/promises';
import zlib from 'zlib';
import { parse } from 'csv-parse/sync';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function download(url, attempt = 1) {
  try {
    const res = await fetchWithTimeout(url, {}, DEFAULT_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf;
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    const backoff = 500 * (2 ** (attempt - 1));
    console.warn(`[loader] Retry ${attempt} for ${url} after ${backoff}ms: ${err.message}`);
    await sleep(backoff);
    return download(url, attempt + 1);
  }
}

function parseCSV(buffer) {
  // Handle gzip if needed
  let raw;
  try {
    raw = zlib.gunzipSync(buffer);
  } catch {
    raw = buffer; // not gzipped
  }
  const text = raw.toString('utf8');
  // Parse with csv-parse (handles quotes/commas/newlines robustly)
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true
  });
  return records;
}

export async function loadNFLversePBP(season) {
  // Prefer CSV.gz path for widest compatibility
  const csvUrl = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
  console.log(`[loader] Downloading PBP CSV for ${season}`);
  const buf = await download(csvUrl);
  const pbp = parseCSV(buf);
  console.log(`[loader] Parsed ${pbp.length} plays for ${season}`);
  return pbp;
}

// Optional local/DuckDB loaders can be added similarly to earlier stubs if needed.
