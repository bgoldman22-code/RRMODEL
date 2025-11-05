#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import { ensureAuth, runOAuthFlow } from './yahoo/auth.mjs';
import { runSitStart } from './logic/scoring.mjs';
import { logger } from './util/logger.mjs';

dotenv.config();

const program = new Command();

program
  .name('ff-sitstart')
  .description('Fantasy Football Sit/Start Tool via Yahoo + TheOddsAPI')
  .version('1.0.0');

program
  .command('auth')
  .description('Authenticate with Yahoo Fantasy (3-legged OAuth)')
  .action(async () => {
    try {
      await runOAuthFlow();
      logger.success('✅ Authentication successful! Tokens saved.');
    } catch (error) {
      logger.error('❌ Authentication failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('run')
  .description('Generate sit/start recommendations')
  .option('-w, --week <number>', 'NFL week number (auto-detect if omitted)')
  .option('-l, --league <name>', 'League name filter (optional)')
  .option('-t, --team <name>', 'Team name filter (optional)')
  .option('--json', 'Output JSON files')
  .option('--csv', 'Output CSV files')
  .option('--out <dir>', 'Output directory', './out')
  .action(async (options) => {
    try {
      logger.info('🏈 Starting sit/start analysis...\n');
      
      // Ensure we have valid tokens
      await ensureAuth();
      
      // Run the main analysis
      await runSitStart(options);
      
      logger.success('\n✅ Analysis complete!');
    } catch (error) {
      logger.error('❌ Error:', error.message);
      if (error.message.includes('auth') || error.message.includes('token')) {
        logger.info('💡 Try running: ff-sitstart auth');
      }
      process.exit(1);
    }
  });

program.parse();
