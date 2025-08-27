
// src/components/YesterdayDemo.jsx
import React, { useState } from "react";

/**
 * Lightweight demo to visualize how the new weighting would have up-ranked the right bats.
 * This is illustrative (no network). You can hide/remove from UI once satisfied.
 */
const SAMPLE = [
  // name, oldRank (lower is better), tags
  { name: "Riley Greene",    oldRank: 22, hot: true,  leakMatch:"SL", parkFit:"RF", note:"Greene vs slider leakage" },
  { name: "Giancarlo Stanton", oldRank: 18, hot: true, leakMatch:"FF/SL", parkFit:"LCF", note:"Elite barrels vs FB/SL" },
  { name: "George Springer", oldRank: 20, hot: true, leakMatch:"FF", parkFit:"LF", note:"FB-heavy pitcher punished" },
  { name: "Michael Helman",  oldRank: 35, hot: false, leakMatch:"FF", parkFit:"Pull", note:"+900 value dart" },
  { name: "Matt Wallner",    oldRank: 28, hot: true,  leakMatch:"FF", parkFit:"Pull", note:"Platoon HR stroke" },
  { name: "Colson Montgomery", oldRank: 12, hot: true, leakMatch:"FF/SL", parkFit:"RCF", note:"Loft vs FB/SL" },
];

function score(row){
  // Simple illustrative re-scoring
  let base = 100 - row.oldRank; // invert so higher is better
  let match = 0;
  if (row.leakMatch) match += 12;
  if (row.hot) match += 8;
  if (row.parkFit) match += 5;
  // Cap and return
  return Math.round(Math.min(100, base + match));
}

export default function YesterdayDemo(){
  const [rows] = useState(
    SAMPLE.map(r => ({ ...r, newScore: score(r) }))
      .sort((a,b)=> b.newScore - a.newScore)
  );
  return (
    <div className="mt-8">
      <div className="text-sm font-semibold mb-2">Yesterday re-score (demo)</div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2 text-left">Player</th>
            <th className="px-3 py-2 text-right">Old rank</th>
            <th className="px-3 py-2 text-right">New score</th>
            <th className="px-3 py-2 text-left">Why (concise)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 text-right">{r.oldRank}</td>
              <td className="px-3 py-2 text-right">{r.newScore}</td>
              <td className="px-3 py-2 text-gray-600">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-xs text-gray-500">
        This is a static demonstration of the new weighting signals (pitch-leak match, hot streak, player-park fit). The live version will use slate data and bullpen distributions.
      </div>
    </div>
  );
}
