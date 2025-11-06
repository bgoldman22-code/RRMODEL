import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../util/logger.mjs';

/**
 * Render CLI table with starters and bench
 */
export function renderCLI(data) {
  const { league, team, starters, bench, flexOptions, swaps, scoringRules, week, explain } = data;
  
  console.log('\n' + chalk.bold.cyan('═'.repeat(80)));
  console.log(chalk.bold.cyan(`🏈 ${league.name} - Week ${week}`));
  console.log(chalk.bold.cyan(`   Team: ${team.name}`));
  console.log(chalk.bold.cyan('═'.repeat(80)) + '\n');
  
  // Starters table
  console.log(chalk.bold.white('STARTERS') + '\n');
  
  const startersTable = new Table({
    head: [
      chalk.white('Rank'),
      chalk.white('Player'),
      chalk.white('Pos'),
      chalk.white('Slot'),
      chalk.white('Opp'),
      chalk.white('EFP'),
      chalk.white('Score'),
      chalk.white('Tier'),
      ...(explain === 'all' ? [chalk.white('Reasons')] : [])
    ],
    colWidths: explain === 'all' 
      ? [6, 22, 6, 8, 8, 8, 8, 6, 40]
      : [6, 22, 6, 8, 8, 8, 8, 6],
    style: { head: [], border: [] }
  });
  
  starters.forEach((player, i) => {
    const tierColor = getTierColor(player.tier);
    const row = [
      chalk.gray(i + 1),
      player.full_name,
      player.positions[0],
      player.slot,
      player.context?.opponent || '-',
      player.efp.toFixed(1),
      player.score.toFixed(1),
      tierColor(player.tier)
    ];
    
    if (explain === 'all') {
      row.push(chalk.gray(player.reasons?.slice(0, 2).join(' | ') || '-'));
    }
    
    startersTable.push(row);
  });
  
  console.log(startersTable.toString() + '\n');
  
  // Flex options (if any high-scoring bench players)
  if (flexOptions && flexOptions.length > 0) {
    console.log(chalk.bold.yellow('💡 FLEX OPTIONS (Top Bench Players)') + '\n');
    
    const flexTable = new Table({
      head: [
        chalk.white('Player'),
        chalk.white('Pos'),
        chalk.white('Opp'),
        chalk.white('EFP'),
        chalk.white('Score'),
        chalk.white('Tier')
      ],
      colWidths: [22, 6, 8, 8, 8, 6],
      style: { head: [], border: [] }
    });
    
    flexOptions.slice(0, 5).forEach(player => {
      const tierColor = getTierColor(player.tier);
      flexTable.push([
        player.full_name,
        player.positions[0],
        player.context?.opponent || '-',
        player.efp.toFixed(1),
        player.score.toFixed(1),
        tierColor(player.tier)
      ]);
    });
    
    console.log(flexTable.toString() + '\n');
  }
  
  // Swaps (if any suggested)
  if (swaps && swaps.length > 0) {
    console.log(chalk.bold.yellow('🔄 SUGGESTED SWAPS') + '\n');
    swaps.forEach(swap => {
      console.log(
        chalk.yellow('  •') + 
        ` Bench ${chalk.green(swap.in)} for ${chalk.red(swap.out)} ` +
        chalk.gray(`(+${swap.scoreDiff} pts)`)
      );
    });
    console.log();
  }
  
  // Bench summary
  console.log(chalk.bold.gray('BENCH') + chalk.gray(` (${bench.length} players)`));
  
  if (explain === 'all') {
    const benchTable = new Table({
      head: [
        chalk.gray('Player'),
        chalk.gray('Pos'),
        chalk.gray('EFP'),
        chalk.gray('Tier'),
        chalk.gray('Reasons')
      ],
      colWidths: [22, 6, 8, 6, 40],
      style: { head: [], border: [] }
    });
    
    bench.forEach(player => {
      const tierColor = getTierColor(player.tier);
      benchTable.push([
        chalk.gray(player.full_name),
        chalk.gray(player.positions[0]),
        chalk.gray(player.efp.toFixed(1)),
        tierColor(player.tier),
        chalk.gray(player.reasons?.slice(0, 2).join(' | ') || '-')
      ]);
    });
    
    console.log(benchTable.toString() + '\n');
  } else {
    // Compact bench list
    const benchNames = bench.slice(0, 8).map(p => {
      const tierColor = getTierColor(p.tier);
      return `${p.full_name} (${tierColor(p.tier)})`;
    });
    
    if (bench.length > 8) {
      benchNames.push(chalk.gray(`... +${bench.length - 8} more`));
    }
    
    console.log(chalk.gray('  ' + benchNames.join(', ')) + '\n');
  }
  
  // Legend
  console.log(chalk.bold.white('TIER LEGEND'));
  console.log('  ' + chalk.green('S') + ' = Elite (z ≥ 1.2)');
  console.log('  ' + chalk.cyan('A') + ' = Strong (z ≥ 0.6)');
  console.log('  ' + chalk.white('B') + ' = Average (z ≥ -0.2)');
  console.log('  ' + chalk.yellow('C') + ' = Below Avg (z ≥ -0.8)');
  console.log('  ' + chalk.red('D') + ' = Weak (z < -0.8)');
  console.log('  ' + chalk.gray('BYE/OUT') + ' = Not playing\n');
  
  console.log(chalk.gray('─'.repeat(80)) + '\n');
}

/**
 * Get color function for tier
 */
function getTierColor(tier) {
  switch (tier) {
    case 'S': return chalk.bold.green;
    case 'A': return chalk.cyan;
    case 'B': return chalk.white;
    case 'C': return chalk.yellow;
    case 'D': return chalk.red;
    case 'BYE': return chalk.gray;
    case 'OUT': return chalk.gray;
    default: return chalk.white;
  }
}
