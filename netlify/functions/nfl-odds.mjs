
// netlify/functions/nfl-odds.mjs
export async function handler(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      props: [],
      meta: {
        sport: "americanfootball_nfl",
        markets: ["player_anytime_td", "player_touchdown_anytime"]
      }
    })
  };
}
