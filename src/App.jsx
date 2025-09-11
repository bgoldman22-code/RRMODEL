import React from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import MLBHR from "./pages/MLBHR";

function Nav() {
  const link = "px-3 py-2 rounded hover:bg-gray-100";
  const active = "bg-gray-200";
  return (
    <nav className="flex gap-2 p-3 border-b">
      <NavLink to="/predictions" className={({isActive}) => `${link} ${isActive ? active : ""}`}>NFL Predictions</NavLink>
      <NavLink to="/mlb-hr" className={({isActive}) => `${link} ${isActive ? active : ""}`}>MLB HR</NavLink>
    </nav>
  );
}

function PredictionsShell() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-2">NFL Predictions</h1>
      <p>Predictions live on your existing page. (If you have a dedicated component already, keep using it.)</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/predictions" replace />} />
        <Route path="/predictions" element={<PredictionsShell />} />
        <Route path="/mlb-hr" element={<MLBHR />} />
        <Route path="*" element={<div className="p-6">Not Found</div>} />
      </Routes>
    </BrowserRouter>
  );
}