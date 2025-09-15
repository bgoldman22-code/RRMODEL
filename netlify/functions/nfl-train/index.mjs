import { getQuery, ok } from '../_lib/util.mjs';
import { loadGamesBySeasons } from '../_lib/nflverse.mjs';
import { computeTeamForm } from '../_lib/features.mjs';
import { blobsPutJSON } from '../_lib/blobs.mjs';

const KEY = 'team_form.json';

export const handler = async (event) => {
  const q = getQuery(event);
  const years = q.years ? q.years.split(',').map(s=>Number(s.trim())) :
               q.season ? [Number(q.season)] : [new Date().getFullYear()];

  const games = await loadGamesBySeasons(years);
  const teamForm = computeTeamForm(games);
  const summary = { teams: Object.keys(teamForm).length, totalRows: games.length };

  const put = await blobsPutJSON(KEY, { teamForm, updated: new Date().toISOString(), seasons: years });
  const meta = {
    years,
    persisted: !!put.ok,
    wrote: put.ok ? KEY : null,
    persist_error: put.ok ? null : put.error || null
  };

  console.log('[TRAIN]', JSON.stringify({ meta, summary }));
  return ok({ ok: true, meta, summary, seasonResults: [], updated: new Date().toISOString() });
};
