import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const player = (searchParams.get("player") || "").trim();
  if (!player) return NextResponse.json({ ok:false, error:"Missing player" }, { status:400 });
  const profile = await fakeProfile(player);
  return NextResponse.json({ ok:true, profile });
}
async function fakeProfile(player: string) {
  return {
    player,
    baseline: { hr_per_pa: 0.032, last30_hr_pa: 0.045, hot_cold: "+1%" },
    battedBall: { ev_p50: 91.3, ev_p75: 104.7, ev_max: 111.2, la_p50: 14, la_p75: 22, hr_mode_la: "18–25°" },
    splits: { four_seam: { hr: 6, hr_pa: 0.028 }, slider: { hr: 2, hr_pa: 0.019 }, change: { hr: 1, hr_pa: 0.011 } },
    park: { home_factor_rhh: "+7%", home_hr_pa: 0.035, road_hr_pa: 0.029 },
    archetype: { tag: "LINE_DRIVE_POWER", confidence: 0.72 },
    why: "Line-drive HR profile; heaters at 105+ EV in the 18–25° band."
  };
}
