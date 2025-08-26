// netlify/functions/nfl-td-candidates.mjs
// ESM-safe, no dependency on ./_lib/http.mjs. No Blobs required.
// Uses internal bootstrap & rosters functions (which may use SportsData internally).

/**
 * Minimal fetch helper
 */
async function getJSON(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url} :: ${body.slice(0,200)}`);
  }
  return res.json();
}

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function pick(v, dv) { return (v===undefined || v===null || v==='') ? dv : v; }

/**
 * Attempt to infer the origin to call sibling functions
 */
function getBaseURL(event) {
  const qBase = event.queryStringParameters?.base;
  if (qBase) return qBase.replace(/\/+$/,''); // trust explicit override
  const host = event.headers?.['x-forwarded-host'] || event.headers?.host || 'localhost';
  const proto = (event.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

export const handler = async (event) => {
  const t0 = Date.now();
  const params = event.queryStringParameters || {};
  const debug = params.debug === '1' || params.debug === 'true';
  const season = parseInt(params.season || '2025', 10);
  const week   = parseInt(params.week   || '1', 10);

  const base = getBaseURL(event);
  const passKey = params.key ? `&key=${encodeURIComponent(params.key)}` : '';
  const bsUrl = `${base}/.netlify/functions/nfl-bootstrap?season=${season}&week=${week}&mode=auto&noblobs=1&debug=0${passKey}`;
  const roUrl = `${base}/.netlify/functions/nfl-rosters?season=${season}&week=${week}&debug=0${passKey}`;

  let bootstrap, rosters, diag = [];
  try {
    [bootstrap, rosters] = await Promise.all([
      getJSON(bsUrl).catch(err => { diag.push({ step:'bootstrap', ok:false, error: String(err) }); return null; }),
      getJSON(roUrl).catch(err => { diag.push({ step:'rosters', ok:false, error: String(err) }); return null; }),
    ]);
  } catch (e) {
    // individual catch above already handled
  }

  if (!bootstrap || bootstrap.ok === false || !bootstrap.schedule) {
    const err = `bootstrap unavailable`;
    return json(500, { ok:false, error: err, bsUrl, diag, took_ms: Date.now()-t0 });
  }
  const games = Array.isArray(bootstrap.schedule?.games) ? bootstrap.schedule.games : [];
  const gameCount = games.length;

  // Normalize rosters { "PHI": { RB:[{Name, Depth, ...}], WR:[...], ... }, ... }
  const teamsByAbbrev = rosters?.rosters || {};
  const safeArr = v => Array.isArray(v) ? v : [];

  // Very simple candidate generator (placeholder but with real names when present)
  // For each team in schedule, pick RB depth 1 if available; else RB first; else WR1
  const candidates = [];
  for (const g of games) {
    const pair = [
      { team: g.home?.abbrev, opp: g.away?.abbrev },
      { team: g.away?.abbrev, opp: g.home?.abbrev },
    ];
    for (const side of pair) {
      const abbr = side.team;
      const opp  = side.opp;
      const teamPack = teamsByAbbrev[abbr] || {};
      const RBs = safeArr(teamPack.RB).sort((a,b) => (a.Depth||99) - (b.Depth||99));
      const WRs = safeArr(teamPack.WR).sort((a,b) => (a.Depth||99) - (b.Depth||99));
      const TEs = safeArr(teamPack.TE).sort((a,b) => (a.Depth||99) - (b.Depth||99));
      const QBs = safeArr(teamPack.QB).sort((a,b) => (a.Depth||99) - (b.Depth||99));

      let pickPlayer = RBs.find(p => (p.Depth||1) === 1) || RBs[0] || WRs[0] || TEs[0];
      const pos = pickPlayer?.Position || (RBs[0] ? 'RB' : (WRs[0] ? 'WR' : (TEs[0] ? 'TE' : 'RB')));
      const name = pickPlayer?.Name || `${pos}1-${abbr}`;
      const why = `${pos} • depth ${pickPlayer?.Depth ?? 1} • vs ${opp||'?'}`;

      // naive placeholder probabilities
      const model = pos === 'RB' ? 0.36 : (pos === 'WR' ? 0.28 : 0.22);
      const rz = +(model * 0.68).toFixed(3);
      const exp = +(model * 0.32).toFixed(3);

      candidates.push({
        team: abbr, opp, gameId: g.id, date: g.date,
        player: name, pos, model_td_pct: +(model*100).toFixed(1),
        rz_path: +(rz*100).toFixed(1), exp_path: +(exp*100).toFixed(1),
        why
      });
    }
  }

  const payload = {
    ok: true,
    season: bootstrap.schedule?.season ?? season,
    week: bootstrap.schedule?.week ?? week,
    games: gameCount,
    candidates_count: candidates.length,
    candidates: candidates,
    used: { source: 'nfl-bootstrap+nfl-rosters', base },
    took_ms: Date.now()-t0
  };
  if (debug) payload.diag = diag;
  return json(200, payload);
};
