/**
 * odds-get.js
 * Netlify function: merges TheOddsAPI feeds with local MLB props blobs
 */

const fs = require("fs");
const path = require("path");

exports.handler = async () => {
  try {
    const latestPath = path.join("/tmp", "latest.json");
    const storePath = path.join(__dirname, "mlb-odds", "latest.json");
    let offers = [];

    // Load the core odds (if present)
    try {
      const raw = fs.readFileSync(storePath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.offers)) offers = data.offers;
    } catch (err) {
      console.error("No core odds found", err);
    }

    // Merge MLB props blobs (if present)
    const propsDir = path.join(__dirname, "mlb-odds", "props");
    if (fs.existsSync(propsDir)) {
      const files = fs.readdirSync(propsDir).filter(f => f.endsWith(".json"));
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(propsDir, f), "utf8");
          const data = JSON.parse(raw);
          if (Array.isArray(data.offers)) {
            offers.push(...data.offers);
          } else if (data.players) {
            // Convert players{} map to offers[]
            for (const [player, markets] of Object.entries(data.players)) {
              for (const [market, legs] of Object.entries(markets)) {
                legs.forEach(leg => {
                  offers.push({ ...leg, sport: "baseball_mlb", market, player });
                });
              }
            }
          }
        } catch (err) {
          console.error("Props blob parse failed", f, err);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, offers }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
