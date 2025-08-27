// netlify/functions/mlb-metrics.js
// Enrich model rows with BvP + bullpen shares safely.
// Keeps a no-op fallback so function never crashes if enrichment fails.

import { fetchBvP } from "./lib/bvp.mjs";
import { estimateShares, bullpenHrFit } from "./lib/bullpen.mjs";

// No-op enrichment fallback
async function enrichRowNoop(row){ return row; }

export const handler = async (event) => {
  try {
    // Your existing metrics logic should build something like:
    // { ok:true, date, items:[{ ...row }] }
    // We require your original code above *this* comment to exist.
    // If this file fully replaces your previous one, adapt 'buildBaseRows()' accordingly.

    // --- BEGIN: placeholder base (if upstream logic already populates rows, replace this) ---
    // If upstream handler logic already exists in your repo, remove this placeholder
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const date = qs.get('date') || new Date().toISOString().slice(0,10);
    let base = globalThis.__RR_BASE__;
    if (!base) base = { ok:true, date, items: [] };
    // --- END placeholder ---

    // If your pipeline already created rows, use them:
    let rows = Array.isArray(base.items) ? base.items : [];

    // Choose enrichment function. If upstream provided `enrichRow`, prefer it.
    let enrichFn = (typeof globalThis.enrichRow === 'function') ? globalThis.enrichRow : null;

    if (!enrichFn) {
      // Build a safe enrich function here.
      enrichFn = async (row) => {
        try {
          if (!row || typeof row !== 'object') return row;

          // --- Discover ids from varying field names ---
          const batterId = row.batterId || row.batter_id || row.batter || row.playerId || row.player_id || null;
          const pitcherId = row.pitcherId || row.pitcher_id || row.spId || row.sp_id || null;
          const pitcherHand = row.pitcherHand || row.spHand || row.hand || null;
          const lineupSlot = row.lineupSlot || row.battingOrder || row.order || null;

          // --- BvP ---
          let bvp = null;
          try {
            bvp = await fetchBvP(batterId, pitcherId);
          } catch {}
          if (bvp && (bvp.ab ?? 0) > 0) {
            row.bvp = bvp; // {ab,h,hr}
          }

          // --- Starter/Bullpen shares ---
          const spIpProj = Number(row.spIpProj ?? row.sp_ip_proj ?? row.spIP ?? 5.5);
          const shares = estimateShares({ spIpProj, lineupSlot });
          row.__spShare = shares.spShare;

          // --- Bullpen HR fit ---
          const bpHr9 = row.bpHr9 || row.teamBpHr9 || null;
          const lgHr9 = row.lgHr9 || 1.15;
          const batterPenFit = row.batterPenFit || 1.0;
          const bpFit = bullpenHrFit({ bpHr9, lgHr9, batterPenFit });
          row.bp_hr_fit = bpFit;

          return row;
        } catch {
          return row; // safety
        }
      };
    }

    // Enrich all rows; never crash
    try {
      rows = await Promise.all(rows.map(enrichFn));
    } catch {
      // if enrichment fails at the loop level, do a safe pass-through
      rows = await Promise.all(rows.map(enrichRowNoop));
    }

    return {
      ok: true,
      date: base.date,
      items: rows
    };
  } catch (e) {
    // Never 500 — return a JSON error payload
    return {
      ok: false,
      error: String(e && e.message || e)
    };
  }
};
