
import React from 'react';

export default function NFLPredictionsTable({ rows }) {
  const fmtPct = (p) => {
    if (p == null) return '-';
    const pct = typeof p === 'number' && p <= 1 ? p * 100 : p;
    return `${Math.round(pct)}%`;
  };

  const fmt = (v) => (v == null || v === '' ? '-' : String(v));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Matchup</th>
            <th style={th}>Kickoff</th>
            <th style={th}>Moneyline</th>
            <th style={th}>Conf</th>
            <th style={th}>Spread</th>
            <th style={th}>Conf</th>
            <th style={th}>Total</th>
            <th style={th}>Conf</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.id || r.matchup}>
              <td style={td}>{r.matchup || `${r.awayTeam} @ ${r.homeTeam}`}</td>
              <td style={td}>{r.kickoff ? new Date(r.kickoff).toLocaleString() : '-'}</td>
              <td style={td}>
                {r.moneyline ? `${r.moneyline.team} (${fmt(r.moneyline.price)})` : '-'}
              </td>
              <td style={td}>{fmtPct(r.moneyline?.confidence)}</td>
              <td style={td}>
                {r.spread ? `${r.spread.side === -1 ? r.homeTeam : r.awayTeam} ${fmt(r.spread.line)} (${fmt(r.spread.price)})` : '-'}
              </td>
              <td style={td}>{fmtPct(r.spread?.confidence)}</td>
              <td style={td}>
                {r.total ? `${r.total.side?.toUpperCase()} ${fmt(r.total.total)} (${fmt(r.total.price)})` : '-'}
              </td>
              <td style={td}>{fmtPct(r.total?.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = {
  textAlign: 'left',
  padding: '10px 12px',
  fontWeight: 600,
  borderBottom: '2px solid #e5e7eb',
  whiteSpace: 'nowrap'
};

const td = {
  padding: '10px 12px',
  borderBottom: '1px solid #f0f0f0',
  verticalAlign: 'top',
  whiteSpace: 'nowrap'
};
