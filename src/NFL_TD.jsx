import React, { useEffect, useState } from "react";
import NflTdTable from "./components/NflTdTable.jsx";

export default function NFL_TD() {
  const [candidates, setCandidates] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const today = new Date().toISOString().split("T")[0];
        const res = await fetch(`/.netlify/functions/nfl-anytime-td-candidates?date=${today}&mode=week`);
        const data = await res.json();
        setCandidates(data);
      } catch (err) {
        console.error("Error fetching NFL TD candidates:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div>Loading NFL Anytime TD candidates…</div>;
  if (!candidates || !candidates.ok) return <div>No NFL TD data available.</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">NFL Anytime TD Picks</h1>
      <p>Games in window: {candidates.games ? candidates.games.length : 0}</p>
      <NflTdTable data={candidates} />
    </div>
  );
}
