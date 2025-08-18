// src/lib/nameNormalize.js
const ALIASES = new Map([
  ['mike trout','michael trout'],
  ['ronald acuna jr','ronald acuña jr'],
]);

export function normName(s) {
  if (!s) return '';
  let n = String(s).toLowerCase();
  n = n.replace(/[.]/g, '');
  n = n.replace(/\s+jr\b/, ' jr');
  n = n.replace(/\s+iii\b/, ' iii');
  n = n.replace(/[’]/g, "'");
  n = n.trim();
  if (ALIASES.has(n)) return ALIASES.get(n);
  n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return n;
}

export function addAlias(from, to) {
  if (!from || !to) return;
  ALIASES.set(String(from).toLowerCase().trim(), String(to).toLowerCase().trim());
}
