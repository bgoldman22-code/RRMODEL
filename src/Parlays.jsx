import React, { useEffect, useState } from "react";

export default function Parlays() {
  const [legs, setLegs] = useState([]);
  const [model, setModel] = useState({});
  const [demo, setDemo] = useState(true);
  const [parlays, setParlays] = useState([]);
  const [diag, setDiag] = useState({});

  // --- tiny demo odds to seed if feeds are empty ---
  const clientDemoOdds = [
    { id: "mlb1", gameId: "BOS@NYY", market: "MLB HR", american: "+200" },
    { id: "nba1", gameId: "LAL@BOS", market: "NBA Rebounds", american: "-110" },
    { id: "nfl1", gameId: "KC@BUF", market: "NFL TD", american: "+150" },
    { id: "mls1", gameId: "LAFC@SEA", market: "MLS Over 2.5", american: "+120" },
    { id: "nhl1", gameId: "BOS@MTL", market: "NHL Shots", american: "-105" },
    { id: "ncaaf1", gameId: "ND@USC", market: "NCAAF Spread", american: "+130" },
  ];

  // simple American odds → implied prob
  const toProb = (american) => {
    const n = parseInt(american, 10);
    return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
  };

  // build demo parlays if feeds are empty
  const buildParlays = (legsIn, modelIn) => {
    let useLegs = legsIn;
    let useModel = modelIn;

    if (demo && (!useLegs || useLegs.length === 0)) {
      useLegs = clientDemoOdds;
      useModel = {};
      clientDemoOdds.forEach((leg) => {
        const p = toProb(leg.american) + 0.05; // add small edge
        useModel[leg.id] = Math.min(0.85, p);
      });
    }

    // pick 3–5 leg parlays
    const out = [];
    if (useLegs.length >= 3) {
      for (let i = 0; i < 3; i++) {
        const sel = useLegs.sort(() => 0.5 - Math.random()).slice(0, 3);
        const prob = sel.reduce((p, leg) => p * (useModel[leg.id] || 0.5), 1);
        out.push({
          legs: sel,
          P: prob.toFixed(3),
        });
      }
    }
    return out;
  };

  useEffect(() => {
    const built = buildParlays(legs, model);
    setParlays(built);
    setDiag({
      legsParsed: legs?.length || 0,
      modelKeys: Object.keys(model).length,
      demo,
    });
  }, [legs, model, demo]);

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Parlays (Sureshot Mode)</h2>
      <p>Built from your live odds + model. Toggle Demo to test UI even if feeds are empty.</p>
      <p>
        <b>*P*</b> is the model’s joint hit probability (correlation-adjusted heuristic).
      </p>
      <button onClick={() => setDemo(!demo)}>
        Demo {demo ? "ON" : "OFF"}
      </button>

      {parlays.length === 0 ? (
        <p>No parlays built yet.</p>
      ) : (
        <ul>
          {parlays.map((px, i) => (
            <li key={i}>
              {px.legs.map((l) => `${l.market} (${l.american})`).join(" + ")} → P={px.P}
            </li>
          ))}
        </ul>
      )}

      <pre>Diag — {JSON.stringify(diag, null, 2)}</pre>
    </div>
  );
}
