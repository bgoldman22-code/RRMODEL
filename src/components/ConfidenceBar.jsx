import React from 'react';

export default function ConfidenceBar({ value, label, width=120 }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  const display = (pct*100).toFixed(1) + '%';
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-gray-600">{label}</span>}
      <div className="h-2 rounded bg-gray-200 overflow-hidden" style={{ width }}>
        <div className="h-2 bg-green-500" style={{ width: `${pct*100}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-700">{display}</span>
    </div>
  );
}
