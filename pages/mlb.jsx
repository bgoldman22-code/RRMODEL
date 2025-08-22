
import React from "react";
import StraightTables from "@/components/StraightTables";

export default function MLBPage() {
  const picks = (typeof window !== "undefined" && window.__PICKS__) || [];

  return (
    <div>
      <h1>MLB Picks</h1>
      <StraightTables picks={picks} />
    </div>
  );
}
