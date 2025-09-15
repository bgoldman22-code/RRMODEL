import { blobsGetJSON, blobsGetResponse } from '../_lib/blobs.js';

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week'));

    const res = await blobsGetResponse(context, 'team_form.json');
    const hasTeamForm = !!res;
    const teamFormUpdatedAt = res ? (res.headers.get('Last-Modified') || null) : null;

    let hasOddsWeek = false, oddsUpdatedAt = null, oddsCount = 0;
    if (Number.isFinite(week)) {
      const odds = await blobsGetJSON(context, `odds_week_${week}.json`, null);
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
