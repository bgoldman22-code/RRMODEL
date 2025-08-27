import React from "react";
import DiagnosticsBar from "./DiagnosticsBar.jsx";
import LearningDiagnostics from "./LearningDiagnostics.jsx";

// Back-compat shim for older pages expecting <HRDiagnosticsFooter />
export default function HRDiagnosticsFooter(){
  return (
    <footer className="mt-12 border-t pt-6">
      <div className="mb-3">
        <DiagnosticsBar />
      </div>
      <LearningDiagnostics />
    </footer>
  );
}
