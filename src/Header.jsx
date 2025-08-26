// src/Header.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";

const tabs = [
  { to: "/", label: "MLB HR" },
  { to: "/hits2", label: "2+ Hits" },
  { to: "/hrr", label: "HRR" },
  // Keep NFL TD if your route exists
  { to: "/nfl-td", label: "NFL TD", optional: true },
];

export default function Header() {
  const loc = useLocation();
  return (
    <div className="bg-white border-b">
      <div className="container mx-auto px-4 py-3 flex gap-4">
        {tabs.map(t => (
          <Link key={t.to} to={t.to}
            className={(loc.pathname === t.to ? "font-bold " : "") + "text-sm hover:underline"}>
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
