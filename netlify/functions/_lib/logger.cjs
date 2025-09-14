'use strict';
/**
 * Minimal logger; avoids spewing massive objects by truncating.
 * LOG_LEVEL: error|warn|info|debug|trace (default: info)
 */
const levels = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const level = levels[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? 2;

function fmt(v) {
  try {
    if (v == null) return String(v);
    if (typeof v === 'string') return v.length > 800 ? v.slice(0,800) + '…' : v;
    return JSON.stringify(v, (_k, val) => (typeof val === 'string' && val.length > 800) ? (val.slice(0,800) + '…') : val);
  } catch {
    return '[unserializable]';
  }
}

const log = {
  error: (...args) => { if (level >= 0) console.error('[error]', ...args.map(fmt)); },
  warn:  (...args) => { if (level >= 1) console.warn('[warn ]', ...args.map(fmt)); },
  info:  (...args) => { if (level >= 2) console.log('[info ]', ...args.map(fmt)); },
  debug: (...args) => { if (level >= 3) console.log('[debug]', ...args.map(fmt)); },
  trace: (...args) => { if (level >= 4) console.log('[trace]', ...args.map(fmt)); },
};

module.exports = { log };
