#!/usr/bin/env node
import { Command } from 'commander';
import { runOAuthFlow } from './yahoo/auth.mjs';
import { runSitStart } from './logic/scoring.mjs';
import { logger } from './util/logger.mjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('ff-sitstart')
  .description('Fantasy Football Sit/Start Tool (Yahoo + TheOddsAPI)')
  .version('1.0.0');

// Auth command
program
  .command('auth')
  .description('Authenticate with Yahoo Fantasy (OAuth 2.0)')
  .action(async () => {
    try {
      logger.info('Starting Yahoo OAuth flow...\n');
      await runOAuthFlow();
      logger.success('\n✅ Authentication successful!');
      logger.info('You can now run: npm run run\n');
    } catch (error) {
      logger.error(`Authentication failed: ${error.message}`);
      process.exit(1);
    }
  });

// Run command
program
  .command('run')
  .description('Run sit/start analysis')
  .option('-w, --week <number>', 'NFL week number (default: current week)')
  .option('-l, --league <name>', 'Filter by league name')
  .option('-t, --team <name>', 'Filter by team name')
  .option('--json', 'Export JSON output')
  .option('--csv', 'Export CSV output')
  .option('--out <path>', 'Output directory', './out')
  .option('--explain <level>', 'Explanation level (min|all)', 'min')
  .action(async (options) => {
    try {
      const week = options.week ? parseInt(options.week) : null;
      
      await runSitStart({
        week,
        league: options.league,
        team: options.team,
        json: options.json,
        csv: options.csv,
        out: options.out,
        explain: options.explain
      });
    } catch (error) {
      logger.error(`Analysis failed: ${error.message}`);
      if (error.message.includes('token') || error.message.includes('auth')) {
        logger.warn('\n💡 Tip: Run "npm run auth" first to authenticate with Yahoo');
      }
      process.exit(1);
    }
  });

program.parse();
