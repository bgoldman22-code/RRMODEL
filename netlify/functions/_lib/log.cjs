// netlify/functions/_lib/log.cjs
function log(...args) {
  console.log("[nfl-train]", ...args);
}
function warn(...args) {
  console.warn("[nfl-train]", ...args);
}
function error(...args) {
  console.error("[nfl-train]", ...args);
}
module.exports = { log, warn, error };