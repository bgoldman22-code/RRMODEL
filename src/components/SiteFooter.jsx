
import React from "react";
import DiagnosticsBar from "./DiagnosticsBar.jsx";
import LearningDiagnostics from "./LearningDiagnostics.jsx";

export default function SiteFooter(){
  return (
    <footer className="mt-12 border-t pt-6">
      <div className="mb-3">
        <DiagnosticsBar />
      </div>
      <div className="text-xs text-gray-700">
        <span className="font-semibold">Learning diagnostics • 2025-08-27 (ET)</span>
        <span className="ml-2">MLB HR</span>
        <span className="ml-2">picks today: no</span>
        <span className="ml-2">samples: 1095</span>
        <span className="ml-2">days: 18</span>
        <span className="ml-2">last run: 8/26/2025, 10:40:45 AM</span>
        <span className="ml-2">fn ok</span>
      </div>
      <div className="mt-2">
        <LearningDiagnostics />
      </div>
    </footer>
  );
}
