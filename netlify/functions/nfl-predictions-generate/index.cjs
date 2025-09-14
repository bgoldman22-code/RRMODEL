// Netlify Function: nfl-predictions-generate
// - Forces Netlify Blobs to use manual credentials (NETLIFY_SITE_ID, NETLIFY_API_TOKEN)
// - Normalizes team codes (e.g., LA -> LAR) to match your team_form keys
// - Graceful fallbacks: if schedule has no matchups or odds empty, still writes a valid payload

const { getStore } = require("@netlify/blobs");

function getEnv(name, fallback = undefined) {
  const v = process.env[name];
  return (v === undefined || v === "") ? fallback : v;
}

function makeStore() {
  const name = getEnv("BLOBS_STORE_NFL", "nfl-td");
  // Always use manual creds to avoid relying on implicit injection.
  const siteID = getEnv("NETLIFY_SITE_ID");
  const token  = getEnv("NETLIFY_API_TOKEN");

  if (!siteID || !token) {
    const err = new Error("Blobs context missing and no manual credentials provided. Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN.");
    err.code = "MISSING_BLOBS_CREDS";
    throw err;
  }
  return getStore({ siteID, token, name });
}

function normalizeTeam(t) {
  if (!t) return t;
  const x = String(t).toUpperCase();
  const MAP = {
    "LA": "LAR",   // Rams old/alt
    "STL": "LAR",
    "SD": "LAC",
    "WSH": "WAS",
    "WFT": "WAS",
    "JAX": "JAC",  // many feeds use JAC
    "TAM": "TB",
    "NOR": "NO",
    "SFO": "SF",
    "NWE": "NE",
    "GNB": "GB",
    "KAN": "KC",
    "NWE": "NE",
    "SJN": "NYJ", // just in case
    "CLV": "CLE",
    "ARZ": "ARI",
  };
  return MAP[x] || x;
}

function pickFromEPA(home, away) {
  // Minimal heuristic using decayed EPA if available
  const out = { type: "moneyline", team: home ? home : null, confidence: 0.55 };
  if (!home || !away) return out;

  const hOff = home?.decayed_data?.off_epa_decayed ?? home?.offense?.epa_per_play ?? 0;
  const aDef = away?.defense?.epa_allowed_per_play ?? 0;
  const aOff = away?.decayed_data?.off_epa_decayed ?? away?.offense?.epa_per_play ?? 0;
  const hDef = home?.defense?.epa_allowed_per_play ?? 0;

  const offEdge = hOff - aDef; // positive favors home
  const defEdge = ( -hDef ) - ( -aDef ); // simple relative

  if (offEdge > 0.05) {
    return { type: "spread", team: "HOME", confidence: 0.70 };
  }
  if ((hDef - aOff) < -0.05) {
    return { type: "moneyline", team: "HOME", confidence: 0.62 };
  }
  // slight away lean if both are negative
  if (offEdge < -0.05 && (aOff - hDef) > 0.02) {
    return { type: "moneyline", team: "AWAY", confidence: 0.58 };
  }
  return out;
}

exports.handler = async (event) => {
  const storeName = getEnv("BLOBS_STORE_NFL", "nfl-td");
  const siteID = getEnv("NETLIFY_SITE_ID");
  const token  = getEnv("NETLIFY_API_TOKEN");

  const BASE = getEnv("INTERNAL_FUNCTIONS_URL", "") || ""; // often empty on prod edge

  const scheduleUrl = getEnv("NFL_SCHEDULE_URL", "/.netlify/functions/nfl-schedule-get");
  const oddsUrl     = getEnv("NFL_ODDS_BRIDGE_URL", "/.netlify/functions/nfl-odds-bridge");
  const teamFormUrl = getEnv("NFLVERSE_PBP_URL", "/nflverse-team-form.json");

  // Diag modes
  const qs = event.queryStringParameters || {};
  if (qs.diag === "1") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        diag: {
          storeName,
          hasSiteId: Boolean(siteID),
          hasToken: Boolean(token),
          hasInternalFunctionsUrl: Boolean(BASE),
          url: process.env.URL || null,
          deployUrl: process.env.DEPLOY_PRIME_URL || null,
          node: process.version,
        },
      }),
      headers: { "content-type": "application/json" }
    };
  }

  // Helper to fetch JSON with graceful errors
  async function getJSON(url) {
    const res = await fetch(url);
    const ok = res.ok;
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { ok, status: res.status, url, json };
  }

  if (qs.diag === "fetch") {
    const schedule = await getJSON(scheduleUrl.startsWith("http") ? scheduleUrl : `${process.env.URL || ""}${scheduleUrl}`);
    const odds     = await getJSON(oddsUrl.startsWith("http") ? oddsUrl : `${process.env.URL || ""}${oddsUrl}`);
    const teamForm = await getJSON(teamFormUrl.startsWith("http") ? teamFormUrl : `${process.env.URL || ""}${teamFormUrl}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        endpoints: { scheduleUrl: schedule.url, oddsUrl: odds.url, teamFormUrl: teamForm.url },
        fetch: { schedule, odds, teamForm }
      }),
      headers: { "content-type": "application/json" }
    };
  }

  try {
    const scheduleRes = await getJSON(scheduleUrl.startsWith("http") ? scheduleUrl : `${process.env.URL || ""}${scheduleUrl}`);
    const oddsRes     = await getJSON(oddsUrl.startsWith("http") ? oddsUrl : `${process.env.URL || ""}${oddsUrl}`);
    const teamFormRes = await getJSON(teamFormUrl.startsWith("http") ? teamFormUrl : `${process.env.URL || ""}${teamFormUrl}`);

    if (!scheduleRes.ok || !teamFormRes.ok) {
      const err = new Error("Failed to fetch schedule or team form.");
      err.code = "FETCH_FAIL";
      throw err;
    }

    const teamForm = teamFormRes.json;
    const tmap = teamForm?.team_data || {};

    const nowIso = new Date().toISOString();
    const payload = {
      ok: true,
      updated: nowIso,
      meta: {
        scheduleStatus: scheduleRes.status,
        oddsStatus: oddsRes.status,
        provider: oddsRes?.json?.provider || "unknown",
      },
      rows: []
    };

    const matchups = scheduleRes.json?.matchups || [];
    if (!Array.isArray(matchups) || matchups.length === 0) {
      // Write an empty payload rather than throwing; UI can still show updated timestamp
      const store = makeStore();
      await store.setJSON("predictions/current.json", payload);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No matchups available; wrote empty payload.", data: payload }),
        headers: { "content-type": "application/json" }
      };
    }

    // Build an easy lookup for odds by matchup if provided
    const oddsOffers = oddsRes?.json?.offers || oddsRes?.json?.rows || [];
    const oddsByGame = new Map();
    for (const o of oddsOffers) {
      if (o?.gameId) {
        if (!oddsByGame.has(o.gameId)) oddsByGame.set(o.gameId, []);
        oddsByGame.get(o.gameId).push(o);
      }
    }

    for (const m of matchups) {
      const homeRaw = m.homeTeam || m.home || m.home_code;
      const awayRaw = m.awayTeam || m.away || m.away_code;
      const home = normalizeTeam(homeRaw);
      const away = normalizeTeam(awayRaw);

      const hMetrics = tmap[home];
      const aMetrics = tmap[away];

      // Use EPA-based fallback if odds are missing
      let pick = { type: "moneyline", team: home, confidence: 0.55 };

      if (hMetrics && aMetrics) {
        const p = pickFromEPA(hMetrics, aMetrics);
        pick = {
          type: p.type,
          team: p.team === "HOME" ? home : p.team === "AWAY" ? away : (p.team || home),
          confidence: p.confidence
        };
      }

      payload.rows.push({
        id: m.id || `${away}@${home}:${m.kickoff || ""}`,
        matchup: `${away} @ ${home}`,
        kickoff: m.kickoff || null,
        pick
      });
    }

    const store = makeStore();
    await store.setJSON("predictions/current.json", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: "Predictions generated successfully.", data: payload }),
      headers: { "content-type": "application/json" }
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "Failed to generate predictions.", details: error.message }),
      headers: { "content-type": "application/json" }
    };
  }
};
