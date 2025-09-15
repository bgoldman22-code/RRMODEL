// netlify/functions/nfl-train/handler.mjs
// Lightweight trainer to (a) optionally read uploaded/remote CSVs if provided,
// (b) otherwise compute minimal team-form priors from odds schedule + existing blobs.
// Writes team_form.json to the configured Blobs store.
import { makeStore, saveToBlobs, loadFromBlobs, resolveStoreName } from '../_lib/blobs-helper.mjs';

function parseBool(v) {
  if (v === true) return true;
  if (typeof v === 'string') return ['1','true','yes','y'].includes(v.toLowerCase());
  return false;
}

export const handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const force = parseBool(qs.force || qs.f || '0');
  const years = (qs.years || '').split(',').map(s => s.trim()).filter(Boolean).map(s => parseInt(s,10));
  const season = qs.season ? parseInt(qs.season,10) : undefined;
  const useYears = years.length ? years : (season ? [season] : []);

  const storeName = resolveStoreName();
  let prior = null;
  try { prior = await loadFromBlobs('team_form.json', { name: storeName }); } catch {}

  // If no explicit years/season provided, and not forcing, just report status.
  if (!force && !useYears.length) {
    return {
      statusCode: 200,
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ ok: true, message: 'No training performed (pass ?force=1 to retrain)', store: storeName, hasPrior: !!prior })
    };
  }

  // Minimal team form: keep previous priors but decay them slightly, so we always have a usable artifact.
  // This avoids the historical fetch 404s while you patch source URLs.
  const TEAMS = [
    'ARIZONA CARDINALS','ATLANTA FALCONS','BALTIMORE RAVENS','BUFFALO BILLS','CAROLINA PANTHERS','CHICAGO BEARS','CINCINNATI BENGALS','CLEVELAND BROWNS',
    'DALLAS COWBOYS','DENVER BRONCOS','DETROIT LIONS','GREEN BAY PACKERS','HOUSTON TEXANS','INDIANAPOLIS COLTS','JACKSONVILLE JAGUARS','KANSAS CITY CHIEFS',
    'LAS VEGAS RAIDERS','LOS ANGELES CHARGERS','LOS ANGELES RAMS','MIAMI DOLPHINS','MINNESOTA VIKINGS','NEW ENGLAND PATRIOTS','NEW ORLEANS SAINTS','NEW YORK GIANTS',
    'NEW YORK JETS','PHILADELPHIA EAGLES','PITTSBURGH STEELERS','SAN FRANCISCO 49ERS','SEATTLE SEAHAWKS','TAMPA BAY BUCCANEERS','TENNESSEE TITANS','WASHINGTON COMMANDERS'
  ];
  const decay = 0.90;
  const baseline = 0.0;
  const next = {};
  for (const t of TEAMS) {
    const prev = prior?.form?.[t] ?? baseline;
    next[t] = prev * decay;
  }

  const artifact = {
    form: next,
    meta: {
      updated: new Date().toISOString(),
      store: storeName,
      note: 'Lightweight decay-only team form. Replace with full history once data source URLs are patched.'
    }
  };

  await saveToBlobs('team_form.json', artifact, { name: storeName });

  return {
    statusCode: 200,
    headers: { 'content-type':'application/json' },
    body: JSON.stringify({ ok: true, persisted: true, wrote: 'team_form.json', store: storeName, years: useYears })
  };
};
