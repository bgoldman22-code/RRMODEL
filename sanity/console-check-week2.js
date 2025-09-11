(async () => {
  const bust = Date.now();
  const get = (u) => fetch(u + (u.includes("?") ? "&" : "?") + "cb=" + bust).then(r => r.json());
  const CUR = await get("https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-get");
  const W2  = await get("https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-get?season=2025&week=2");

  const ok = (label, cond) => console[cond ? "log" : "error"](`${cond ? "✅" : "❌"} ${label}`);
  const eq = (a,b) => JSON.stringify(a)===JSON.stringify(b);

  const wantSEA = ["Jaxon Smith-Njigba","Cooper Kupp","Tory Horton","Cody White"];
  const wantPIT = ["DK Metcalf","Calvin Austin III","Ben Skowronek","Roman Wilson","Scotty Miller"];

  ok("W2 SEA.WR updated", eq(W2?.SEA?.WR, wantSEA));
  ok("CUR SEA.WR updated", eq(CUR?.SEA?.WR, wantSEA));

  ok("W2 PIT.WR includes DK Metcalf", W2?.PIT?.WR?.includes("DK Metcalf"));
  ok("CUR PIT.WR includes DK Metcalf", CUR?.PIT?.WR?.includes("DK Metcalf"));

  ok("W2 ATL.RB includes Nathan Carter", W2?.ATL?.RB?.includes("Nathan Carter"));
  ok("CUR ATL.RB includes Nathan Carter", CUR?.ATL?.RB?.includes("Nathan Carter"));

  ok("W2 IND.QB contains 'Anthony Richardson Sr.'", W2?.IND?.QB?.includes("Anthony Richardson Sr."));
  ok("CUR IND.QB contains 'Anthony Richardson Sr.'", CUR?.IND?.QB?.includes("Anthony Richardson Sr."));

  ok("W2 JAX.TE starts with Brenton Strange", W2?.JAX?.TE?.[0] === "Brenton Strange");
  ok("CUR JAX.TE starts with Brenton Strange", CUR?.JAX?.TE?.[0] === "Brenton Strange");

  console.log("W2 SEA:", W2?.SEA);
  console.log("CUR SEA:", CUR?.SEA);
})();