import React from 'react';

function pct(x){ return (x*100).toFixed(1) + '%'; }
function fmtAmerican(a){ if (a==null) return ''; return a>0? `+${Math.round(a)}` : `${Math.round(a)}`; }

export default function NflTdTable({ title, rows, emptyText }){
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {(!rows || rows.length===0) ? <div className="text-sm text-gray-500">{emptyText||'No rows'}</div> : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border">Player</th>
              <th className="text-left p-2 border">Pos</th>
              <th className="text-left p-2 border">Team</th>
              <th className="text-right p-2 border">TD Prob</th>
              <th className="text-right p-2 border">Model Odds</th>
              <th className="text-right p-2 border">Best Book</th>
              <th className="text-right p-2 border">Edge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i)=> (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border">{r.player}</td>
                <td className="p-2 border">{r.pos}</td>
                <td className="p-2 border">{r.team}</td>
                <td className="p-2 border text-right">{pct(r.td_prob)}</td>
                <td className="p-2 border text-right">{fmtAmerican(r.model_american)}</td>
                <td className="p-2 border text-right">{r.best_american!=null? fmtAmerican(r.best_american): ''}</td>
                <td className={"p-2 border text-right " + (r.value>0 ? "text-green-700" : "text-gray-700")}>
                  {r.value!=null? (r.value*100).toFixed(1) + " pp" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
