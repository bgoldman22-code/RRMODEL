// src/nfl/tdEngine-default-shim.js
// Robust wrapper: supports default or named exports; optional relaxed pass for display if empty.
function pickEngine(mod) {
  return mod?.default || mod?.tdEngine || mod?.engine || mod?.run || null;
}

export default async function tdEngineShim(games = [], opts = {}) {
  try {
    const mod = await import("./tdEngine.js");
    const fn = pickEngine(mod);
    if (typeof fn !== "function") return [];

    const tryCalls = [
      () => fn(games, opts),
      () => fn({ games, ...opts }),
      () => fn({ week: opts.week, ...opts }),
    ];

    let out = null;
    for (const call of tryCalls) {
      try {
        const r = call();
        out = (r && typeof r.then === "function") ? await r : r;
        if (out) break;
      } catch {}
    }

    const toRows = (res) => {
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.candidates)) return res.candidates;
      if (Array.isArray(res?.rows)) return res.rows;
      return [];
    };

    let rows = toRows(out);

    // optional relaxed pass for display-only if caller set relax or we got empty
    if ((opts.relax || !rows.length) && typeof fn === "function") {
      try {
        const relaxed = await fn(games, { ...opts, requireOdds: false, minProb: 0.02, topK: 50, minZ: -5 });
        const relaxedRows = toRows(relaxed);
        if (relaxedRows.length) rows = relaxedRows;
      } catch {}
    }

    return rows;
  } catch {
    return [];
  }
}
