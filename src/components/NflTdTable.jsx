
import React from "react";

function formatUS(v){
  if (v == null || !Number.isFinite(v)) return "";
  const r = Math.round(v);
  return r > 0 ? `+${r}` : `${r}`;
}
function pct(x){
  if (x == null || !Number.isFinite(x)) return "";
  return (x*100).toFixed(1) + "%";
}

export default function NflTdTable({ title, rows, emptyText }){
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {(!rows || rows.length === 0) ? (
        <div className="text-sm text-gray-500">{emptyText || "No rows"}</div>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <Th>Player</Th>
              <Th>Game</Th>
              <Th>Model TD%</Th>
              <Th>Model Odds</Th>
              <Th>Actual Odds</Th>
              <Th>EV (1u)</Th>
              <Th>Why</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <Td>{r.Player}</Td>
                <Td>{r.Game}</Td>
                <Td>{pct(r.modelProb)}</Td>
                <Td>{formatUS(r.modelAmerican)}</Td>
                <Td>{formatUS(r.american)}</Td>
                <Td>{typeof r.EV === "number" ? r.EV.toFixed(3) : ""}</Td>
                <Td className="max-w-[28rem]">{r.Why}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Th({ children }){ return <th className="text-left p-2 border-r">{children}</th>; }
function Td({ children, className="" }){ return <td className={`p-2 border-r align-top ${className}`}>{children}</td>; }
