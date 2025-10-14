/**
 * Minimal NBA test - no imports, no dependencies
 */

export default async (request, context) => {
  return new Response(JSON.stringify({
    ok: true,
    message: "NBA function works!",
    timestamp: new Date().toISOString(),
    branch: "main41",
    test: "minimal"
  }), {
    status: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
};
