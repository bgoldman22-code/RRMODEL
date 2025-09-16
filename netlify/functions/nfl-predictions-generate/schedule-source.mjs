// odds/schedule fallback you already use
export async function getScheduleWithOdds() {
  const base = process.env.URL || "https://bgroundrobin.com";
  try {
    const res = await fetch(`${base}/.netlify/functions/nfl-schedule-get`);
    if (res.ok) {
      const data = await res.json();
      return (data.matchups || []).map(m => ({
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoff: m.kickoff,
        // placeholder odds; replace with your real odds join if available
        odds: { ml_home: -120, ml_away: 102 },
      }));
    }
  } catch (_) {}
  return [];
}
