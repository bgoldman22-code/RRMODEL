import { getQuery, ok, toMoneylineText } from '../_lib/util.mjs';
import { blobsGetJSON } from '../_lib/blobs.mjs';
import { loadGamesBySeasons } from '../_lib/nflverse.mjs';
import { computeTeamForm, probFromFormDiff, confidenceFromEdge } from '../_lib/features.mjs';

const KEY = 'team_form.json';

function impliedFromMoneyline(ml) {
  if (ml == null || ml === "" || isNaN(Number(ml))) return 0.5;
  ml = Number(ml);
  return ml < 0 ? (-ml) / ((-ml) + 100) : 100 / (ml + 100);
}

export const handler = async (event) => {
  const q = getQuery(event);
  const force = q.force == '1' || q.force === 'true';

  let formData = null;
  let source = 'blobs';
  if (!force) {
    const blob = await blobsGetJSON(KEY);
    if (blob.ok && blob.value && blob.value.teamForm) {
      formData = blob.value.teamForm;
    }
  }
  if (!formData) {
    source = 'ephemeral';
    const games = await loadGamesBySeasons([new Date().getFullYear()]);
    formData = computeTeamForm(games);
  }

  let schedule = [];
  try {
    const url = new URL('/.netlify/functions/nfl-schedule-get?force=1', 'https://bgroundrobin.com');
    const res = await fetch(url, { redirect: 'follow' });
    const json = res.ok ? await res.json() : null;
    if (json && json.matchups) schedule = json.matchups;
  } catch {}

  if (!Array.isArray(schedule) || schedule.length === 0) {
    return ok({ ok:true, updated: new Date().toISOString(), meta:{ source: 'no-schedule' }, rows: [] });
  }

  const rows = schedule.map(g => {
    const home = g.homeTeam;
    const away = g.awayTeam;
    const fh = formData[home] ?? 0;
    const fa = formData[away] ?? 0;
    const pHome = probFromFormDiff(fh, fa);
    const pAway = 1 - pHome;

    const odds = g.odds || g;
    const ml_home = odds.ml_home;
    const ml_away = odds.ml_away;

    const pickMoneyline = pHome >= pAway ? home : away;
    const pickPrice = pHome >= pAway ? ml_home : ml_away;
    const conf = confidenceFromEdge(pHome >= pAway ? pHome : pAway, impliedFromMoneyline(pickPrice));

    return {
      id: g.id,
      matchup: `${away.toUpperCase()} @ ${home.toUpperCase()}`,
      kickoff: g.kickoff,
      moneylineText: toMoneylineText(pickMoneyline.toUpperCase(), pickPrice),
      moneylineConf: conf,
      spreadText: "–",
      spreadConf: 0,
      totalText: "–",
      totalConf: 0,
      debug: { home, away, fh, fa, pHome, pAway, odds: { ml_home, ml_away } }
    };
  });

  console.log('[PREDS]', JSON.stringify({ source, sample: rows[0] }));
  return ok({ ok:true, updated: new Date().toISOString(), meta:{ source }, rows });
};
