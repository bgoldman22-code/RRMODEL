import React from "react";
import useDiagJson from "../hooks/useDiagJson";

const Dot = ({ ok }) => (
  <span
    style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: ok ? "#22c55e" : "#ef4444",
      marginRight: 8,
      verticalAlign: "middle",
    }}
    aria-label={ok ? "ok" : "error"}
    title={ok ? "ok" : "error"}
  />
);

const Row = ({ label, ok, extra }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
    <Dot ok={ok} />
    <div style={{ fontWeight: 600, minWidth: 220 }}>{label}</div>
    <div style={{ opacity: 0.8 }}>{extra}</div>
  </div>
);

export default function HRDiagnosticsFooter() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: oddsDiag, ok: oddsOk } = useDiagJson("/.netlify/functions/odds-diag");
  const { data: predsDiag, ok: predsOk } = useDiagJson("/.netlify/functions/preds-diag");
  const { data: propsDiag, ok: propsOk } = useDiagJson("/.netlify/functions/props-diagnostics");
  const { data: propsStats, ok: statsOk } = useDiagJson("/.netlify/functions/props-stats?sport=mlb");

  const oddsExtra = oddsOk && oddsDiag ? `odds: ${oddsDiag?.store ?? "mlb-odds"} • provider: ${oddsDiag?.provider ?? oddsDiag?.source ?? "?"}` : "";
  const predsExtra = predsOk && predsDiag ? `model: ${predsDiag?.model ?? "?"}` : "";
  const propsExtra = propsOk && propsDiag ? `props blobs: ${propsDiag?.ok ? "ok" : "err"}` : "";
  const statsExtra = statsOk && propsStats
    ? `learn last: ${propsStats?.lastRun ?? "?"} • samples: ${propsStats?.samples ?? propsStats?.count ?? "?"}`
    : "";

  return (
    <div style={{ marginTop: 24, padding: 16, borderTop: "1px solid #e5e7eb", fontSize: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>
        Diagnostics • {today} (ET)
      </div>
      <Row label="OddsAPI MLB props" ok={!!oddsOk} extra={oddsExtra} />
      <Row label="HR model diagnostics" ok={!!predsOk} extra={predsExtra} />
      <Row label="Learning (props stores)" ok={!!propsOk} extra={propsExtra} />
      <Row label="Learning status (summary)" ok={!!statsOk} extra={statsExtra} />
      <div style={{ marginTop: 8, opacity: 0.7 }}>
        Green dot = endpoint returned 200 + parseable JSON; Red = error/non-200/parse failed.
      </div>
    </div>
  );
}
