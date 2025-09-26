async function lookup() {
  const name = document.getElementById("name").value.trim();
  const out = document.getElementById("out1");
  out.textContent = "Loading…";
  try {
    const resp = await fetch(`/.netlify/functions/odds-lookup?name=${encodeURIComponent(name)}`);
    const j = await resp.json();
    out.textContent = JSON.stringify(j, null, 2);
  } catch (e) {
    out.textContent = String(e);
  }
}

async function scan() {
  const names = document.getElementById("names").value.split(",").map(s=>s.trim()).filter(Boolean);
  const out = document.getElementById("out2");
  out.textContent = "Loading…";
  try {
    const resp = await fetch(`/.netlify/functions/odds-scan-missing`, {
      method:"POST",
      headers:{"content-type":"application/json"},
      body: JSON.stringify({ names })
    });
    const j = await resp.json();
    out.textContent = JSON.stringify(j, null, 2);
  } catch (e) {
    out.textContent = String(e);
  }
}

document.getElementById("btnLookup").addEventListener("click", lookup);
document.getElementById("btnScan").addEventListener("click", scan);
