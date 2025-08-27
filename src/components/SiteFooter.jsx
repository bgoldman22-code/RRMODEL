import React from "react";
import DiagnosticsBar from "./DiagnosticsBar.jsx";
import LearningDiagnostics from "./LearningDiagnostics.jsx";

export default function SiteFooter(){
  return (
    <footer className="mt-12 border-t pt-6">
      <div className="mb-3">
        <DiagnosticsBar />
      </div>
      <LearningDiagnostics />
    </footer>
  );
}
