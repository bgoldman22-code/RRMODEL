
// Simple structured logger that never throws
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CURRENT = (process.env.LOG_LEVEL || 'info').toLowerCase();
const THRESH = LEVELS[CURRENT] ?? LEVELS.info;

function stamp() {
  return new Date().toISOString();
}

function out(level, msg, meta) {
  try {
    if ((LEVELS[level] ?? 999) < THRESH) return;
    const base = { ts: stamp(), level, msg };
    const payload = meta ? { ...base, meta } : base;
    // Netlify captures stdout; keep it single-line JSON
    console.log(JSON.stringify(payload));
  } catch (_) {
    // never crash on logging
  }
}

module.exports = {
  debug: (m, meta) => out('debug', m, meta),
  info:  (m, meta) => out('info',  m, meta),
  warn:  (m, meta) => out('warn',  m, meta),
  error: (m, meta) => out('error', m, meta),
};
