function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

export async function applyWeatherLite({ wx, baseProb }){
  // wx is an optional inline weather object; if not supplied, no-op.
  if (!wx) return { applied:false, wMul:1.0, explain:"" };
  const temp = Number(wx.tempF ?? 72);
  const wind = Number(wx.windMph ?? 0);
  const dir  = String(wx.windDeg ?? "").toString();
  const roof = String(wx.roof ?? "open").toLowerCase();

  if (roof === "closed") return { applied:false, wMul:1.0, explain:"roof closed" };

  // out-blowing heuristic if windDeg ~ 0–40 or 320–360 == out to CF
  const outFactor = (dir === "" ? 0 : ((dir >= 320 || dir <= 40) ? 1 : 0));
  const tempIx = clamp((temp - 72) * 0.002, -0.06, 0.08);
  const windIx = clamp(outFactor * wind * 0.006, 0, 0.10);
  const ix = clamp(tempIx + windIx, -0.12, 0.12);
  const wMul = clamp(1 + ix, 0.88, 1.12);
  const explain = `T=${Math.round(temp)}°F, wind=${wind}mph ${dir}°, roof=${roof}`;
  return { applied: Math.abs(ix) >= 0.005, wMul, explain };
}
