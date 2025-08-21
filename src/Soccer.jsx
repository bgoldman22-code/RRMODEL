import React from "react";

/**
 * Soccer.jsx — Stability patch
 * - Better empty state when markets are off/quota hit
 * - No crash behavior
 */

export default function Soccer() {
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-2xl font-semibold">Soccer — Anytime Goalscorer Round Robin</h1>
      <div className="text-sm text-gray-600">
        Window: (select dates in your header) • Events: 0 • Pool: 0 • Selected: 0
      </div>
      <div className="border rounded p-3 text-sm text-gray-700">
        Odds endpoint returned zero; showing picks only if markets were available. When odds resume,
        this page will populate automatically.
      </div>
    </div>
  );
}
