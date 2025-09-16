// netlify/functions/teamform-refresh/index.mjs
// Loads nflverse-team-form.json from the public site and caches it to Blobs.
import { nflBlobsGetJSON, nflBlobsPutJSON } from '../_lib/blobs-nfl.js';

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';

    const existing = await nflBlobsGetJSON('team_form.json', null);
    if (existing && !force) {
      return json({ ok: true, cached: true, teams: Object.keys(existing.team_data || {}).length });
    }

    const base = (process.env.URL || '');
    const res = await fetch(base + '/nflverse-team-form.json');
    if (!res.ok) return json({ error: `Failed to fetch nflverse-team-form.json: ${res.status}` }, 400);

    const teamForm = await res.json();
    if (!teamForm?.team_data) return json({ error: 'Invalid team form data structure' }, 400);

    // Stamp updated time for status endpoint
    teamForm.updatedAt = new Date().toISOString();
    await nflBlobsPutJSON('team_form.json', teamForm);

    return json({ ok: true, updated: true, teams: Object.keys(teamForm.team_data).length, updatedAt: teamForm.updatedAt });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { 'content-type': 'application/json' } });
}
