// src/nfl/tdEngine-default-shim.js
function pickEngine(mod) { return mod?.default || mod?.tdEngine || mod?.engine || mod?.run || null; }
export default async function tdEngineShim(games = [], opts = {}) {
  try {
    const mod = await import("./tdEngine.js");
    const fn = pickEngine(mod);
    if (typeof fn !== "function") return [];
    const tryCalls = [() => fn(games, opts), () => fn({ games, ...opts }), () => fn({ week: opts.week, ...opts })];
    let out = null;
    for (const call of tryCalls) {
      try { const r = call(); out = (r && typeof r.then === "function") ? await r : r; if (out) break; } catch {}
    }
    const toRows = (res) => Array.isArray(res) ? res : Array.isArray(res?.candidates) ? res.candidates : Array.isArray(res?.rows) ? res.rows : [];
    let rows = toRows(out);
    if ((opts.relax || !rows.length) && typeof fn === "function") {
      try { const relaxed = await fn(games, { ...opts, requireOdds:false, minProb:0.02, topK:50, minZ:-5 }); const rows2 = toRows(relaxed); if (rows2.length) rows = rows2; } catch {}
    }
    return rows;
  } catch { return []; }
}
