import useSWR from "swr";
import { useRouter } from "next/router";
const fetcher = (url:string)=>fetch(url).then(r=>r.json());
export default function ProfilePage(){
  const router = useRouter();
  const slug = (router.query.slug as string)||"";
  const name = (router.query.player as string) || slug.replace(/-/g," ");
  const { data } = useSWR(name?`/api/profile?player=${encodeURIComponent(name)}`:null, fetcher);
  if (!data) return <div style={{padding:24}}>Loading…</div>;
  if (!data.ok) return <div style={{padding:24}}>No profile for <b>{name}</b>.</div>;
  const p = data.profile;
  const Card = (props:any)=>(<section style={{border:"1px solid #333", borderRadius:12, padding:12, marginTop:12}}>{props.children}</section>);
  return (<div style={{maxWidth:900, margin:"0 auto", padding:24}}>
    <h1 style={{fontWeight:700, fontSize:28}}>{p.player}</h1><p style={{opacity:0.7}}>Hidden profile • read-only</p>
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12}}>
      <Card><h2>Baseline</h2><ul><li>Career HR/PA: <b>{(p.baseline?.hr_per_pa ?? 0).toFixed(3)}</b></li>
      <li>Last 30 HR/PA: <b>{(p.baseline?.last30_hr_pa ?? 0).toFixed(3)}</b></li>
      <li>Hot/Cold: <b>{p.baseline?.hot_cold ?? "—"}</b></li></ul></Card>
      <Card><h2>Archetype</h2><p><b>{p.archetype?.tag ?? "—"}</b></p>
      <p style={{opacity:0.7}}>Confidence: {(p.archetype?.confidence ?? 0).toFixed(2)}</p></Card>
    </div>
    <Card><h2>Batted-Ball Quality</h2><ul style={{columns:2}}>
      <li>EV p50: <b>{p.battedBall?.ev_p50 ?? "—"}</b> mph</li>
      <li>EV p75: <b>{p.battedBall?.ev_p75 ?? "—"}</b> mph</li>
      <li>EV max: <b>{p.battedBall?.ev_max ?? "—"}</b> mph</li>
      <li>LA p50: <b>{p.battedBall?.la_p50 ?? "—"}</b>°</li>
      <li>LA p75: <b>{p.battedBall?.la_p75 ?? "—"}</b>°</li>
      <li>HR mode LA: <b>{p.battedBall?.hr_mode_la ?? "—"}</b></li>
    </ul></Card>
    <Card><h2>Pitch-Type HR Splits</h2><ul style={{columns:2}}>
      <li>4-Seam: <b>{p.splits?.four_seam?.hr ?? 0}</b> HR • HR/PA {(p.splits?.four_seam?.hr_pa ?? 0).toFixed(3)}</li>
      <li>Slider: <b>{p.splits?.slider?.hr ?? 0}</b> HR • HR/PA {(p.splits?.slider?.hr_pa ?? 0).toFixed(3)}</li>
      <li>Changeup: <b>{p.splits?.change?.hr ?? 0}</b> HR • HR/PA {(p.splits?.change?.hr_pa ?? 0).toFixed(3)}</li>
    </ul></Card>
    <Card><h2>Park Context</h2><ul style={{columns:2}}>
      <li>Home HR factor (handed): <b>{p.park?.home_factor_rhh ?? p.park?.home_factor_lhh ?? "—"}</b></li>
      <li>Home HR/PA: <b>{(p.park?.home_hr_pa ?? 0).toFixed(3)}</b></li>
      <li>Road HR/PA: <b>{(p.park?.road_hr_pa ?? 0).toFixed(3)}</b></li>
    </ul></Card>
    <Card><h2>WHY</h2><p>{p.why || "—"}</p></Card>
  </div>);
}
