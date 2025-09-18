// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import MLB_HR from "./MLB_HR";
import MLB_HITS2 from "./MLB_HITS2";
// CHANGED: Use the components you actually have
import NflTd from "./pages/NflTd";  // Simple TD system
import NFLTouchdownPropsComprehensive from "./pages/NFLTouchdownPropsComprehensive";  // Advanced TD system
import NFLPredictions from "./pages/NFLPredictions";
import HRR from "./HRR";
import HRDiagnosticsFooter from "./components/HRDiagnosticsFooter.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <div className="w-full border-b bg-white">
        <div className="container mx-auto px-4 py-3 flex flex-wrap gap-4">
          <Link to="/">Home</Link>
          <Link to="/mlb-hr">MLB HR</Link>
          <Link to="/mlb-hits2">MLB 2+ Hits</Link>
          <Link to="/hrr">HRR</Link>
          <Link to="/nfl-td">NFL TD</Link>
          <Link to="/nfl-td-comprehensive">NFL TD Advanced</Link>
          <Link to="/predictions">NFLPredictions</Link>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mlb-hr" element={<MLB_HR />} />
          <Route path="/mlb-hits2" element={<MLB_HITS2 />} />
          <Route path="/hrr" element={<HRR />} />
          {/* CHANGED: Use actual components */}
          <Route path="/nfl-td" element={<NflTd />} />
          <Route path="/nfl-td-comprehensive" element={<NFLTouchdownPropsComprehensive />} />
          <Route path="/predictions" element={<NFLPredictions />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Round Robin Sports Props</h1>
      <div className="text-gray-600">Pick a page above to generate model-based picks and round-robin suggestions.</div>
    
      <HRDiagnosticsFooter />
    </div>
  );
}
