// netlify/functions/nfl-game-predict.mjs
import { loadModels } from "./_ml/nfl-model.mjs";
import { buildGameFeatures } from "./_ml/features-nfl.mjs";

export default async (req, context) => {
  try {
    const { season, week, home, away } = req.queryStringParameters || {};
    if (!season || !week || !home || !away) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required params: season, week, home, away" }), { status: 400 });
    }
    const { ml, sp } = await loadModels();
    const x = await buildGameFeatures({ season: +season, week: +week, home, away });

    const pHome = ml.predictProba(x);
    const spread_pred = sp.predict(x); // + = home margin

    return new Response(JSON.stringify({
      ok: true,
      season: +season, week: +week, home, away,
      features_used: Object.keys(x).length,
      money_line_prediction: pHome >= 0.5 ? "Home Win" : "Away Win",
      prob_home_win: +pHome.toFixed(4),
      spread_pred: +spread_pred.toFixed(2),
    }), { headers: { "content-type": "application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.stack || e) }), { status: 500 });
  }
}
