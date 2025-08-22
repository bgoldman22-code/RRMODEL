import React, { useState, useEffect } from "react";
import { fetchJson } from "./utils/api";
import { formatAmerican } from "./utils/odds";
import { Table } from "./components/Table";

export default function MLBPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      // 🔑 Force fresh odds + lineup validation every time
      const res = await fetchJson("/.netlify/functions/mlb-hr-generate-exp2?fresh=1");
      setData(res);
    } catch (err) {
      setError(err.message || "Error generating picks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generate(); // auto-load on page mount
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">MLB Home Run Model</h1>

      <button
        onClick={generate}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        {loading ? "Generating..." : "Generate"}
      </button>

      {error && <div className="text-red-600 mt-2">{error}</div>}

      {data && (
        <div className="mt-6 space-y-8">
          {/* Straight HR Bets (Top 13 Raw Probability) */}
          <div>
            <h2 className="text-xl font-semibold mb-2">
              Straight HR Bets (Top 13 Raw Probability)
            </h2>
            <Table
              columns={[
                "Player",
                "Game",
                "Model HR%",
                "American",
                "EV (1u)",
                "Why",
              ]}
              rows={data.picks
                .sort((a, b) => b.modelProb - a.modelProb)
                .slice(0, 13)
                .map((p) => [
                  p.player,
                  p.game,
                  `${(p.modelProb * 100).toFixed(1)}%`,
                  formatAmerican(p.american),
                  p.ev.toFixed(3),
                  p.why,
                ])}
            />
          </div>

          {/* Straight EV Bets (Top 13 EV Picks, 19%+ HR floor) */}
          <div>
            <h2 className="text-xl font-semibold mb-2">
              Straight EV Bets (Top 13 EV Picks, 19%+ HR floor)
            </h2>
            <Table
              columns={[
                "Player",
                "Game",
                "Model HR%",
                "American",
                "EV (1u)",
                "Why",
              ]}
              rows={data.picks
                .filter((p) => p.modelProb >= 0.19) // 19% HR floor
                .sort((a, b) => b.ev - a.ev)
                .slice(0, 13)
                .map((p) => [
                  p.player,
                  p.game,
                  `${(p.modelProb * 100).toFixed(1)}%`,
                  formatAmerican(p.american),
                  p.ev.toFixed(3),
                  p.why,
                ])}
            />
          </div>
        </div>
      )}
    </div>
  );
}
