// netlify/functions/odds-status/index.mjs
// Reports presence and freshness of team_form.json and odds_week_{week}.json
import { nflBlobsGetJSON } from '../_lib/blobs-nfl.js';

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week'));

    const tf = await nflBlobsGetJSON('team_form.json', null);
    const hasTeamForm = !!tf;
    const teamFormUpdatedAt = tf?.updated || tf?.updatedAt || null;

    let hasOddsWeek = false, oddsUpdatedAt = null, oddsCount = 0;
    if (Number.isFinite(week)) {
      const odds = await nflBlobsGetJSON(`odds_week_${week}.json`, null);
      if (odds) {
        hasOddsWeek = true;
        oddsUpdatedAt = odds.updatedAt || null;
        oddsCount = Array.isArray(odds.rows) ? odds.rows.length : 0;
      }
    }

    return new Response(JSON.stringify({ ok: true, hasTeamForm, teamFormUpdatedAt, hasOddsWeek, oddsUpdatedAt, oddsCount }, null, 2), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
};
