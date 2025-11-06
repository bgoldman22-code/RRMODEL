import fs from 'fs/promises';
import path from 'path';
import { logger } from '../util/logger.mjs';

/**
 * Write JSON and/or CSV outputs
 */
export async function writeOutputs(data, options) {
  const { league, team, week, scoringRules, starters, bench, flexOptions, swaps, notes } = data;
  const { json, csv, out } = options;
  
  // Ensure output directory exists
  await fs.mkdir(out, { recursive: true });
  
  const baseFilename = `sitstart_week${week}_${sanitizeFilename(league.name)}_${sanitizeFilename(team.name)}`;
  
  // JSON output
  if (json) {
    const jsonPath = path.join(out, `${baseFilename}.json`);
    const jsonData = {
      meta: {
        league: league.name,
        team: team.name,
        week,
        generatedAt: new Date().toISOString()
      },
      scoring: scoringRules,
      starters: starters.map(formatPlayerForOutput),
      bench: bench.map(formatPlayerForOutput),
      flexOptions: flexOptions?.map(formatPlayerForOutput) || [],
      swaps: swaps || [],
      notes: notes || []
    };
    
    await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2));
    logger.success(`✓ JSON written to: ${jsonPath}`);
  }
  
  // CSV output
  if (csv) {
    const csvPath = path.join(out, `${baseFilename}.csv`);
    const csvRows = [];
    
    // Header
    csvRows.push([
      'Status',
      'Player',
      'Position',
      'Team',
      'Opponent',
      'Slot',
      'EFP',
      'Score',
      'Tier',
      'Z-Score',
      'IT',
      'Opp_IT',
      'Spread',
      'Injury',
      'Reasons'
    ].join(','));
    
    // Starters
    starters.forEach(player => {
      csvRows.push(formatPlayerForCSV(player, 'STARTER'));
    });
    
    // Bench
    bench.forEach(player => {
      csvRows.push(formatPlayerForCSV(player, 'BENCH'));
    });
    
    await fs.writeFile(csvPath, csvRows.join('\n'));
    logger.success(`✓ CSV written to: ${csvPath}`);
  }
}

/**
 * Format player for JSON output
 */
function formatPlayerForOutput(player) {
  return {
    name: player.full_name,
    position: player.positions[0],
    team: player.team_abbr,
    opponent: player.context?.opponent || null,
    slot: player.slot,
    efp: player.efp,
    score: player.score,
    tier: player.tier,
    zScore: player.zScore || null,
    reasons: player.reasons || [],
    context: {
      impliedTotal: player.context?.impliedTotal || null,
      opponentIT: player.context?.opponentIT || null,
      spread: player.context?.spread || null,
      passLean: player.context?.passLean || 0,
      runLean: player.context?.runLean || 0
    },
    injury: player.status || null,
    bye: player.is_on_bye || false
  };
}

/**
 * Format player for CSV row
 */
function formatPlayerForCSV(player, status) {
  return [
    status,
    escapeCSV(player.full_name),
    player.positions[0],
    player.team_abbr,
    player.context?.opponent || '-',
    player.slot,
    player.efp.toFixed(1),
    player.score.toFixed(1),
    player.tier,
    player.zScore?.toFixed(2) || '-',
    player.context?.impliedTotal?.toFixed(1) || '-',
    player.context?.opponentIT?.toFixed(1) || '-',
    player.context?.spread?.toFixed(1) || '-',
    player.status || '-',
    escapeCSV(player.reasons?.join(' | ') || '-')
  ].join(',');
}

/**
 * Escape CSV field (handle commas, quotes)
 */
function escapeCSV(field) {
  if (typeof field !== 'string') return field;
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Sanitize filename (remove special characters)
 */
function sanitizeFilename(name) {
  return name
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}
