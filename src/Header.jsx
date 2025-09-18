// src/Header.jsx
// MERGE-ONLY TEMPLATE: Insert the <Link to="/nfl-td">NFL TD</Link> into your existing nav.
// This file is a minimal sample; if you already have a full Header, copy only the link lines.
import React from 'react';
import { Link } from 'react-router-dom';

export default function Header(){
  return (
    <header className="px-4 py-3 border-b flex items-center gap-4">
      <Link to="/" className="font-semibold">bgroundrobin</Link>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-3 text-sm">
        {/* ADD this line inside your existing desktop nav */}
        <Link to="/nfl-td" className="nav-link">NFL TD</Link>
      </nav>

      {/* Mobile menu example (optional) */}
      {/*
      <details className="md:hidden ml-auto">
        <summary className="cursor-pointer px-2 py-1 border rounded">Menu</summary>
        <div className="mt-2 border rounded">
          <nav className="flex flex-col text-sm">
            <Link to="/nfl-td" className="block px-4 py-2">NFL TD</Link>
            // Mirror other links here...
          </nav>
        </div>
      </details>
      */}
    </header>
  );
}
