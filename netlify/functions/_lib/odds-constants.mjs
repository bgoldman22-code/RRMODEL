// netlify/functions/_lib/odds-constants.mjs
// Centralized sportsbook allowlist and normalization
// Single source of truth for allowed books across entire system

/**
 * ALLOWED BOOKS - Only these books should appear in:
 * - Odds ingestion
 * - Edge calculations
 * - "Best:" UI labels
 * - Display prices
 */
export const ALLOWED_BOOKS = new Set([
  "FanDuel",
  "DraftKings", 
  "BetMGM",
  "ESPN Bet",
  "Fanatics",
  "Caesars",
  "ProphetX",
  "NoVig" // Synthetic no-vig line computed from allowed books
]);

/**
 * BOOK ALIASES - Normalize display names to canonical names
 * Maps variations → canonical name
 * Also explicitly lists BLOCKED books for auditing
 */
export const BOOK_ALIASES = {
  // FanDuel variations
  "FD": "FanDuel",
  "Fanduel": "FanDuel",
  
  // DraftKings variations
  "DK": "DraftKings",
  "Draft Kings": "DraftKings",
  "Draftkings": "DraftKings",
  
  // BetMGM variations
  "Bet MGM": "BetMGM",
  "MGM": "BetMGM",
  
  // ESPN Bet variations
  "ESPNBet": "ESPN Bet",
  "ESPNbet": "ESPN Bet",
  "ESPN BET": "ESPN Bet",
  "ESPNBET": "ESPN Bet",
  
  // Fanatics variations
  "Fanatics Sportsbook": "Fanatics",
  
  // Caesars variations
  "Caesars Sportsbook": "Caesars",
  "Caesar": "Caesars",
  
  // NoVig variations
  "No Vig": "NoVig",
  "LowVig.ag": "NoVig", // Treat LowVig as synthetic no-vig
  "LowVig": "NoVig",
  
  // EXPLICITLY BLOCKED BOOKS (map to themselves for auditing)
  "BetRivers": "BetRivers",
  "MyBookie.ag": "MyBookie.ag",
  "MyBookie": "MyBookie.ag",
  "Bovada": "Bovada",
  "Bookmaker": "Bookmaker",
  "BetUS": "BetUS",
  "Heritage": "Heritage",
  "Intertops": "Intertops",
  "SportsBetting.ag": "SportsBetting.ag",
  "BetOnline": "BetOnline",
  "5Dimes": "5Dimes"
};

/**
 * Normalize book name to canonical form
 * @param {string} rawName - Raw book name from odds feed
 * @returns {string} Canonical book name
 */
export function canonicalBookName(rawName) {
  if (!rawName || typeof rawName !== 'string') return rawName;
  
  // Try exact match in aliases first
  if (BOOK_ALIASES[rawName]) {
    return BOOK_ALIASES[rawName];
  }
  
  // Try case-insensitive match
  const normalized = Object.keys(BOOK_ALIASES).find(
    key => key.toLowerCase() === rawName.toLowerCase()
  );
  
  if (normalized) {
    return BOOK_ALIASES[normalized];
  }
  
  // Return as-is (will be filtered out if not in ALLOWED_BOOKS)
  return rawName;
}

/**
 * Check if a book is allowed
 * @param {string} bookName - Book name (will be normalized)
 * @returns {boolean} True if allowed
 */
export function isBookAllowed(bookName) {
  const canonical = canonicalBookName(bookName);
  return ALLOWED_BOOKS.has(canonical);
}

/**
 * Filter odds array to only allowed books
 * @param {Array} odds - Array of odds objects with { book, ... }
 * @returns {Array} Filtered and normalized odds
 */
export function filterToAllowedBooks(odds) {
  if (!Array.isArray(odds)) return [];
  
  return odds
    .map(q => ({ ...q, book: canonicalBookName(q.book || q.bookmaker) }))
    .filter(q => ALLOWED_BOOKS.has(q.book));
}

/**
 * Audit odds array for disallowed books (logging only)
 * @param {Array} odds - Array of odds objects
 * @param {string} context - Where this audit is being run
 */
export function auditBooks(odds, context = 'unknown') {
  if (!Array.isArray(odds) || odds.length === 0) return;
  
  const offenders = odds
    .map(q => canonicalBookName(q.book || q.bookmaker))
    .filter(b => !ALLOWED_BOOKS.has(b));
  
  if (offenders.length > 0) {
    const unique = [...new Set(offenders)];
    console.warn(`⚠️ [BOOK_AUDIT] Disallowed books found in ${context}:`, unique);
    return unique;
  }
  
  return [];
}

/**
 * Priority book order for display prices
 * Returns first available allowed book in priority order
 */
export const PRIORITY_BOOK_ORDER = [
  "FanDuel",
  "DraftKings",
  "BetMGM",
  "ESPN Bet",
  "Fanatics",
  "Caesars",
  "ProphetX"
];

/**
 * Get display book from odds array (first available in priority order)
 * @param {Array} odds - Array of odds objects
 * @returns {Object|null} Display book odds or null
 */
export function getDisplayBook(odds) {
  const allowed = filterToAllowedBooks(odds);
  
  for (const bookName of PRIORITY_BOOK_ORDER) {
    const match = allowed.find(q => q.book === bookName);
    if (match) return match;
  }
  
  // Fallback to first allowed book
  return allowed[0] || null;
}
