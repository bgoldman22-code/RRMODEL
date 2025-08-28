// netlify/functions/odds-seed-demo.js
// Seeds a small demo odds snapshot to your blobs store as latest.json
// Use this only for testing the Parlays page when live odds aren't ready.
const { getStore } = require('./_blobs.js');

function initStore(){
  const name = process.env.BLOBS_STORE || 'mlb-odds'; // must match odds-get/odds-refresh
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

exports.handler = async () => {
  try {
    const store = initStore();
    const demo = [
      // MLB HR example
      { id: "Shohei Ohtani|MLB HR 0.5+|G123|DK", player: "Shohei Ohtani", market: "MLB HR 0.5+", game_id: "G123", book: "DK", american: +300 },
      { id: "Aaron Judge|MLB HR 0.5+|G124|DK",  player: "Aaron Judge",  market: "MLB HR 0.5+", game_id: "G124", book: "DK", american: +280 },
      // NBA rebounds example
      { id: "Nikola Jokic|NBA Rebounds 9.5+|N987|FD", player: "Nikola Jokic", market: "NBA Rebounds 9.5+", game_id: "N987", book: "FD", american: -120 },
      { id: "Anthony Davis|NBA Rebounds 9.5+|N988|FD", player: "Anthony Davis", market: "NBA Rebounds 9.5+", game_id: "N988", book: "FD", american: +110 },
      // NFL TD example
      { id: "Travis Kelce|NFL Anytime TD|F555|MG", player: "Travis Kelce", market: "NFL Anytime TD", game_id: "F555", book: "MG", american: +130 },
      { id: "Christian McCaffrey|NFL Anytime TD|F556|MG", player: "Christian McCaffrey", market: "NFL Anytime TD", game_id: "F556", book: "MG", american: -105 }
    ];
    // Store shape can be array or {offers:[...]} — use offers for consistency with odds-get
    const blob = JSON.stringify({ offers: demo });
    await store.set('latest.json', blob, { contentType: 'application/json' });
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, wrote: 'latest.json', count: demo.length }) };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};
