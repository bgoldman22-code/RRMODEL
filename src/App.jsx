
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Predictions from './pages/Predictions';
import MLBHR from './pages/MLBHR';
import MLBHits2Plus from './pages/MLBHits2Plus';
import HRR from './pages/HRR';

function Nav() {
  return (
    <nav className="w-full border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex gap-6 items-center">
        <Link to="/" className="font-semibold">Home</Link>
        <Link to="/mlb-hr">MLB HR</Link>
        <Link to="/mlb-2plus-hits">MLB 2+ Hits</Link>
        <Link to="/hrr">HRR</Link>
        <Link to="/predictions" className="ml-auto">Predictions</Link>
      </div>
    </nav>
  );
}

function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Welcome</h1>
      <p className="text-gray-600">Choose a page from the navigation. NFL Predictions is new and shows weekly games and auto-built parlays.</p>
      <div className="mt-4">
        <Link to="/predictions" className="underline font-medium">Go to NFL Predictions →</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/predictions" element={<Predictions />} />
        <Route path="/mlb-hr" element={<MLBHR />} />
        <Route path="/mlb-2plus-hits" element={<MLBHits2Plus />} />
        <Route path="/hrr" element={<HRR />} />
      </Routes>
    </Router>
  );
}
