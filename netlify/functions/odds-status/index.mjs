// odds-status (NFL) using explicit createClient helper
import { nflGetJSON } from '../_lib/blobs-explicit-nfl.js';

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week'));

    const tf = await nflGetJSON('team_form.json', null);
    const hasTeamForm = !!tf;
    const teamFormUpdatedAt = tf?.updatedAt || null;

    let hasOddsWeek = false, oddsUpdatedAt = null, oddsCount = 0;
    if (Number.isFinite(week)) {
      const odds = await nflGetJSON(`odds_week_${week}.json`, null);
      if (odds) {
        hasOddsWeek = true;
        oddsUpdatedAt = odds.updatedAt || null;
        oddsCount = Array.isArray(odds.rows) ? odds.rows.length : 0;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      hasTeamForm,
      teamFormUpdatedAt,
      hasOddsWeek,
      oddsUpdatedAt,
      oddsCount
    }, null, 2), { headers: { 'content-type': 'application/json' }});
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2), { status: 500 });
  }
};
