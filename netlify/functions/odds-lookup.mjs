// netlify/functions/odds-lookup.mjs
import { getStore } from "@netlify/blobs";

const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
const CANDIDATE_KEYS = [
  process.env.ODDS_SNAPSHOT_KEY || "latest.json",
  "odds_latest.json",
  "hr_latest.json",
  "odds_batter_home_runs.json"
];

function normName(s) {
  if (!s) return "";
  const lower = String(s).toLowerCase().trim();
  // move "lastname, firstname" to "firstname lastname"
  const m = lower.match(/^([^,]+),\s*(.+)$/);
  let t = m ? (m[2] + " " + m[1]) : lower;
  // remove punctuation/diacritics
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[.]/g, "").replace(/[\u2019’]/g, "'").replace(/,+/g, "");
  // collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  // remove common suffixes
  t = t.replace(/\b(jr|jr\.|iii|ii)\b/g, "").replace(/\s+/g, " ").trim();
  return t;
}

function tokenSetKey(s) {
  return new Set(normName(s).split(" ").filter(Boolean));
}

function jaccard(a, b) {
  const setA = tokenSetKey(a), setB = tokenSetKey(b);
  const inter = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size ? inter.size / union.size : 0;
}

async function loadAliases(store) {
  try {
    // allow shipping with repo or blobs; here we embed a small table inline if file not present
    return {
      "shohei ohtani": ["ohtani shohei", "ohtani, shohei"],
      "ronald acuna jr.": ["ronald acuna", "acuna ronald", "ronald acuna jr", "ronald acuna junior"],
      "giancarlo stanton": ["mike stanton"]
    };
  } catch { return {}; }
}

async function getSnapshot(store) {
  const tried = [];
  for (const key of CANDIDATE_KEYS) {
    try {
      const blob = await store.get(key);
      if (blob) return { key, json: JSON.parse(blob) };
      tried.push({ key, ok:false });
    } catch (e) {
      tried.push({ key, ok:false, err: String(e) });
    }
  }
  return { tried, json:null };
}

export const handler = async (event) => {
  try {
    const qp = event?.queryStringParameters || {};
    const name = qp.name || "";
    if (!name) {
      return json({ ok:false, error:"missing ?name= query" });
    }
    const store = getStore({ name: STORE_NAME });

    const snap = await getSnapshot(store);
    if (!snap?.json) {
      return json({
        ok:false,
        error:"no odds snapshot found",
        tried: snap?.tried || CANDIDATE_KEYS,
        hint:"run your odds refresh first; then retry"
      });
    }

    const odds = snap.json;
    // odds could be: { players: {...} } or a flat map; handle generically
    const allEntries = [];
    if (odds.players && typeof odds.players === "object") {
      for (const [k,v] of Object.entries(odds.players)) allEntries.push([k,v]);
    } else {
      for (const [k,v] of Object.entries(odds)) allEntries.push([k,v]);
    }

    const target = normName(name);
    const aliases = await loadAliases(store);
    const aliasList = [target, ...(aliases[target] || [])].map(normName);

    const exact = [];
    const fuzzy = [];
    for (const [rawKey, val] of allEntries) {
      const key = normName(rawKey);
      if (aliasList.includes(key)) {
        exact.push({ rawKey, key, val });
      } else {
        const score = jaccard(key, target);
        if (score >= 0.5) fuzzy.push({ rawKey, key, score, val });
      }
    }

    // also surface nearby names for manual inspection
    fuzzy.sort((a,b) => b.score - a.score);
    const sample = fuzzy.slice(0, 10).map(x => ({ rawKey: x.rawKey, score: Number(x.score.toFixed(2)) }));

    return json({
      ok:true,
      store: STORE_NAME,
      snapshot_key: snap.key,
      target: name,
      normalized: target,
      exact_count: exact.length,
      fuzzy_count: fuzzy.length,
      exact: exact.slice(0, 10),
      fuzzy_sample: sample
    });
  } catch (e) {
    return json({ ok:false, error:String(e) });
  }
};

function json(body) {
  return {
    statusCode: 200,
    headers: { "content-type":"application/json", "cache-control":"no-store" },
    body: JSON.stringify(body)
  };
}
