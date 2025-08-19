
// netlify/functions/nfl-anytime-td-candidates.mjs
export async function handler(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      candidates: [],
      info: { games: 16, mode: "week" }
    })
  };
}
