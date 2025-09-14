const levels = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const threshold = levels[envLevel] ?? 2;

function logAt(lvl, args) {
  if ((levels[lvl] ?? 2) <= threshold) {
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(`[${ts}] [${lvl.toUpperCase()}]`, ...args);
  }
}

module.exports = {
  error: (...a) => logAt('error', a),
  warn:  (...a) => logAt('warn', a),
  info:  (...a) => logAt('info', a),
  debug: (...a) => logAt('debug', a),
  trace: (...a) => logAt('trace', a),
};
