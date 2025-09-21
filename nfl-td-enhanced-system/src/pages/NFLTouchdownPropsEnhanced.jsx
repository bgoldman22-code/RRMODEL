// src/pages/NFLTouchdownPropsEnhanced.jsx
import React from 'react';
import { useNFLTDPredictionsEnhanced } from '../hooks/useNFLTDPredictionsEnhanced';

export default function NFLTouchdownPropsEnhanced() {
  const { data, loading, error } = useNFLTDPredictionsEnhanced('enhanced');

  return (
    <div style={{ padding: 16 }}>
      <h1>Anytime TD — Enhanced</h1>
      {loading && <p>Loading…</p>}
      {error && <pre style={{ color: 'crimson' }}>{String(error)}</pre>}
      {data && (
        <div>
          <p><strong>Source:</strong> {data.source}</p>
          <p><strong>Updated:</strong> {data.updated_at || 'n/a'}</p>
          <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Pos</th>
                <th>TD Prob</th>
                <th>RZ Share</th>
                <th>Recent Form</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(data.payload.players || []).slice(0, 100).map((p, i) => (
                <tr key={i}>
                  <td>{p.player}</td>
                  <td>{p.team}</td>
                  <td>{p.pos}</td>
                  <td>{(p.td_prob * 100).toFixed(1)}%</td>
                  <td>{(p.red_zone_share * 100).toFixed(1)}%</td>
                  <td>{p.recent_form}</td>
                  <td>{p.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
