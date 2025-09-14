// PATCH: Display picks + confidences for ML / Spread / Total with graceful fallbacks.
import React from "react";

const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "-";
  }
};

const Conf = ({ v }) => v == null ? <span>–</span> : <span>{typeof v === "string" ? v : `${v}%`}</span>;
const Cell = ({ children }) => <td className="px-3 py-2 align-top">{children ?? "–"}</td>;

export default function NFLPredictions() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const resp = await fetch("/.netlify/functions/nfl-predictions-generate");
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || "Failed");
      setRows(data.rows || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const renderMoneyline = (r) => {
    // Support both new (moneylineText) and legacy fields
    return r.moneylineText || r.moneyline || r.moneylinePick || "–";
  };
  const renderSpread = (r) => r.spreadText || r.spread || r.spreadPick || "–";
  const renderTotal = (r) => r.totalText || r.total || r.totalPick || "–";

  const conf = (r, keyList) => {
    for (const k of keyList) {
      if (r[k] != null) return r[k];
    }
    return null;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">NFL Predictions</h1>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl px-4 py-2 border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Generate New Predictions"}
        </button>
      </div>

      {error && (
        <div className="mb-3 text-red-600 text-sm">Error: {error}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Matchup</th>
              <th className="text-left px-3 py-2">Kickoff</th>
              <th className="text-left px-3 py-2">Moneyline</th>
              <th className="text-left px-3 py-2">Conf</th>
              <th className="text-left px-3 py-2">Spread</th>
              <th className="text-left px-3 py-2">Conf</th>
              <th className="text-left px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Conf</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.id || r.matchup} className="odd:bg-white even:bg-gray-50">
                <Cell>{r.matchup}</Cell>
                <Cell>{fmtTime(r.kickoff)}</Cell>
                <Cell>{renderMoneyline(r)}</Cell>
                <Cell><Conf v={conf(r, ["moneylineConf", "moneyline_conf", "ml_confidence", "moneylineConfidence"])} /></Cell>
                <Cell>{renderSpread(r)}</Cell>
                <Cell><Conf v={conf(r, ["spreadConf", "spread_conf", "spreadConfidence"])} /></Cell>
                <Cell>{renderTotal(r)}</Cell>
                <Cell><Conf v={conf(r, ["totalConf", "total_conf", "totalConfidence"])} /></Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
