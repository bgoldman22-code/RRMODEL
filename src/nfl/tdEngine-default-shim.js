// src/nfl/tdEngine-default-shim.js
function pickEngine(mod) {
  return (
    mod?.default ||
    mod?.tdEngine ||
    mod?.engine ||
    mod?.run ||
    null
  );
}

function normalizeName(name) {
  if (!name) return "";
  return String(name)
    .replace(/\./g, "")
    .replace(/\s+(Jr\.?|Sr\.?|III|II|IV)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function attachOffersByName(cands, offers) {
  if (!Array.isArray(cands) || !Array.isArray(offers)) return cands || [];
  const byNorm = new Map();
  for (const off of offers) {
    const raw = off.player || off.name || off.selection || off.outcome || off.label;
    const n = normalizeName(raw);
    if (!n) continue;
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(off);
  }
  return cands.map(c => {
    const n = normalizeName(c.player || c.name);
    const list = byNorm.get(n) || [];
    let chosen = null;
    for (const o of list) {
      const bk = (o.book || o.bookmaker || "").toLowerCase();
      if (bk.includes("draftkings")) { chosen = o; break; }
    }
    if (!chosen) chosen = list[0] || null;
    if (!chosen) return { ...c, oddsAmerican: c.oddsAmerican ?? "-", ev1u: c.ev1u ?? null };
    const p = (c.modelTd || c.modelProb || c.modelTdPct) ?? c.p;
    let dec = chosen.decimal;
    if (!dec && chosen.american) {
      const a = Number(String(chosen.american).replace(/[^\-0-9]/g, ""));
      if (!Number.isNaN(a)) dec = a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
    }
    let ev = null;
    if (typeof p === "number" && p > 0 && p < 1 && typeof dec === "number") {
      ev = p * (dec - 1) - (1 - p);
    }
    return {
      ...c,
      oddsAmerican: chosen.american ?? chosen.oddsAmerican ?? c.oddsAmerican ?? "-",
      ev1u: ev ?? c.ev1u ?? null,
    };
  });
}

export default function tdEngineShim(games, opts = {}) {
  const modP = import("./tdEngine.js");
  return modP.then(mod => {
    const fn = pickEngine(mod);
    const offers = Array.isArray(opts?.offers) ? opts.offers : [];
    const week = opts?.week ?? 1;
    const tryCalls = [
      () => fn && fn(games, { week, offers, requireOdds: false }),
      () => fn && fn({ games, week, offers, requireOdds: false }),
      () => fn && fn({ week, offers, requireOdds: false }),
    ];
    let out = null;
    for (const call of tryCalls) {
      try {
        const r = call();
        if (r && typeof r.then === "function") { out = r; break; }
        if (r) { out = r; break; }
      } catch (_) {}
    }
    if (!out) {
      return { candidates: [], diagnostics: { reason: "no-engine-or-bad-signature" } };
    }
    const toRows = (res) => {
      const rows = Array.isArray(res) ? res
        : Array.isArray(res?.candidates) ? res.candidates
        : Array.isArray(res?.rows) ? res.rows
        : [];
      if (!rows.length && typeof fn === "function") {
        try {
          const relaxed = fn(games, {
            week,
            offers,
            requireOdds: false,
            minProb: 0.02,
            topK: 50,
            minZ: -5
          });
          const relaxedRows = Array.isArray(relaxed) ? relaxed : (relaxed?.candidates || []);
          return attachOffersByName(relaxedRows, offers);
        } catch {
          return [];
        }
      }
      return attachOffersByName(rows, offers);
    };
    if (out && typeof out.then === "function") {
      return out.then(res => ({ candidates: toRows(res), diagnostics: res?.diagnostics || {} }))
               .catch(() => ({ candidates: [], diagnostics: { reason: "engine-threw-async" } }));
    } else {
      return { candidates: toRows(out), diagnostics: out?.diagnostics || {} };
    }
  }).catch(() => ({ candidates: [], diagnostics: { reason: "import-failed" } }));
}
