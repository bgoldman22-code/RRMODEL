// src/nfl/tdEngine-default-shim.js
// Safe default export shim for tdEngine.
// It imports whatever ./tdEngine.js exports (named or default) and re-exports a default function.
import * as TD from "./tdEngine.js";

const tdEngine = TD.default || TD.tdEngine || TD.engine || TD.run || null;

export default function tdEngineDefaultShim(...args) {
  if (typeof tdEngine !== "function") {
    console.warn("[tdEngine-default-shim] tdEngine is not a function; available keys:", Object.keys(TD));
    return { candidates: [], diagnostics: { error: "tdEngine export missing" } };
  }
  return tdEngine(...args);
}
