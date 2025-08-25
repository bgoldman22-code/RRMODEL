import { getStore } from '@netlify/blobs';

export function getOptionalStore(nameEnvVarFallbacks = []) {
  // Try Netlify Blobs first (runtime)
  try{
    const envName = nameEnvVarFallbacks.find(n => process.env[n]);
    const storeName = envName ? process.env[envName] : null;
    if (storeName) {
      return getStore({ name: storeName });
    }
  }catch(e){
    // ignore and fall back
  }
  return null;
}

export async function putJSON(store, key, value){
  if(!store) return;
  try{
    await store.setJSON(key, value);
  }catch(e){
    // ignore
  }
}
export async function getJSON(store, key){
  if(!store) return null;
  try{
    return await store.get(key, { type: 'json' });
  }catch(e){
    return null;
  }
}