import chalk from 'chalk';

export const logger = {
  info: (...args) => console.log(chalk.blue('ℹ'), ...args),
  success: (...args) => console.log(chalk.green('✓'), ...args),
  error: (...args) => console.error(chalk.red('✗'), ...args),
  warn: (...args) => console.warn(chalk.yellow('⚠'), ...args),
  debug: (...args) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray('→'), ...args);
    }
  }
};
