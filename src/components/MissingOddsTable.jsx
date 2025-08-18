import React from "react";

/**
 * MissingOddsTable
 * Renders a diagnostic table of players *missing* live odds.
 * 
 * Props:
 *  - candidates: Array of player rows from your model (full pool before slicing to Top/Bonus)
 *  - oddsMap: Map<string, {...}> or plain object keyed by normalized player name
 *  - normName: function(name) -> normalized key (use your existing normalizer)
 *  - formatAmerican: function(+num) -> "+xxx" text (optional; has fallback)
 *  - leaderboard: optional Array<string|{name:string}> of Top HR hitters (first 50 used)
 *  - maxRows: optional number; default 10
 */
export default function MissingOddsTable({
  candidates,
  oddsMap,
  normName,
  formatAmerican,
  leaderboard,
  maxRows = 10,
}) {
  try {
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) return null;

    const normalize = (s) => {
      try {
        return typeof normName === "function"
          ? normName(s)
          : String(s || "").toLowerCase().normalize("NFD")
              .replace(/\u0300-\u036f/g, "")
              .replace(/[.]/g, "")
              .replace(/[’']/g, "'")
              .trim();
      } catch {
        return String(s || "").toLowerCase().trim();
      }
    };

    const hasOdds = (playerName) => {
      const k = normalize(playerName);
      if (oddsMap instanceof Map) return oddsMap.has(k);
      if (oddsMap && typeof oddsMap === "object")
        return Object.prototype.hasOwnProperty.call(oddsMap, k);
      return false;
    };

    const showAmerican = (a) => {
      if (typeof a !== "number" || !isFinite(a)) return "";
      if (typeof formatAmerican === "function") return formatAmerican(a);
      return a > 0 ? `+${Math.round(a)}` : `${Math.round(a)}`;
    };

    const getProb = (row) => {
      const p = row?.prob ?? row?.modelProb ?? row?.ModelProb ?? row?.modelHR ?? row?.ModelHR ?? row?.model_hr;
      return typeof p === "number" ? p : null;
    };

    const getGame = (row) => row?.Game || row?.game || row?.matchup || row?.Matchup || "";

    const getName = (row) => row?.name || row?.Player || row?.player || "";

    const getModelAmerican = (row) =>
      row?.modelAmerican ?? row?.model_odds ?? row?.ModelOdds ?? row?.modelOdds ?? null;

    // Build quick lookup for candidates by normalized name
    const byName = new Map();
    for (const r of candidates) {
      const nm = getName(r);
      if (!nm) continue;
      byName.set(normalize(nm), r);
    }

    // Choose scope: Top 50 HR leaderboard (if provided) or model top-20
    let scopeRows = [];
    let tableTitle = "Missing Odds (Top 10)";
    if (Array.isArray(leaderboard) && leaderboard.length) {
      tableTitle = "Missing Odds among Top 50 HR Hitters";
      const names = leaderboard
        .slice(0, 50)
        .map((x) => (typeof x === "string" ? x : x?.name))
        .filter(Boolean);
      scopeRows = names.map((n) => {
        const key = normalize(n);
        const row = byName.get(key);
        if (row) return row;
        return { name: n, Game: "", prob: null, modelAmerican: null, __stub: true };
      });
    } else {
      scopeRows = candidates
        .slice()
        .filter((r) => getProb(r) !== null)
        .sort((a, b) => (getProb(b) || 0) - (getProb(a) || 0))
        .slice(0, 20);
    }

    const missing = [];
    for (const r of scopeRows) {
      const name = getName(r);
      if (!name) continue;
      if (!hasOdds(name)) {
        const k = normalize(name);
        let diagnosis = "No matching market found";
        const looseTarget = k.replace(/[.\u2019'’]/g, "");
        const keys = oddsMap instanceof Map ? Array.from(oddsMap.keys()) : Object.keys(oddsMap || {});
        const hasLoose = keys.some((ok) => String(ok).replace(/[.\u2019'’]/g, "") === looseTarget);
        if (hasLoose) diagnosis = "Name mismatch with odds provider";
        if (r.__stub) diagnosis = "Not in today's candidate pool";
        const game = getGame(r);
        const prob = getProb(r);
        const modelAmerican = getModelAmerican(r);
        missing.push({
          name,
          game,
          prob,
          modelAmerican,
          diagnosis: game ? `${diagnosis} (check coverage for ${game})` : diagnosis,
        });
        if (missing.length >= maxRows) break;
      }
    }

    if (!missing.length) return null;

    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-2">{tableTitle}</h3>
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-left">Game</th>
                <th className="px-3 py-2 text-right">Model HR%</th>
                <th className="px-3 py-2 text-right">Model Odds</th>
                <th className="px-3 py-2 text-left">Diagnosis</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((row, idx) => (
                <tr key={`${row.name}-${idx}`} className={idx % 2 ? "bg-white" : "bg-gray-50/40"}>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.game}</td>
                  <td className="px-3 py-2 text-right">
                    {row.prob !== null && row.prob !== undefined ? `${(row.prob * 100).toFixed(1)}%` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.modelAmerican !== null && row.modelAmerican !== undefined ? (
                      showAmerican(row.modelAmerican)
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="px-3 py-2">{row.diagnosis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
