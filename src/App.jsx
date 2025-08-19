import React from "react";
import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";
import MLB from "./MLB.jsx";
import NFL from "./NFL.jsx";
import NFL_TD from "./NFL_TD.jsx";

export default function App() {
  return (
    <Router>
      <div className="App">
        <nav>
          <ul className="flex space-x-4">
            <li><NavLink to="/mlb">MLB HR</NavLink></li>
            <li><NavLink to="/nfl">NFL</NavLink></li>
            <li><NavLink to="/nfl-td">NFL TD</NavLink></li>
          </ul>
        </nav>
        <Routes>
          <Route path="/mlb" element={<MLB />} />
          <Route path="/nfl" element={<NFL />} />
          <Route path="/nfl-td" element={<NFL_TD />} />
        </Routes>
      </div>
    </Router>
  );
}
