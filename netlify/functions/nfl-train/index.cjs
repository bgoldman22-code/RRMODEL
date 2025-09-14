// netlify/functions/nfl-train/index.cjs
// Trains/refreshes "team form" using nflverse games datasets.
// Robust fetching (new path, legacy path, gz and plain), retries, and clear logs.
// Persists to Netlify Blobs if configured, otherwise to memory (still returns OK so UI can test).

const https = require("https");
const zlib = require("zlib");
const { URL } = require("url");
const { openStore } = require("../_lib/blobs-helper.cjs");

const DEFAULT_YEARS = [2022, 2023, 2024, 2025];

// Simple fetch with retries and gzip handling
function fetchBuffer(url, { retries = 2, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = https.get(url, { timeout }, (res) => {
        if (res.statusCode !== 200) {
          const msg = `HTTP ${res.statusCode}`;
          res.resume();
          if (n > 0 && res.statusCode >= 500) {
            console.log("[nfl-train] Retry due to", msg, "for", url);
            return attempt(n - 1);
          }
          return reject(new Error(msg));
        }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });
      req.on("error", (err) => {
        if (n > 0) {
          console.log("[nfl-train] Retry due to network error", err.message, "for", url);
          return attempt(n - 1);
        }
        reject(err);
      });
      req.on("timeout", () => {
        req.destroy(new Error("timeout"));
      });
    };
    attempt(retries);
  });
}

async function fetchCSVforYear(year, base) {
  const baseURL = base || process.env.NFL_DATA_BASE || "https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/";
  const candidates = [
    `${baseURL.replace(/\/+$/, "")}/games_${year}.csv.gz`,
    `${baseURL.replace(/\/+$/, "")}/games_${year}.csv`,
    `${baseURL.replace(/\/+$/, "")}/games/${year}.csv.gz`,
    `${baseURL.replace(/\/+$/, "")}/games/${year}.csv`,
  ];
  for (const u of candidates) {
    try {
      console.log("[nfl-train] Fetch try:", u);
      const buf = await fetchBuffer(u);
      let csv;
      if (u.endsWith(".gz")) {
        csv = zlib.gunzipSync(buf).toString("utf8");
        console.log("[nfl-train] Decompressed gzip for", year, "bytes:", buf.length, "csvLen:", csv.length);
      } else {
        csv = buf.toString("utf8");
        console.log("[nfl-train] Fetched plain csv for", year, "len:", csv.length);
      }
      if (!csv || csv.length < 1000) throw new Error("csv_too_small");
      return { ok: true, year, csv };
    } catch (e) {
      console.log("[nfl-train] Fetch failed for candidate", u, "->", e.message);
    }
  }
  return { ok: false, year, reason: "fetch_failed" };
}

// Super light "team form" builder: counts appearances by team as proxy placeholder.
function buildTeamForm(allCSVs) {
  const form = {};
  for (const { csv } of allCSVs) {
    const lines = csv.split(/\r?\n/);
    const header = lines.shift();
    if (!header) continue;
    const cols = header.split(",");
    const homeIdx = cols.findIndex(c => /home_team/i.test(c));
    const awayIdx = cols.findIndex(c => /away_team/i.test(c));
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split(",");
      const home = parts[homeIdx];
      const away = parts[awayIdx];
      if (home) form[home] = (form[home] || 0) + 1;
      if (away) form[away] = (form[away] || 0) + 1;
    }
  }
  const teams = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, { games: v }]));
  return { teams };
}

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `https://dummy.local${event.path || ""}${event.rawQuery ? "?" + event.rawQuery : ""}`);
    const yearsParam = url.searchParams.get("years");
    const seasonParam = url.searchParams.get("season");
    const weekParam = url.searchParams.get("week");
    const force = url.searchParams.get("force");
    const years = yearsParam
      ? yearsParam.split(",").map(s => parseInt(s.trim(), 10)).filter(Boolean)
      : DEFAULT_YEARS;

    console.log("[nfl-train] start", { years, seasonParam, weekParam, force });

    const fetched = [];
    for (const y of years) {
      const res = await fetchCSVforYear(y);
      fetched.push(res);
    }

    const okCSV = fetched.filter(r => r.ok);
    let summary = { teams: 0 };
    let persisted = false;
    let wrote = null;
    let persist_error = null;

    if (okCSV.length > 0) {
      const form = buildTeamForm(okCSV);
      summary.teams = Object.keys(form.teams).length;
      try {
        const store = await openStore();
        await store.set("team_form.json", JSON.stringify(form));
        persisted = true;
        wrote = "team_form.json";
        console.log("[nfl-train] persisted team_form.json with", summary.teams, "teams");
      } catch (e) {
        persist_error = e.message;
        console.log("[nfl-train] persist failed:", e.message);
      }
    } else {
      console.log("[nfl-train] No CSVs fetched; skipping persist");
    }

    const body = {
      ok: true,
      meta: { years, persisted, wrote, persist_error },
      seasonResults: fetched.map(r => (r.ok ? { year: r.year, ok: true } : { year: r.year, ok: false, reason: r.reason })),
      summary,
      updated: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    };
  } catch (err) {
    console.error("[nfl-train] crash:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err && err.message || err) })
    };
  }
};