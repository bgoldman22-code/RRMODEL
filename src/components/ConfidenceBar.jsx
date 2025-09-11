// src/components/ConfidenceBar.jsx (already present in your repo; included for completeness)
import React from 'react';

export default function ConfidenceBar({ value = 0.5, label }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 h-2 bg-gray-200 rounded">
        <div className="h-2 bg-green-500 rounded" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-700">{label ?? `${pct.toFixed(1)}%`}</span>
    </div>
  );
}
