// src/App.jsx
// MERGE-ONLY TEMPLATE: Copy just the import + the two <Route> lines into your existing App.jsx.
// Do NOT replace your full file if you already have a complex router/layout.
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// ADD this import near your other pages:
import NflTd from './pages/NflTd'; // New TD system

// Optional placeholder Header; if you already have one, keep yours.
import Header from './Header';

function Home(){ return <div className="p-6">Home</div>; } // placeholder

export default function App(){
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        {/* Keep your existing routes here */}
        <Route path="/" element={<Home />} />

        {/* --- NFL TD (new) --- */}
        {/* ADD these to your existing <Routes>: */}
        <Route path="/nfl-td" element={<NflTd />} />
        <Route path="/nfl" element={<NflTd />} /> {/* /nfl as alias */}

        {/* REMOVE legacy TD routes if they exist elsewhere: */}
        {/** <Route path="/nfl-td" element={<NFL_TD />} /> */}
        {/** <Route path="/nfl-touchdown-props" element={<NFLTouchdownProps />} /> */}
      </Routes>
    </BrowserRouter>
  );
}
