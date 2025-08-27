// netlify/functions/ping.js
export const handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      name: "ping",
      method: event.httpMethod,
      query: event.queryStringParameters || {},
      now: new Date().toISOString()
    })
  };
};
