// Paste this in your browser console anywhere on your site
(async () => {
  const url = `${location.origin}/.netlify/functions/nfl-predictions-get?season=2025&week=2`;
  const res = await fetch(url);
  const data = await res.json();
  console.table([{
    ok: data.ok,
    season: data.season,
    week: data.week,
    source: data.source,
    bundle: data.BUNDLE_VERSION,
    games: (data.games||[]).length,
    hasParlays: !!data.parlays
  }]);
  if (!data.ok) return;
  // Spot check first two games
  console.log("Game[0]:", data.games[0]);
  console.log("Parlay 3-leg:", data.parlays?.legs3);
  console.log("Parlay 5-leg:", data.parlays?.legs5);
})();