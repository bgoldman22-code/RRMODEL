import React from 'react';

/** Non-breaking banner that only renders text. */
export default function BetStructureNote(){
  return (
    <div className="mb-4 rounded-lg border p-3 text-sm bg-white">
      <div className="font-semibold mb-1">Recommended RR structure</div>
      <ul className="list-disc pl-5 space-y-1">
        <li><b>12 legs</b>: target ~8–9 unique games; allow up to 3–4 games with two bats.</li>
        <li><b>15 legs</b>: same goals but scale stakes to keep exposure similar (0.5u x2 / 0.25u x3).</li>
        <li>Prioritize at least one pick from high-HR parks (Coors, Yankee Stadium, Great American, Citizens Bank).</li>
        <li>Don’t force 1/game — double up in juicy games; use diversification picks to widen coverage.</li>
      </ul>
    </div>
  );
}
