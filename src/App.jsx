// src/App.jsx
import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import MLB_HR from "./MLB_HR";
import MLB_HITS2 from "./MLB_HITS2";
// CHANGED: Use the components you actually have
import NflTd from "./pages/NflTd";  // Simple TD system
import NFLTouchdownPropsComprehensive from "./pages/NFLTouchdownPropsComprehensive";  // Advanced TD system
import NFLPredictions from "./pages/NFLPredictions";
import NFLV4Page from "./pages/nfl-v4";  // V4.1 ML Pipeline
import NFLV5Page from "./pages/nfl-v5";  // V5 Hybrid Best-of-Breed
import SoccerBTTS from "./pages/SoccerBTTS";  // Soccer BTTS predictions
import NHL from "./NHL";  // Elite NHL SOG Props
import HRR from "./HRR";
import HRDiagnosticsFooter from "./components/HRDiagnosticsFooter.jsx";

// Dropdown Menu Component
function DropdownMenu({ label, items, isOpen, onToggle }) {
  const handleMouseEnter = () => {
    if (!isOpen) onToggle();
  };
  
  const handleMouseLeave = () => {
    if (isOpen) onToggle();
  };
  
  return (
    <div 
      className="relative" 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
    >
      <button className="font-medium hover:text-blue-600 transition-colors flex items-center gap-1 py-2">
        {label}
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-0 bg-white border rounded-md shadow-lg min-w-[200px] z-50">
          {items.map((item, idx) => (
            <Link
              key={idx}
              to={item.path}
              className="block px-4 py-2 hover:bg-gray-100 transition-colors text-sm"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [openMenu, setOpenMenu] = useState(null);

  const menuStructure = {
    mlb: {
      label: 'MLB',
      items: [
        { label: 'Home Runs', path: '/mlb-hr' },
        { label: '2+ Hits', path: '/mlb-hits2' },
        { label: 'HRR (Hit-Run-RBI)', path: '/hrr' }
      ]
    },
    nfl: {
      label: 'NFL',
      items: [
        { label: 'TD Advanced', path: '/nfl-td-comprehensive' },
        { label: 'Game Predictions', path: '/predictions' },
        { label: 'V4.1 (Direct ML)', path: '/nfl-v4' },
        { label: 'V5 (Hybrid) 🏆', path: '/nfl-v5' }
      ]
    },
    soccer: {
      label: 'Soccer',
      items: [
        { label: 'BTTS (Both Teams To Score)', path: '/soccer-btts' }
      ]
    },
    nhl: {
      label: 'NHL',
      items: [
        { label: 'SOG Props (Elite Model)', path: '/nhl-sog' }
      ]
    },
    nba: {
      label: 'NBA',
      items: [
        { label: 'Player Props (R + A) 💰', path: '/nba-player-props' },
        { label: 'Coming Soon...', path: '#', disabled: true }
      ]
    }
  };

  return (
    <BrowserRouter>
      <div className="w-full border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-3 flex flex-wrap gap-6 items-center">
          <Link to="/" className="font-bold text-lg hover:text-blue-600 transition-colors">Home</Link>
          
          {Object.entries(menuStructure).map(([key, menu]) => (
            <DropdownMenu
              key={key}
              label={menu.label}
              items={menu.items}
              isOpen={openMenu === key}
              onToggle={() => setOpenMenu(openMenu === key ? null : key)}
            />
          ))}
        </div>
      </div>
      <div className="container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mlb-hr" element={<MLB_HR />} />
          <Route path="/mlb-hits2" element={<MLB_HITS2 />} />
          <Route path="/hrr" element={<HRR />} />
          {/* CHANGED: Removed simple NFL TD route */}
          <Route path="/nfl-td-comprehensive" element={<NFLTouchdownPropsComprehensive />} />
          <Route path="/predictions" element={<NFLPredictions />} />
          <Route path="/nfl-v4" element={<NFLV4Page />} />
          <Route path="/nfl-v5" element={<NFLV5Page />} />
          <Route path="/soccer-btts" element={<SoccerBTTS />} />
          <Route path="/nhl-sog" element={<NHL />} />
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
