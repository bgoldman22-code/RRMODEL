import { makeStore } from "./_lib/blobs-helper.mjs";

export async function handler(event) {
  const noblobs = event.queryStringParameters?.noblobs === '1';
  let store = noblobs ? null : makeStore();
  try {
    if (!store) {
      return new Response(JSON.stringify({ ok:true, keys:{ blobs:[], directories:[] }, note:"noblobs" }), { status:200 });
    }
    const keys = await store.list();
    return new Response(JSON.stringify({ ok:true, keys }), { status:200 });
  } catch (err) {
    return new Response(JSON.stringify({ ok:false, error:String(err) }), { status:500 });
  }
}
