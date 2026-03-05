#!/usr/bin/env node
/**
 * NBA Shadow Evaluation – Main Entrypoint
 * 
 * Replays historical dates against a FROZEN model version,
 * joins predictions to actual outcomes, and computes
 * PRE vs POST deadline error metrics.
 * 
 * SAFETY:
 * - Requires SHADOW_EVAL=1 to run.
 * - Outputs only to ./shadow_eval/out/ (enforced).
 * - Never imports production entrypoints with side effects.
 * - Never writes to production Blob keys.
 * 
 * Usage:
 *   SHADOW_EVAL=1 node scripts/nba_shadow_eval/run_shadow_eval.mjs \
 *     --model_version v_current \
 *     --date_start 2026-01-15 \
 *     --date_end 2026-02-09 \
 *     --deadline 2026-02-06 \
 *     --mode both \
 *     --out ./shadow_eval/out/shadow_eval.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { fetchGamesForDate, fetchClosingLines, delay } from './lib/espn_fetcher.mjs';
import { FrozenPredictor } from './lib/frozen_predictor.mjs';
import { computeMetrics, splitByDeadline } from './lib/metrics.mjs';
import { writeCSV, writeSummaryJSON, writeMarkdownReport, writeRunMetadata } from './lib/reporter.mjs';
import { runRetrainComparison } from './lib/retrain_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY GUARDS
// ═══════════════════════════════════════════════════════════════════════════

if (process.env.SHADOW_EVAL !== '1') {
  console.error('❌ FATAL: SHADOW_EVAL=1 environment variable required.');
  console.error('   This script is isolated from production. Set SHADOW_EVAL=1 to proceed.');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI ARGUMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const modelVersion = getArg('--model_version');
const dateStart = getArg('--date_start');
const dateEnd = getArg('--date_end');
const deadline = getArg('--deadline');
const mode = getArg('--mode', 'both');
const outPath = getArg('--out', './shadow_eval/out/shadow_eval.csv');
const retrainWindowsRaw = getArg('--retrain_windows'); // e.g. "2,4,6,10"
const holdoutDaysRaw = getArg('--holdout_days', '14');

const retrainWindows = retrainWindowsRaw ? retrainWindowsRaw.split(',').map(Number).filter(n => n > 0) : null;
const holdoutDays = parseInt(holdoutDaysRaw, 10) || 14;

if (!modelVersion || !dateStart || !dateEnd || !deadline) {
  console.error(`
Usage:
  SHADOW_EVAL=1 node scripts/nba_shadow_eval/run_shadow_eval.mjs \\
    --model_version v_current \\
    --date_start YYYY-MM-DD \\
    --date_end YYYY-MM-DD \\
    --deadline YYYY-MM-DD \\
    --mode [margin|prob|both] \\
    --out ./shadow_eval/out/shadow_eval.csv \\
    --retrain_windows 2,4,6,10 \\
    --holdout_days 14

  Part 1 (PRE vs POST): Always runs. Splits by --deadline.
  Part 2 (Retrain):     Runs when --retrain_windows is provided.
                         Uses --deadline as holdout start.
                         Trains on trailing W-week windows, evaluates on holdout.
`);
  process.exit(1);
}

if (!['margin', 'prob', 'both'].includes(mode)) {
  console.error(`❌ Invalid --mode: "${mode}". Must be margin, prob, or both.`);
  process.exit(1);
}

// ── Output path safety: must be under ./shadow_eval/ ────────────────────────
const resolvedOut = path.resolve(outPath);
const shadowBase = path.resolve(REPO_ROOT, 'shadow_eval');
if (!resolvedOut.startsWith(shadowBase)) {
  console.error(`❌ FATAL: Output path must be inside ./shadow_eval/`);
  console.error(`   Got: ${resolvedOut}`);
  console.error(`   Expected prefix: ${shadowBase}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATE RANGE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateDateRange(start, end) {
  const dates = [];
  let current = new Date(start + 'T12:00:00Z'); // Noon UTC to avoid DST issues
  const endDate = new Date(end + 'T12:00:00Z');
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ═══════════════════════════════════════════════════════════════════════════
// GIT COMMIT HASH
// ═══════════════════════════════════════════════════════════════════════════

function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🏀 NBA Shadow Evaluation Harness');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Model Version:  ${modelVersion}`);
  console.log(`  Date Range:     ${dateStart} → ${dateEnd}`);
  console.log(`  Deadline:       ${deadline}`);
  console.log(`  Mode:           ${mode}`);
  console.log(`  Output:         ${resolvedOut}`);
  if (retrainWindows) {
    console.log(`  Retrain Windows: ${retrainWindows.map(w => `${w}wk`).join(', ')}`);
    console.log(`  Holdout Days:   ${holdoutDays}`);
  }
  console.log('═══════════════════════════════════════════════════════════════');

  // 1. Initialize frozen predictor
  console.log('\n[1/5] Initializing frozen predictor...');
  const predictor = new FrozenPredictor(modelVersion);
  await predictor.init();

  // 2. Generate date range
  const dates = generateDateRange(dateStart, dateEnd);
  console.log(`\n[2/5] Processing ${dates.length} dates...`);

  // 3. Loop through dates, fetch games, predict, collect rows
  const allRows = [];
  let totalGames = 0;
  let skippedDates = 0;

  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];
    const pct = ((i + 1) / dates.length * 100).toFixed(0);
    process.stdout.write(`  [${pct}%] ${dateStr}... `);

    try {
      // Fetch games and results from ESPN
      const games = await fetchGamesForDate(dateStr);
      
      if (games.length === 0) {
        console.log('no games');
        skippedDates++;
        continue;
      }

      // Filter to completed games only
      const completedGames = games.filter(g => g.completed);
      if (completedGames.length === 0) {
        console.log(`${games.length} games (none completed)`);
        skippedDates++;
        continue;
      }

      // Fetch closing lines (best-effort)
      const closingLines = await fetchClosingLines(dateStr);

      // Run predictions through frozen model
      const predictions = await predictor.predictGames(completedGames);

      // Merge closing lines into predictions
      for (const pred of predictions) {
        const lineKey = `${pred.away}_${pred.home}`;
        const lines = closingLines[lineKey] || {};
        pred.closing_spread = lines.closingSpread ?? null;
        pred.closing_total = lines.closingTotal ?? null;
      }

      allRows.push(...predictions);
      totalGames += completedGames.length;
      
      const validPreds = predictions.filter(p => p.pred_margin != null).length;
      console.log(`${completedGames.length} games, ${validPreds} predictions`);

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }

    // Rate limiting (ESPN is generous but be polite)
    if (i < dates.length - 1) await delay(500);
  }

  console.log(`\n  Total: ${totalGames} games across ${dates.length - skippedDates} active dates`);

  if (allRows.length === 0) {
    console.error('\n❌ No prediction rows generated. Check date range and ESPN availability.');
    process.exit(1);
  }

  // 4. Compute metrics
  console.log('\n[3/5] Computing metrics...');
  const { pre: preRows, post: postRows } = splitByDeadline(allRows, deadline);
  
  console.log(`  PRE deadline:  ${preRows.length} games (< ${deadline})`);
  console.log(`  POST deadline: ${postRows.length} games (>= ${deadline})`);

  const preMetrics = computeMetrics(preRows, mode);
  const postMetrics = computeMetrics(postRows, mode);
  const allMetrics = computeMetrics(allRows, mode);

  // 5. Write outputs
  console.log('\n[4/5] Writing outputs...');
  const outDir = path.dirname(resolvedOut);
  fs.mkdirSync(outDir, { recursive: true });

  // CSV
  writeCSV(allRows, resolvedOut);

  // Summary JSON
  const commitHash = getCommitHash();
  const summary = {
    meta: {
      model_version: modelVersion,
      date_start: dateStart,
      date_end: dateEnd,
      deadline,
      mode,
      freeze_level: predictor.freezeLevel,
      commit_hash: commitHash,
      timestamp: new Date().toISOString(),
      total_games: totalGames,
      total_predictions: allRows.filter(r => r.pred_margin != null).length,
    },
    pre: preMetrics,
    post: postMetrics,
    all: allMetrics,
  };

  const summaryPath = resolvedOut.replace(/\.csv$/, '_summary.json');
  writeSummaryJSON(summary, summaryPath);

  // Markdown report
  const reportPath = resolvedOut.replace(/\.csv$/, '_report.md');
  writeMarkdownReport(summary, reportPath);

  // Run metadata
  const metadataPath = path.join(outDir, 'run_metadata.json');
  writeRunMetadata({
    repo_commit_hash: commitHash,
    model_version: modelVersion,
    date_range: { start: dateStart, end: dateEnd },
    deadline,
    freeze_level: predictor.freezeLevel,
    timestamp: new Date().toISOString(),
    output_files: [resolvedOut, summaryPath, reportPath],
  }, metadataPath);

  // 6. Print summary
  console.log('\n[5/5] Results Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                     PRE          POST         DELTA');
  console.log('─────────────────────────────────────────────────────────────');
  
  const printRow = (label, key, dec = 3) => {
    const preV = preMetrics[key];
    const postV = postMetrics[key];
    const preStr = preV != null ? preV.toFixed(dec).padStart(10) : '       —  ';
    const postStr = postV != null ? postV.toFixed(dec).padStart(10) : '       —  ';
    let deltaStr = '       —  ';
    if (preV != null && postV != null) {
      const d = postV - preV;
      deltaStr = `${d >= 0 ? '+' : ''}${d.toFixed(dec)}`.padStart(10);
    }
    console.log(`  ${label.padEnd(18)} ${preStr}   ${postStr}   ${deltaStr}`);
  };

  printRow('Games', 'n_completed', 0);
  printRow('MAE (margin)', 'mae');
  printRow('RMSE (margin)', 'rmse');
  printRow('Correct Side %', 'correct_side_pct');
  if (mode === 'prob' || mode === 'both') {
    printRow('Brier Score', 'brier', 4);
    printRow('Log Loss', 'log_loss', 4);
  }
  if (preMetrics.total_mae != null || postMetrics.total_mae != null) {
    printRow('Total MAE', 'total_mae');
    printRow('Total RMSE', 'total_rmse');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n✅ Shadow evaluation complete. Outputs in: ${outDir}/`);

  // ═════════════════════════════════════════════════════════════════════════
  // PART 2: RETRAIN WINDOW COMPARISON (optional)
  // ═════════════════════════════════════════════════════════════════════════

  let retrainResult = null;

  if (retrainWindows && retrainWindows.length > 0) {
    console.log('\n');

    retrainResult = await runRetrainComparison({
      windowWeeks: retrainWindows,
      holdoutStart: deadline,
      holdoutDays,
      frozenSpreadModel: predictor.spreadModel,
      frozenTotalModel: predictor.totalModel,
      fetchTeamStatsFn: predictor.fetchTeamStatsBound(),
      rciModule: predictor.rciModule,
      lambda: 0.01,
    });

    // Write retrain comparison outputs
    const retrainJsonPath = resolvedOut.replace(/\.csv$/, '_retrain.json');
    const retrainClean = JSON.parse(JSON.stringify(retrainResult, (key, val) => {
      // Strip full model objects from JSON (too large)
      if (key === 'candidateSpreadModel' || key === 'candidateTotalModel') return undefined;
      return val;
    }));
    fs.writeFileSync(retrainJsonPath, JSON.stringify(retrainClean, null, 2));
    console.log(`\n[Report] Retrain comparison JSON: ${retrainJsonPath}`);

    // Write retrain markdown report
    const retrainMdPath = resolvedOut.replace(/\.csv$/, '_retrain_report.md');
    writeRetrainMarkdown(retrainResult, { baseline: summary, modelVersion, commitHash }, retrainMdPath);
    console.log(`[Report] Retrain comparison report: ${retrainMdPath}`);

    // ── Print retrain comparison table ────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  📊 Retrain Comparison (Holdout Period)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Window    Train Games  Spread MAE   ΔMAE     Correct Side');
    console.log('  ────────  ───────────  ──────────   ──────   ────────────');

    const blMAE = retrainResult.baseline?.spread?.mae;
    const blCS = retrainResult.baseline?.spread?.correctSidePct;
    console.log(`  baseline  —            ${blMAE != null ? blMAE.toFixed(3).padStart(10) : '       — '}   —        ${blCS != null ? (blCS * 100).toFixed(1).padStart(5) + '%' : '    — '}`);

    for (const c of retrainResult.candidates) {
      if (c.error) {
        console.log(`  ${String(c.windowWeeks).padEnd(4)}wk    ${String(c.trainGames).padStart(4)}         ❌ ${c.error}`);
        continue;
      }
      const cMAE = c.spread?.mae;
      const cCS = c.spread?.correctSidePct;
      const delta = cMAE != null && blMAE != null ? cMAE - blMAE : null;
      const deltaStr = delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`.padStart(7) : '     — ';
      console.log(`  ${String(c.windowWeeks).padEnd(4)}wk    ${String(c.trainGames).padStart(4)}         ${cMAE != null ? cMAE.toFixed(3).padStart(10) : '       — '}   ${deltaStr}   ${cCS != null ? (cCS * 100).toFixed(1).padStart(5) + '%' : '    — '}`);
    }

    console.log('═══════════════════════════════════════════════════════════════');

    // ── Print conclusion ─────────────────────────────────────────────────
    const rec = retrainResult.recommendation;
    const emoji = rec.verdict === 'YES' ? '✅' : rec.verdict === 'NO' ? '🛑' : '🟡';
    console.log(`\n  ${emoji} Retraining recommended now: ${rec.verdict}`);
    console.log(`     ${rec.reason}`);
    if (rec.bestWindow) {
      console.log(`     Best window: ${rec.bestWindow} weeks`);
    }
    console.log('═══════════════════════════════════════════════════════════════');
  }
}

/**
 * Write retrain comparison Markdown report.
 */
function writeRetrainMarkdown(retrain, meta, outPath) {
  const lines = [
    '# 🔄 NBA Retrain Comparison Report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Model Version:** ${meta.modelVersion}`,
    `**Commit:** ${meta.commitHash || 'unknown'}`,
    '',
    '---',
    '',
    '## Holdout Period',
    '',
    `- **Start:** ${retrain.holdout.start}`,
    `- **End:** ${retrain.holdout.end}`,
    `- **Days:** ${retrain.holdout.days}`,
    `- **Games:** ${retrain.holdout.games}`,
    '',
    '## Baseline (Frozen Model)',
    '',
    `- Spread MAE: ${retrain.baseline.spread.mae?.toFixed(3) ?? '—'}`,
    `- Spread RMSE: ${retrain.baseline.spread.rmse?.toFixed(3) ?? '—'}`,
    `- Mean Error (bias): ${retrain.baseline.spread.meanError?.toFixed(3) ?? '—'}`,
    `- Correct Side: ${retrain.baseline.spread.correctSidePct != null ? (retrain.baseline.spread.correctSidePct * 100).toFixed(1) + '%' : '—'}`,
    `- Total MAE: ${retrain.baseline.total.mae?.toFixed(3) ?? '—'}`,
    '',
    '## Candidate Windows',
    '',
    '| Window | Train Games | Spread MAE | ΔMAE | Correct Side | ΔCS | Total MAE | ΔTotal |',
    '|--------|-------------|-----------|------|-------------|-----|-----------|--------|',
  ];

  const blMAE = retrain.baseline.spread.mae;
  const blCS = retrain.baseline.spread.correctSidePct;
  const blTMAE = retrain.baseline.total.mae;

  for (const c of retrain.candidates) {
    if (c.error) {
      lines.push(`| ${c.windowWeeks}wk | ${c.trainGames} | ❌ | — | — | — | — | — |`);
      continue;
    }

    const cMAE = c.spread?.mae;
    const cCS = c.spread?.correctSidePct;
    const cTMAE = c.total?.mae;

    const dMAE = cMAE != null && blMAE != null ? cMAE - blMAE : null;
    const dCS = cCS != null && blCS != null ? cCS - blCS : null;
    const dTMAE = cTMAE != null && blTMAE != null ? cTMAE - blTMAE : null;

    const fmtDelta = (d, dec = 3) => d != null ? `${d >= 0 ? '+' : ''}${d.toFixed(dec)}` : '—';

    lines.push(`| ${c.windowWeeks}wk | ${c.trainGames} | ${cMAE?.toFixed(3) ?? '—'} | ${fmtDelta(dMAE)} | ${cCS != null ? (cCS * 100).toFixed(1) + '%' : '—'} | ${fmtDelta(dCS != null ? dCS * 100 : null, 1)}% | ${cTMAE?.toFixed(3) ?? '—'} | ${fmtDelta(dTMAE)} |`);
  }

  // Recommendation
  const rec = retrain.recommendation;
  const emoji = rec.verdict === 'YES' ? '✅' : rec.verdict === 'NO' ? '🛑' : '🟡';

  lines.push(
    '',
    '## Recommendation',
    '',
    `### ${emoji} Retraining recommended now: **${rec.verdict}**`,
    '',
    rec.reason,
    '',
  );

  if (rec.details) {
    lines.push(
      '### Best Candidate Details',
      '',
      `- Window: ${rec.details.window} weeks`,
      `- Candidate MAE: ${rec.details.candidateMAE?.toFixed(3)}`,
      `- Baseline MAE: ${rec.details.baselineMAE?.toFixed(3)}`,
      `- MAE Improvement: ${rec.details.maeImprove?.toFixed(3)}`,
      `- Correct Side Improvement: ${rec.details.csImprove != null ? (rec.details.csImprove * 100).toFixed(1) + '%' : '—'}`,
      '',
    );
  }

  // Caveats
  lines.push(
    '---',
    '',
    '## ⚠️ Caveats',
    '',
    '- **Feature leakage**: Rolling stats are fetched as CURRENT snapshots, not as-of-date. Comparison tests weight sensitivity only.',
    '- **Ridge OLS vs Elastic Net**: Candidates use ridge OLS (λ=0.01). Production uses sklearn elastic_net. Results are directional, not exact.',
    '- **Sample size**: Small holdout windows may yield noisy results.',
    '- **No RCI retrain**: RCI adjustments are NOT retrained — only spread/total weights change.',
    '',
    '---',
    `*Report generated by shadow_eval retrain engine — does NOT affect live predictions.*`,
  );

  fs.writeFileSync(outPath, lines.join('\n') + '\n');
}

main().catch(err => {
  console.error('❌ Shadow eval failed:', err);
  process.exit(1);
});