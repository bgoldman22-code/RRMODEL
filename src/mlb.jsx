import React, { useMemo } from 'react';
import StraightTables from './components/StraightTables';

/**
 * This page looks for today's picks in one of three places:
 * 1) props.picks (if your framework passes data as props)
 * 2) window.__PICKS__ (if you assign picks globally elsewhere)
 * 3) falls back to an empty array
 *
 * It renders:
 * - Straight HR Bets (Top 13 Raw Probability)
 * - Straight EV Bets (Top 13 EV Picks) with a 19% HR prob floor
 */
export default function MLBPage(props = {}) {
  const picksFromProps = Array.isArray(props.picks) ? props.picks : null;
  const picksFromWindow = (typeof window !== 'undefined' && Array.isArray(window.__PICKS__)) ? window.__PICKS__ : null;
  const picks = useMemo(() => picksFromProps || picksFromWindow || [], [picksFromProps, picksFromWindow]);

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">MLB — Straight Bets</h1>
      <StraightTables picks={picks} />
    </div>
  );
}
