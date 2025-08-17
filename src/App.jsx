// src/App.jsx (bridge/probe)
import React, { Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary.jsx";

// Lazy-load the original app (you must rename it to App.real.jsx)
const RealApp = React.lazy(() => import("./App.real.jsx"));

export default function App(){
  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{padding:16,fontFamily:"system-ui"}}>Loading…</div>}>
        <RealApp />
      </Suspense>
    </ErrorBoundary>
  );
}
