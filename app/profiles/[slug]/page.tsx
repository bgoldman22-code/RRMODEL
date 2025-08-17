async function getProfile(name: string) {
  const r = await fetch(`/api/profile?player=${encodeURIComponent(name)}`, { cache: "no-store" });
  return r.json();
}
export default async function ProfilePage({ params, searchParams }: any) {
  const slug = decodeURIComponent(params?.slug ?? "");
  const name = (searchParams?.player || slug).replace(/-/g, " ");
  const data = await getProfile(name);
  if (!data?.ok) return <div className="p-6">No profile for <b>{name}</b>.</div>;
  const p = data.profile;
  const Card = ({children}:{children:any}) => <section className="p-4 rounded-xl border border-zinc-800 my-3">{children}</section>;
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <div><h1 className="text-3xl font-bold">{p.player}</h1><p className="text-gray-400 text-sm">Hidden profile • read-only</p></div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><h2 className="font-semibold mb-2">Baseline</h2><ul className="text-sm leading-6">
          <li>Career HR/PA: <b>{(p.baseline?.hr_per_pa ?? 0).toFixed(3)}</b></li>
          <li>Last 30 HR/PA: <b>{(p.baseline?.last30_hr_pa ?? 0).toFixed(3)}</b></li>
          <li>Hot/Cold: <b>{p.baseline?.hot_cold ?? "—"}</b></li>
        </ul></Card>
        <Card><h2 className="font-semibold mb-2">Archetype</h2>
          <p className="text-sm"><b>{p.archetype?.tag ?? "—"}</b></p>
          <p className="text-xs text-gray-400">Confidence: {(p.archetype?.confidence ?? 0).toFixed(2)}</p>
        </Card>
      </div>
      <Card><h2 className="font-semibold mb-2">Batted-Ball Quality</h2><ul className="text-sm grid md:grid-cols-2 gap-2">
        <li>EV p50: <b>{p.battedBall?.ev_p50 ?? "—"}</b> mph</li>
        <li>EV p75: <b>{p.battedBall?.ev_p75 ?? "—"}</b> mph</li>
        <li>EV max: <b>{p.battedBall?.ev_max ?? "—"}</b> mph</li>
        <li>LA p50: <b>{p.battedBall?.la_p50 ?? "—"}</b>°</li>
        <li>LA p75: <b>{p.battedBall?.la_p75 ?? "—"}</b>°</li>
        <li>HR mode LA: <b>{p.battedBall?.hr_mode_la ?? "—"}</b></li>
      </ul></Card>
      <Card><h2 className="font-semibold mb-2">Pitch-Type HR Splits</h2><ul className="text-sm grid md:grid-cols-2 gap-2">
        <li>4-Seam: <b>{p.splits?.four_seam?.hr ?? 0}</b> HR • HR/PA {(p.splits?.four_seam?.hr_pa ?? 0).toFixed(3)}</li>
        <li>Slider: <b>{p.splits?.slider?.hr ?? 0}</b> HR • HR/PA {(p.splits?.slider?.hr_pa ?? 0).toFixed(3)}</li>
        <li>Changeup: <b>{p.splits?.change?.hr ?? 0}</b> HR • HR/PA {(p.splits?.change?.hr_pa ?? 0).toFixed(3)}</li>
      </ul></Card>
      <Card><h2 className="font-semibold mb-2">Park Context</h2><ul className="text-sm grid md:grid-cols-2 gap-2">
        <li>Home HR factor (handed): <b>{p.park?.home_factor_rhh ?? p.park?.home_factor_lhh ?? "—"}</b></li>
        <li>Home HR/PA: <b>{(p.park?.home_hr_pa ?? 0).toFixed(3)}</b></li>
        <li>Road HR/PA: <b>{(p.park?.road_hr_pa ?? 0).toFixed(3)}</b></li>
      </ul></Card>
      <Card><h2 className="font-semibold mb-2">WHY</h2><p className="text-sm">{p.why || "—"}</p></Card>
    </div>
  );
}
