import React, { useState } from "react";
import { probToAmerican } from "./utils/odds";
import { formatWhy } from "./utils/why";

export default function MLB({ data }) {
  const [rows, setRows] = useState(data || []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">MLB Home Run Round Robin</h2>
      <table className="min-w-full text-sm mt-4">
        <thead>
          <tr>
            <th className="px-2 py-1">Player</th>
            <th className="px-2 py-1">Game</th>
            <th className="px-2 py-1">Model HR%</th>
            <th className="px-2 py-1">Model Odds</th>
            <th className="px-2 py-1">Actual Odds</th>
            <th className="px-2 py-1">EV (1u)</th>
            <th className="px-2 py-1">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-2 py-1">{r.player}</td>
              <td className="px-2 py-1">{r.game}</td>
              <td className="px-2 py-1">{(r.p_model * 100).toFixed(1)}%</td>
              <td className="px-2 py-1">{probToAmerican(r.p_model)}</td>
              <td className="px-2 py-1">{r.odds}</td>
              <td className="px-2 py-1">{r.ev?.toFixed(3)}</td>
              <td className="px-2 py-1">{formatWhy(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-lg font-semibold mt-6">Pure EV (Model p ≥ 19%)</h3>
      <table className="min-w-full text-sm mt-2">
        <thead>
          <tr>
            <th className="px-2 py-1">Player</th>
            <th className="px-2 py-1">Game</th>
            <th className="px-2 py-1">Model HR%</th>
            <th className="px-2 py-1">Actual Odds</th>
            <th className="px-2 py-1">EV (1u)</th>
            <th className="px-2 py-1">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((r) => r.p_model >= 0.19)
            .sort((a, b) => b.ev - a.ev)
            .map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1">{r.player}</td>
                <td className="px-2 py-1">{r.game}</td>
                <td className="px-2 py-1">{(r.p_model * 100).toFixed(1)}%</td>
                <td className="px-2 py-1">{r.odds}</td>
                <td className="px-2 py-1">{r.ev?.toFixed(3)}</td>
                <td className="px-2 py-1">{formatWhy(r)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
