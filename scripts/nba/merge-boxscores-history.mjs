#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_FILE = path.join(__dirname, '../../data/nba/player-history-2024-2026.json');
const BOX_SCORES_FILE = path.join(__dirname, '../../data/nba/player-boxscores-2025-26.json');

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // Already in YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().split('T')[0];
}

function normalizeRecord(record) {
  const date = normalizeDate(record.gameDate);
  const gameDateUTC = date ? new Date(`${date}T00:00:00Z`).toISOString() : null;
  return {
    season: record.season,
    gameId: record.gameId,
    gameDate: date || record.gameDate,
    gameDateUTC,
    playerId: record.playerId,
    playerName: record.playerName,
    teamId: record.teamId || record.teamTricode || null,
    teamTricode: record.teamTricode,
    opponentId: record.opponentId || record.opponentTricode || null,
    opponentTricode: record.opponentTricode,
    homeAway: record.isHome ? 'home' : 'away',
    team: record.teamTricode,
    opponent: record.opponentTricode,
    points: record.points,
    rebounds: record.rebounds,
    assists: record.assists,
    minutes: record.minutes,
    steals: record.steals,
    blocks: record.blocks,
    turnovers: record.turnovers,
    fouls: record.fouls,
    fgMade: record.fgMade,
    fgAtt: record.fgAtt,
    fg3Made: record.fg3Made,
    fg3Att: record.fg3Att,
    ftMade: record.ftMade,
    ftAtt: record.ftAtt,
    oreb: record.oreb,
    dreb: record.dreb,
    plusMinus: record.plusMinus,
    sourceLog: 'player-boxscores-2025-26.json',
    date: date || record.gameDate
  };
}

async function loadJson(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function main() {
  console.log('🔄 Merging daily boxscores into canonical history...');
  const [history, boxscores] = await Promise.all([
    loadJson(HISTORY_FILE),
    loadJson(BOX_SCORES_FILE)
  ]);

  console.log(`   Loaded ${history.length} existing history records`);
  console.log(`   Loaded ${boxscores.length} daily boxscores`);

  const historyMap = new Map();
  for (const record of history) {
    const key = `${record.playerName}|${record.date || record.gameDate}`;
    historyMap.set(key, record);
  }

  let inserted = 0;
  let updated = 0;

  for (const rawRecord of boxscores) {
    const normalized = normalizeRecord(rawRecord);
    if (!normalized.date || !normalized.playerName) continue;
    const key = `${normalized.playerName}|${normalized.date}`;
    const existing = historyMap.get(key);
    if (!existing) {
      inserted++;
    } else if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
      updated++;
    } else {
      continue;
    }
    historyMap.set(key, normalized);
  }

  const merged = Array.from(historyMap.values()).sort((a, b) => {
    const dateA = (a.date || a.gameDate || '').localeCompare(b.date || b.gameDate || '');
    if (dateA !== 0) return dateA;
    return (a.playerName || '').localeCompare(b.playerName || '');
  });

  await writeFile(HISTORY_FILE, JSON.stringify(merged, null, 2));

  console.log(`✅ History updated: ${merged.length} total records`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Updated: ${updated}`);
}

main().catch(err => {
  console.error('❌ Merge failed:', err);
  process.exit(1);
});
