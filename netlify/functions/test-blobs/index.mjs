// netlify/functions/test-blobs/index.mjs
import { nflBlobsGetJSON } from '../_lib/blobs-nfl.js';

export default async (request, context) => {
  try {
    const data = await nflBlobsGetJSON('nfl/epa/latest.json');
    return new Response(JSON.stringify({
      success: true,
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : null,
      sampleData: data ? { version: data.version, asOf: data.asOf } : null
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
