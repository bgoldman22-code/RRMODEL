// netlify/functions/_lib/extensions-weather.mjs
export async function weatherMultiplier(row) {
  const w = row?.meta?.weatherInline || row?.weather || null;
  if (!w) return { mul: 1.0, applied: false };
  const roof = (w.roof || "").toLowerCase();
  if (roof === "closed") return { mul: 1.0, applied: false, explain: "roof=closed" };
  const t = Number(w.tempF ?? w.temperatureF ?? 0) || 0;
  const windMph = Number(w.windMph ?? 0) || 0;
  const windOut = (typeof w.windOut === "boolean") ? w.windOut : null;
  let tempAdj = (t ? (t - 70) * 0.003 : 0);
  tempAdj = Math.max(-0.06, Math.min(0.06, tempAdj));
  let windAdj = 0;
  if (windOut !== null) {
    windAdj = (windMph * (windOut ? 1 : -1)) * 0.006;
    windAdj = Math.max(-0.06, Math.min(0.06, windAdj));
  }
  let total = tempAdj + windAdj;
  total = Math.max(-0.12, Math.min(0.12, total));
  const mul = Math.max(0.88, Math.min(1.12, 1 + total));
  const pieces = [];
  if (t) pieces.push(`T=${Math.round(t)}°F`);
  if (windMph && windOut !== null) pieces.push(`wind ${Math.round(windMph)}mph ${windOut ? "out" : "in"}`);
  if (roof) pieces.push(`roof=${roof}`);
  return { mul, applied: Math.abs(mul-1)>0.001, explain: pieces.join(", ") };
}
