// File: public/js/predictions.js
(async () => {
  const params = new URLSearchParams(location.search);
  const season = params.get("season") || "";
  const week = params.get("week") || "";

  const base = "/.netlify/functions/nfl-predictions-get";
  const url = season || week ? `${base}?${new URLSearchParams({season, week})}` : base;

  const res = await fetch(url).then(r => r.json()).catch(()=>({ok:false,error:"network error"}));
  if (!res?.ok) {
    document.querySelector("#meta").textContent = "No predictions available yet.";
    return;
  }

  const data = res;
  document.querySelector("#meta").innerHTML = [
    `<div><b>Season:</b> ${data.season} &nbsp; <b>Week:</b> ${data.week}</div>`,
    `<div class="text-xs text-gray-500">Generated at: ${data.generated_at || "unknown"} &nbsp; • &nbsp; Source: ${data.source || "local"}</div>`
  ].join("");

  // Parlays
  const parlays = Array.isArray(data.parlays) ? data.parlays : [];
  const $parlays = document.querySelector("#parlays");
  if (parlays.length) {
    const html = parlays.map(p => {
      const legs = p.legs || [];
      return `
        <div class="bg-white border rounded-xl p-4 mb-3 shadow-sm">
          <div class="font-semibold mb-2">${p.type || "Parlay"}</div>
          <ul class="list-disc ml-6 text-sm">
            ${legs.map(l => `<li>${l.title || `${l.market || ""} ${l.pick || ""}`}</li>`).join("")}
          </ul>
          ${p.est_payout ? `<div class="mt-2 text-sm text-gray-600">Est. payout: ${p.est_payout}</div>`: ""}
        </div>`;
    }).join("");
    $parlays.innerHTML = `<h2 class="text-lg font-semibold mb-2">Suggested Parlays</h2>${html}`;
  } else {
    $parlays.innerHTML = `<h2 class="text-lg font-semibold mb-2">Suggested Parlays</h2><div class="text-sm text-gray-500">No parlay suggestions yet.</div>`;
  }

  // Games
  const games = Array.isArray(data.games) ? data.games : [];
  const $games = document.querySelector("#games");
  if (!games.length) {
    $games.innerHTML = `<div class="text-sm text-gray-500">No games predicted yet.</div>`;
    return;
  }

  $games.innerHTML = games.map(g => {
    const mm = g.moneyline || {};
    const sp = g.spread || {};
    const tot = g.total || {};
    const alt = Array.isArray(g.alt_lines) ? g.alt_lines : [];

    function cell(label, v) {
      return `<div><span class="text-gray-500 mr-1">${label}:</span> ${v ?? "-"}</div>`;
    }
    return `
      <div class="bg-white border rounded-xl p-4 shadow-sm">
        <div class="flex justify-between items-baseline mb-1">
          <div class="font-semibold">${g.away} @ ${g.home}</div>
          <div class="text-xs text-gray-500">${g.kickoff ? new Date(g.kickoff).toLocaleString() : ""}</div>
        </div>
        <div class="text-sm grid grid-cols-2 gap-y-1">
          ${cell("Moneyline Pick", mm.pick || "-")}
          ${cell("Spread Pick", sp.pick ? `${sp.pick} ${sp.line ?? ""}` : "-")}
          ${cell("Model Spread", sp.model != null ? sp.model : "-")}
          ${cell("Total Pick", tot.pick ? `${tot.pick} ${tot.line ?? ""}` : "-")}
          ${cell("Model Total", tot.model != null ? tot.model : "-")}
          ${cell("Confidence", g.confidence != null ? (Math.round(g.confidence*100)+"%") : "-")}
        </div>
        ${alt.length ? `<div class="mt-2 text-sm"><div class="text-gray-500 mb-1">Alt Lines</div>${alt.map(a=>`${a.market} ${a.type||""} ${a.line} (${a.odds || ""})`).join(" • ")}</div>`:""}
      </div>`;
  }).join("");
})();
