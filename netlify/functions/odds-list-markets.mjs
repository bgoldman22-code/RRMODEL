// netlify/functions/odds-list-markets.mjs
export const handler = async () => {
  try {
    // Return configured markets from env to avoid provider 404s
    const env = (name, def="") => (process.env[name] ?? def);
    const out = {
      ok: true,
      source: "env",
      markets: {
        hr: env("ODDS_HR_MARKETS", "batter_home_runs,batter_home_runs_alternate").split(',').filter(Boolean),
        hits: env("ODDSMARKET_HITS", "batter_hits_alternate").split(',').filter(Boolean),
        hrr: env("ODDSMARKET_HRR_MULTI", "batter_hits_runs_rbis,batter_hits_runs_rbis_alternate").split(',').filter(Boolean),
      }
    };
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
};
