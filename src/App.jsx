import React from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";

// Existing pages
import MLBHR from "./pages/MLBHR";
import MLBHRR from "./pages/MLBHRR";
import MLBTwoHits from "./pages/MLBTwoHits";
import NFLTD from "./pages/NFLTD";

// New page
import Predictions from "./pages/Predictions";

function Nav() {
  const link = "px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100";
  return (
    <nav className="border-b">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-2">
          <Link to="/" className={link}>Home</Link>
          <Link to="/mlb-hr" className={link}>MLB HR</Link>
          <Link to="/mlb-2hits" className={link}>MLB 2+ Hits</Link>
          <Link to="/hrr" className={link}>HRR</Link>
          <Link to="/nfl-td" className={link}>NFL TD</Link>
          <Link to="/predictions" className={link}>Predictions</Link>
        </div>
      </div>
    </nav>
  );
}

function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Home</h1>
      <p className="text-gray-600">Choose a model from the navigation bar.</p>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/mlb-hr" element={<MLBHR />} />
        <Route path="/mlb-2hits" element={<MLBTwoHits />} />
        <Route path="/hrr" element={<MLBHRR />} />
        <Route path="/nfl-td" element={<NFLTD />} />
        <Route path="/predictions" element={<Predictions />} />
        {/* Back-compat redirects */}
        <Route path="/NFL_NegCorr" element={<Navigate to="/predictions" replace />} />
      </Routes>
    </Router>
  );
}
