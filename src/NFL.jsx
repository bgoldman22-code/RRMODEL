// src/NFL.jsx
import React, { useEffect, useState } from "react";
import tdEngine from "./nfl/tdEngine-default-shim.js";

export default function NFL() {
  const [candidates, setCandidates] = useState([]);
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/.netlify/functions/nfl-odds?book=draftkings&market=player_anytime_td");
        const data = await res.json();
        setOffers(data.offers || []);
        if (!data.offers || data.offers.length === 0) {
          // fallback to pure model
          const model = await tdEngine();
          setCandidates(model || []);
        } else {
          setCandidates(data.offers);
        }
      } catch (e) {
        console.error("NFL.jsx fetch error", e);
      }
    }
    load();
  }, []);

  return (
    <div>
      <h2>NFL — Anytime TD</h2>
      {candidates.length === 0 ? (
        <p>No candidates yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Game</th>
              <th>Model TD%</th>
              <th>Odds</th>
              <th>EV (1u)</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <tr key={i}>
                <td>{c.player}</td>
                <td>{c.team}</td>
                <td>{c.game}</td>
                <td>{c.modelPct}</td>
                <td>{c.odds || "—"}</td>
                <td>{c.ev || "—"}</td>
                <td>{c.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
