// src/App.jsx (rescue)
import React from "react";

export default function App() {
  return (
    <div style={{padding:24, fontFamily:"system-ui"}}>
      <h1>✅ App booted</h1>
      <p>If you can see this, React mounted successfully and routing is fine.</p>
      <ul>
        <li><strong>Next step:</strong> if your original App caused a blank page, it likely throws during render or imports a bad path.</li>
        <li>We can now re-introduce your real App gradually (or wrap pages in ErrorBoundary) until the offender is found.</li>
      </ul>
    </div>
  );
}
