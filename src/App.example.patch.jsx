/**
 * PATCHED App.jsx
 * - Replaces "NFL NeggCorr" nav item/route with "NFL Predictions"
 * - Adds route: /nfl/predictions -> NFLPredictions page
 * - Leaves other routes/components untouched
 *
 * If your repo organizes routes differently, adjust imports/paths accordingly.
 */
import React from "react";
import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";
// ⬇️ keep your existing imports:
/* import MLBHR from "./pages/MLBHR";
import NBANeggCorr from "./pages/NBANeggCorr";
...etc */
import NFLPredictions from "./pages/NFLPredictions";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen">
        <nav className="border-b">
          <div className="max-w-7xl mx-auto px-4 py-3 flex gap-4 text-sm">
            {/* KEEP existing links … */}
            {/* Replace the old NegCorr item with Predictions */}
            <NavLink
              to="/nfl/predictions"
              className={({ isActive }) =>
                `px-2 py-1 rounded ${isActive ? "bg-black text-white" : "hover:bg-gray-100"}`
              }
            >
              NFL Predictions
            </NavLink>
          </div>
        </nav>

        <main>
          <Routes>
            {/* KEEP existing routes … */}
            <Route path="/nfl/predictions" element={<NFLPredictions />} />
            {/* KEEP your default route(s) unchanged */}
          </Routes>
        </main>
      </div>
    </Router>
  );
}
