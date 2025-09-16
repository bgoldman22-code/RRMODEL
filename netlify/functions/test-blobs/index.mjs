// netlify/functions/test-blobs/index.mjs
import { getStore } from '@netlify/blobs';

export default async (request, context) => {
  try {
    const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
    const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
    const siteID = process.env.NETLIFY_SITE_ID;
    
    console.log('Debug info:', { storeName, hasToken: !!token, hasSiteID: !!siteID });
    
    let store;
    if (token && siteID) {
      store = getStore({
        name: storeName,
        siteID: siteID,
        token: token
      });
    } else {
      store = getStore(storeName);
    }
    
    const data = await store.get('nfl/epa/latest.json');
    
    return new Response(JSON.stringify({
      success: true,
      hasData: !!data,
      storeName: storeName,
      hasToken: !!token,
      hasSiteID: !!siteID,
      configUsed: token && siteID ? 'explicit' : 'auto',
      dataKeys: data ? Object.keys(JSON.parse(await data.text())) : null
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
