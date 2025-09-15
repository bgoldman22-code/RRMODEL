
'use strict';

const { loadFromBlobs } = require('../_lib/blobs-helper.cjs');

function pickFromForm(home, away, form) {
  const h = form[home] || { net: 0 };
  const a = form[away] || { net: 0 };
  const diff = (h.net || 0) - (a.net || 0);
  const prob = 0.5 + Math.max(-0.4, Math.min(0.4, diff / 20)); // crude mapping
  const conf = Math.round(prob * 100) / 100;
  const side = conf >= 0.5 ? home : away;
  const moneylineText = `${side} (model)`;
  return { moneylineText, moneylineConf: conf };
}

exports.handler = async (event) => {
  const qs = event && event.queryStringParameters || {};
  const debug = String(qs.debug || '').trim();
  const now = new Date().toISOString();

  const stored = await loadFromBlobs("team_form.json");
  if (!stored || !stored.features) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, rows: [], meta: { source: "stub", force: qs.force }, updated: now })
    };
  }

  const form = stored.features;
  // Minimal demo schedule: derive pairs from available team keys in alphabetical pairs for debug mode
  const teams = Object.keys(form).sort();
  const rows = [];
  for (let i = 0; i + 1 < teams.length && rows.length < 8; i += 2) {
    const away = teams[i], home = teams[i+1];
    const { moneylineText, moneylineConf } = pickFromForm(home, away, form);
    rows.push({
      id: `${home}-${away}`,
      matchup: `${away} @ ${home}`,
      kickoff: now,
      moneylineText,
      moneylineConf,
      spreadText: '—',
      spreadConf: null,
      totalText: '—',
      totalConf: null,
    });
  }

  const meta = { source: "model-epa-lite", usedYears: stored.years, updated: stored.updated };
  if (debug) {
    meta.sample = rows.slice(0, 2);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, rows, meta, updated: now })
  };
};
