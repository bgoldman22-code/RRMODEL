// Tiny structured logger (CommonJS)
const MAX_PREVIEW = 1200;

function preview(obj) {
  try {
    const s = JSON.stringify(obj);
    if (!s) return s;
    return s.length > MAX_PREVIEW ? s.slice(0, MAX_PREVIEW) + '…' : s;
  } catch {
    return String(obj).slice(0, MAX_PREVIEW);
  }
}

function log(level, msg, meta) {
  const entry = { level, msg, ts: new Date().toISOString(), ...(meta || {}) };
  // Netlify captures console logs
  console.log(JSON.stringify(entry));
}

function info(msg, meta) { log('info', msg, meta); }
function warn(msg, meta) { log('warn', msg, meta); }
function error(msg, meta) { log('error', msg, meta); }
function debug(msg, meta) {
  if ((process.env.LOG_LEVEL || '').toLowerCase() === 'debug') {
    log('debug', msg, meta);
  }
}

module.exports = { info, warn, error, debug, preview };
