// src/App.jsx
import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import MLB_HR from "./MLB_HR";
import MLB_HITS2 from "./MLB_HITS2";
import MLBRoundRobin from "./pages/MLBRoundRobin";  // MLB HR Round Robin V2
// CHANGED: Use the components you actually have
import NflTd from "./pages/NflTd";  // Simple TD system
import NFLTouchdownPropsComprehensive from "./pages/NFLTouchdownPropsComprehensive";  // Advanced TD system
import NFLPredictions from "./pages/NFLPredictions";
import NFLPredictionsV5 from "./pages/NFLPredictionsV5";
import FantasySitStart from "./pages/FantasySitStart";  // Fantasy Sit/Start Analyzer
import SoccerBTTS from "./pages/SoccerBTTS";  // Soccer BTTS predictions
import NHL from "./NHL";  // Elite NHL SOG Props
import NBAPredictionsV2 from "./pages/NBAPredictionsV2";  // NBA Elite V2 Game Predictions
import NBAPlayerProps from "./pages/NBAPlayerProps";  // NBA Player Props (Rebounds + Assists)
import NBAPlayerPropsV2 from "./pages/NBAPlayerPropsV2";  // NBA Player Props V2 (Phase 3 PRA)
import NBAPropsAligned from "./pages/NBAPropsAligned";  // NBA Props Aligned (Best of Both Models)
import NBADDTDPage from "./pages/NBADDTDPage";  // NBA DD/TD Picks Page
import NBAParlays from "./pages/NBAParlays";  // NBA Parlays (Confidence + SGP)
import NBATodaysBets from "./pages/NBATodaysBets";  // Today's NBA Bets (Aggregated)
import NCAAMBBPredictions from "./pages/NCAAMBBPredictions";  // NCAA MBB Predictions
import NCAAMBBV2Predictions from "./pages/NCAAMBBV2Predictions";  // NCAA MBB V2 (Calibrated + Away Dog Filter)
import NFLAnytimeTDV2 from "./pages/NFLAnytimeTDV2"; // NFL Anytime TD V2 (live)
import MLBF5ML from "./pages/MLBF5ML";  // MLB F5 Moneyline (Smart Scheduler)
import MLB_V3 from "./MLB_V3";  // MLB HR Model V3 (XGBoost + Statcast)
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
        { label: 'HRR (Hit-Run-RBI)', path: '/hrr' },
        { label: 'Round Robin V2 🎯', path: '/mlb-rr' },
        { label: 'F5 Moneyline ⚾', path: '/mlb-f5-ml' },
        { label: 'HR Model V3 🤖', path: '/mlb-hr-v3' }
      ]
    },
    nfl: {
      label: 'NFL',
      items: [
        { label: 'TD Advanced', path: '/nfl-td-comprehensive' },
        { label: 'Anytime TD V2 (Live) 🚀', path: '/nfl-anytime-td-v2' },
        { label: 'Game Predictions (V1)', path: '/predictions' },
        { label: 'Game Predictions V5 🚀', path: '/nfl-v5' },
        { label: 'Fantasy Sit/Start 🏈', path: '/fantasy-sitstart' }
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
        { label: "Today's Bets 🔥", path: '/nba-todays-bets' },
        { label: 'Game Predictions (Elite) ⭐', path: '/nba-predictions-v2' },
        { label: 'Player Props (R + A) 💰', path: '/nba-player-props' },
        { label: 'Player Props V2 (PRA) 🚀', path: '/nba-player-props-v2' },
        { label: 'Best Picks (Aligned) 🎯', path: '/nba-props-aligned' },
        { label: 'DD/TD Picks 🎯', path: '/nba-ddtd' },
        { label: 'Parlays 🎰', path: '/nba-parlays' }
      ]
    },
    ncaa: {
      label: 'NCAA',
      items: [
        { label: 'MBB Moneyline 🏀', path: '/ncaa-mbb' },
        { label: 'MBB V2 (Calibrated) 🎯', path: '/ncaa-mbb-v2' }
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
          <Route path="/mlb-rr" element={<MLBRoundRobin />} />
          <Route path="/mlb-f5-ml" element={<MLBF5ML />} />
          <Route path="/mlb-hr-v3" element={<MLB_V3 />} />
          {/* CHANGED: Removed simple NFL TD route */}
          <Route path="/nfl-td-comprehensive" element={<NFLTouchdownPropsComprehensive />} />
          <Route path="/nfl-anytime-td-v2" element={<NFLAnytimeTDV2 />} />
          <Route path="/predictions" element={<NFLPredictions />} />
          <Route path="/nfl-v5" element={<NFLPredictionsV5 />} />
          <Route path="/fantasy-sitstart" element={<FantasySitStart />} />
          <Route path="/soccer-btts" element={<SoccerBTTS />} />
          <Route path="/nhl-sog" element={<NHL />} />
          <Route path="/nba-predictions-v2" element={<NBAPredictionsV2 />} />
          <Route path="/nba-todays-bets" element={<NBATodaysBets />} />
          <Route path="/nba-player-props" element={<NBAPlayerProps />} />
          <Route path="/nba-player-props-v2" element={<NBAPlayerPropsV2 />} />
          <Route path="/nba-props-aligned" element={<NBAPropsAligned />} />
          <Route path="/nba-ddtd" element={<NBADDTDPage />} />
          <Route path="/nba-parlays" element={<NBAParlays />} />
          <Route path="/ncaa-mbb" element={<NCAAMBBPredictions />} />
          <Route path="/ncaa-mbb-v2" element={<NCAAMBBV2Predictions />} />
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
