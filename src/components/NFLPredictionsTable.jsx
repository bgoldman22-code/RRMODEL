import React from 'react';

/**
 * Renders a predictions table with the requested columns.
 * Expects rows with fields:
 * - matchup, kickoff (ISO)
 * - moneyline: { team, price, confidence }
 * - spread: { side, line, price, confidence }
 * - total: { side: 'over'|'under', total, price, confidence }
 * If fields are absent, it shows '-' gracefully.
 */
export default function NFLPredictionsTable({ rows = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border border-gray-200 rounded-xl overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <Th>Matchup</Th>
            <Th>Kickoff</Th>
            <Th>Moneyline</Th>
            <Th>Confidence</Th>
            <Th>Spread</Th>
            <Th>Confidence</Th>
            <Th>Total</Th>
            <Th>Confidence</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-center py-6 text-gray-500">No predictions available.</td>
            </tr>
          ) : rows.map((r, i) => <Row key={r.id || i} r={r} />)}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{children}</th>;
}

function Td({ children }) {
  return <td className="px-3 py-2 border-t border-gray-100 text-sm">{children}</td>;
}

function pc(x) {
  if (typeof x !== 'number' || !isFinite(x)) return '-';
  return Math.round(x * 100) + '%';
}

function Row({ r }) {
  const ml = r.moneyline || r.pick || r.model_moneyline || {};
  const sp = r.spread || r.model_spread || {};
  const tt = r.total || r.model_total || {};

  const mlLabel = ml.team ? `moneyline: ${ml.team}${ml.price ? ` (${ml.price})` : ''}` : (r.displayPick ? r.displayPick : '-');
  const spLabel = sp.side != null
    ? `${sp.side > 0 ? 'away' : 'home'} ${typeof sp.line === 'number' ? (sp.line > 0 ? '+' : '') + sp.line : ''}${sp.price ? ` (${sp.price})` : ''}`
    : (r.displayLine ? r.displayLine : '-');
  const ttLabel = tt.side ? `${tt.side}${tt.total ? ` ${tt.total}` : ''}${tt.price ? ` (${tt.price})` : ''}` : '-';

  const kickoff = r.kickoff ? new Date(r.kickoff).toLocaleString() : (r.game_time || '-');
  const matchup = r.matchup || `${r.awayTeam || '-'} @ ${r.homeTeam || '-'}`;

  return (
    <tr className="hover:bg-gray-50">
      <Td>{matchup}</Td>
      <Td>{kickoff}</Td>
      <Td className="font-medium">{mlLabel}</Td>
      <Td>{pc(ml.confidence ?? r.confidence)}</Td>
      <Td>{spLabel}</Td>
      <Td>{pc(sp.confidence)}</Td>
      <Td>{ttLabel}</Td>
      <Td>{pc(tt.confidence)}</Td>
    </tr>
  );
}
