// src/components/DiagDots.jsx
import React, { useEffect, useState } from "react";

/**
 * DiagDots renders green/gray dots for endpoint health.
 * props.primary: [{ key, label, url }]
 * props.secondary: [{ key, label, url }]   // optional (e.g., Learning diagnostics)
 * props.titlePrimary, props.titleSecondary  // optional
 */
export default function DiagDots({
  primary = [],
  secondary = [],
  titlePrimary = "Diagnostics",
  titleSecondary = "Learning diagnostics",
  className = ""
}) {
  const [states, setStates] = useState({});

  useEffect(() => {
    let canceled = false;
    async function ping(items) {
      const out = {};
      await Promise.all(items.map(async it => {
        try {
          const res = await fetch(it.url, { method: "GET" });
          const text = await res.text();
          let ok = res.ok;
          try {
            const j = JSON.parse(text);
            if (typeof j.ok === "boolean") ok = ok && j.ok;
          } catch {}
          out[it.key] = { ok, text };
        } catch (e) {
          out[it.key] = { ok: false, text: String(e) };
        }
      }));
      return out;
    }
    (async () => {
      const items = [...primary, ...secondary];
      const results = await ping(items);
      if (!canceled) setStates(results);
    })();
    return () => { canceled = true; };
  }, [JSON.stringify(primary), JSON.stringify(secondary)]);

  const DotRow = ({ title, items }) => (
    <div className="mt-3">
      <div className="font-semibold mb-2">{title}</div>
      <div className="flex flex-wrap gap-4 items-center text-sm">
        {items.map((it) => {
          const st = states[it.key];
          const ok = st ? !!st.ok : false;
          return (
            <div key={it.key} className="flex items-center gap-2">
              <span
                title={ok ? "OK" : "Not OK"}
                style={{ width: 10, height: 10, borderRadius: 9999, display: "inline-block",
                         background: ok ? "#16a34a" : "#9ca3af" }}
              />
              <span>{it.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={"mt-8 p-3 border rounded-lg bg-white " + className}>
      {primary.length > 0 && <DotRow title={titlePrimary} items={primary} />}
      {secondary.length > 0 && <DotRow title={titleSecondary} items={secondary} />}
    </div>
  );
}
