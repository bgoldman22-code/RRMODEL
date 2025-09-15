import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
const links = [
  ["/.netlify/functions/odds-status", "Odds/Model Status"],
  ["/.netlify/functions/nfl-schedule-get?force=1", "Get Schedule (odds fallback)"],
  ["/.netlify/functions/nfl-train?season=2025&force=1", "Train 2025 (persist if Blobs)"],
  ["/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1", "Train 2022-2025 (persist if Blobs)"],
  ["/.netlify/functions/nfl-predictions-generate?force=1", "Generate Predictions (force)"],
  ["/.netlify/functions/nfl-predictions-diag", "Predictions Diag (one row)"]
];
const html = `<!doctype html><html><head><meta charset="utf-8"><title>RRModel — debug</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:32px;line-height:1.45}h1{margin-bottom:0.5rem}code,pre{background:#f5f5f5;padding:2px 6px;border-radius:6px}a{display:block;margin:.35rem 0;color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}.env{margin-top:1rem;font-size:.95rem;color:#374151}</style></head><body><h1>RRModel — Debug links</h1>${links.map(([href,label])=>`<a href="${href}">${label}</a>`).join('')}<div class="env"><p><b>Store:</b> <code>${process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td'}</code></p><p><b>Node:</b> <code>${process.version}</code></p></div><hr/><p>If your main front end isn’t built here, this page just gives you copy‑paste links for sanity checks.</p></body></html>`;
if (!existsSync("dist")) { await mkdir("dist", { recursive: true }); }
await writeFile("dist/index.html", html);
console.log("[BUILD] wrote dist/index.html");
