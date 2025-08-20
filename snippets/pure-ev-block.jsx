{/* --- Pure EV (with probability floor) --- */}
{Array.isArray(pureEV) && pureEV.length > 0 && (
  <div className="mt-8">
    <h2 className="text-lg font-semibold">
      Best EV (floor ≥ {(Number(import.meta.env.VITE_PURE_EV_FLOOR ?? 0.22) * 100).toFixed(0)}% model HR)
    </h2>
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="px-3 py-2 text-left">Player</th>
            <th className="px-3 py-2 text-left">Game</th>
            <th className="px-3 py-2 text-right">Model HR%</th>
            <th className="px-3 py-2 text-right">Model Odds</th>
            <th className="px-3 py-2 text-right">Actual Odds</th>
            <th className="px-3 py-2 text-right">EV (1u)</th>
            <th className="px-3 py-2 text-left">Why</th>
          </tr>
        </thead>
        <tbody>
          {pureEV.map((r, i) => (
            <tr key={`pureev-${i}`} className="border-b">
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2">{r.game}</td>
              <td className="px-3 py-2 text-right">{(r.p_model * 100).toFixed(1)}%</td>
              <td className="px-3 py-2 text-right">{r.modelAmerican > 0 ? `+${r.modelAmerican}` : r.modelAmerican}</td>
              <td className="px-3 py-2 text-right">{r.american > 0 ? `+${r.american}` : r.american}</td>
              <td className="px-3 py-2 text-right">{Number(r.ev ?? 0).toFixed(3)}</td>
              <td className="px-3 py-2">{r.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2">
        EV(1u) = p·(decimal−1) − (1−p). Uses book odds when available, else model odds.
      </p>
    </div>
  </div>
)}
