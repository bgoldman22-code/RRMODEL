import React from "react";

export default function Parlays({ parlays }) {
  if (!parlays?.length) return <div>No parlays built yet.</div>;

  const formatBook = (bk) => bk ? bk.charAt(0).toUpperCase() + bk.slice(1) : "";

  return (
    <div>
      {parlays.map((p, i) => (
        <div key={i} className="parlay">
          <h3>
            Parlay #{i + 1}<br />
            Price: {p.price.american} (dec {p.price.decimal}) • P*: {p.pstar}% • EV: {p.ev}
          </h3>
          {p.legs.map((leg, j) => (
            <div key={j}>
              {leg.sport.toUpperCase()} • {leg.market_display} – {leg.outcome}: {leg.odds.american} ({formatBook(leg.book)})
              <br />
              Model {leg.modelProb}% vs book {leg.bookProb}% (edge {leg.edge}%)
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
