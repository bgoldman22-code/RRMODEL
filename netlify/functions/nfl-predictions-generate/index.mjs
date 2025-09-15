/** nfl-predictions-generate: reads team_form.json; if missing, rows = [] */
import { loadFromBlobs } from '../_lib/blobs-helper.mjs';

export const handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const force = qs.force || qs.f || null;

  const features = await loadFromBlobs('team_form.json');
  if (!features) {
    return json(200, { ok: true, updated: new Date().toISOString(), meta: { source: 'no-team-form' }, rows: [] });
  }

  // Minimal output proving we have features (don’t invent odds here):
  const sample = Object.entries(features.teamForm).slice(0, 5).map(([team, v]) => ({
    id: team,
    matchup: `${team} vs ...`,
    kickoff: null,
    moneylineText: `${team} (model)`,
    moneylineConf: Math.max(50, Math.min(90, Math.round(60 + v.avg_margin * 5))),
    spreadText: `N/A`,
    spreadConf: 50,
    totalText: `N/A`,
    totalConf: 50
  }));

  return json(200, { ok: true, updated: new Date().toISOString(), meta: { source: 'team-form' }, rows: sample });
};

function json(status, obj) {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}
