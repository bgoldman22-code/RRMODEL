import React, { useEffect, useState } from "react";
import { impliedFromAmerican, evFromProbAndOdds } from "./utils/ev.js";
import { hotColdMultiplier } from "./utils/hotcold.js";
import { normName, buildWhy } from "./utils/why.js";
import { pitchTypeEdgeMultiplier } from "./utils/model_scalers.js";

export default function MLB() {
  const [rows, setRows] = useState([]);
  const [oddsAPI, setOddsAPI] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch("/.netlify/functions/odds-get");
        const oddsData = await resp.json();
        setOddsAPI(oddsData);
      } catch (e) {
        console.error("odds-get failed", e);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function compute() {
      let players = []; // your model logic here
      // Example: each player has {name, prob, modelOdds}
      players = players.map(p => {
        let actual = null;
        if (oddsAPI && oddsAPI[p.name?.toLowerCase()]) {
          actual = oddsAPI[p.name.toLowerCase()].median_american;
        }
        return {
          ...p,
          modelOdds: impliedFromAmerican(p.prob),
          actualOdds: actual,
          ev: actual
            ? evFromProbAndOdds(p.prob, actual)
            : evFromProbAndOdds(p.prob, impliedFromAmerican(p.prob))
        };
      });
      setRows(players);
    }
    if (oddsAPI) compute();
  }, [oddsAPI]);

  return (
    <div>
      <h2>MLB HR — Calibrated + Hot/Cold + Odds-first EV</h2>
      <table>
        <thead>
          <tr>
            <th>Player</th><th>Game</th><th>Model HR%</th>
            <th>Model Odds</th><th>Actual Odds</th><th>EV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i) => (
            <tr key={i}>
              <td>{r.name}</td>
              <td>{r.game}</td>
              <td>{(r.prob*100).toFixed(1)}%</td>
              <td>{r.modelOdds}</td>
              <td>{r.actualOdds ?? "-"}</td>
              <td>{r.ev.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
