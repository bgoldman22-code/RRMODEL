import { get } from '@netlify/blobs';
import { blobsGetJSON } from '../_lib/blobs.js';

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week')) || null;

    const teamFormRes = await get('team_form.json');
    const hasTeamForm = !!teamFormRes;
    let teamFormUpdatedAt = null;
    try {
      if (teamFormRes) {
        const hdr = teamFormRes.headers.get('Last-Modified');
        teamFormUpdatedAt = hdr || null;
      }
    } catch {}

    let hasOddsWeek = false, oddsUpdatedAt = null, oddsCount = 0;
    if (week || week === 0) {
      const odds = await blobsGetJSON(`odds_week_${week}.json`, null);
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
